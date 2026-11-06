import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import as_utc, get_current_user
from ..helpers import accepted_count_ride, commit_and_push, lock_ride, notify
from ..models import Payment, Ride, RideRequest, User, utcnow
from ..money import individual_share, money
from ..ratelimit import enforce
from ..relations import blocked_pair, is_restricted

router = APIRouter(tags=["rides"])


class RideIn(BaseModel):
    source: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=120)
    departsAt: datetime
    totalSeats: int = Field(ge=1, le=6)
    expectedFare: float = Field(gt=0, le=100000)
    note: str | None = Field(default=None, max_length=300)
    srcLat: float | None = Field(default=None, ge=-90, le=90)
    srcLng: float | None = Field(default=None, ge=-180, le=180)
    dstLat: float | None = Field(default=None, ge=-90, le=90)
    dstLng: float | None = Field(default=None, ge=-180, le=180)
    repeatAt: list[datetime] = Field(default_factory=list, max_length=11)  # extra departure times for a repeating series


class DecideIn(BaseModel):
    approve: bool


class CompleteIn(BaseModel):
    actualFare: float = Field(gt=0, le=100000)


def _creator_only(ride: Ride, user: User) -> None:
    if ride.creator_id != user.id:
        raise HTTPException(403, "Only the ride creator can do this.")


@router.post("/rides")
def create_ride(body: RideIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    when = [body.departsAt, *body.repeatAt]
    for _ in when:
        enforce(f"post:{user.id}", 20, 3600, "You are posting too fast. Try again later.")
    if any(w.tzinfo is None for w in when):
        raise HTTPException(422, "Departure time must include a timezone.")
    times = sorted({as_utc(w) for w in when})
    now = utcnow()
    if times[0] < now - timedelta(minutes=1):
        raise HTTPException(422, "The departure time has already passed.")
    if times[-1] > now + timedelta(days=60):
        raise HTTPException(422, "Rides can be posted up to 60 days ahead.")
    coords = [body.srcLat, body.srcLng, body.dstLat, body.dstLng]
    if any(c is not None for c in coords) and any(c is None for c in coords):
        raise HTTPException(422, "Give both map points or neither.")
    source, destination = body.source.strip(), body.destination.strip()
    if not source or not destination:
        raise HTTPException(422, "Add a pickup point and a destination.")
    series = secrets.token_hex(8) if len(times) > 1 else None
    created = []
    for t in times:
        ride = Ride(
            creator_id=user.id,
            source=source,
            destination=destination,
            departs_at=t,
            total_seats=body.totalSeats,
            expected_fare=money(body.expectedFare),
            note=(body.note or "").strip() or None,
            src_lat=body.srcLat,
            src_lng=body.srcLng,
            dst_lat=body.dstLat,
            dst_lng=body.dstLng,
            series_id=series,
        )
        db.add(ride)
        created.append(ride)
    db.flush()
    ids = [str(r.id) for r in created]
    commit_and_push(db, everyone=True)
    return {"id": ids[0], "ids": ids}


@router.post("/rides/{ride_id}/request")
def request_seat(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    ride = lock_ride(db, ride_id)
    if blocked_pair(db, ride.creator_id, user.id):
        raise HTTPException(404, "Ride not found. It may have expired.")  # a block is never revealed
    if ride.creator_id == user.id:
        raise HTTPException(400, "This is your own ride.")
    if ride.status != "PENDING":
        raise HTTPException(409, "This ride is no longer open.")
    if as_utc(ride.departs_at) < utcnow():
        raise HTTPException(409, "This ride has already left.")
    existing = db.scalar(
        select(RideRequest).where(RideRequest.ride_id == ride.id, RideRequest.requester_id == user.id, RideRequest.status.in_(("PENDING", "ACCEPTED")))
    )
    if existing is not None:
        raise HTTPException(409, "You already joined this ride." if existing.status == "ACCEPTED" else "You already sent a request.")
    if accepted_count_ride(db, ride.id) >= ride.total_seats:
        raise HTTPException(409, "No seats left on this ride.")
    db.add(RideRequest(ride_id=ride.id, requester_id=user.id))
    if not is_restricted(db, ride.creator_id, user.id):  # restricted students reach the creator quietly
        notify(db, ride.creator_id, f"{user.name} asked to join your ride to {ride.destination}.", f"/rides/{ride.id}", "notifyIncoming")
    commit_and_push(db, [user.id, ride.creator_id])
    return {"ok": True}


@router.post("/ride-requests/{request_id}/decide")
def decide_request(request_id: int, body: DecideIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    req = db.get(RideRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found.")
    ride = lock_ride(db, req.ride_id)
    _creator_only(ride, user)
    db.refresh(req)
    if req.status != "PENDING":
        raise HTTPException(409, "This request was already decided.")
    if ride.status != "PENDING":
        raise HTTPException(409, "This ride is closed.")
    if body.approve and accepted_count_ride(db, ride.id) >= ride.total_seats:
        raise HTTPException(409, "No seats left. Decline the request or cancel the ride.")
    req.status = "ACCEPTED" if body.approve else "REJECTED"
    notify(db, req.requester_id, f"{user.name} {'accepted' if body.approve else 'declined'} your request for the ride to {ride.destination}.", f"/rides/{ride.id}", "notifyAnswers")
    commit_and_push(db, [user.id, req.requester_id])
    return {"ok": True}


@router.post("/rides/{ride_id}/start")
def start_ride(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    ride = lock_ride(db, ride_id)
    _creator_only(ride, user)
    if ride.status != "PENDING":
        raise HTTPException(409, "Only an open ride can be started.")
    ride.status = "ONGOING"
    commit_and_push(db, [user.id])
    return {"ok": True}


@router.post("/rides/{ride_id}/cancel")
def cancel_ride(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    ride = lock_ride(db, ride_id)
    _creator_only(ride, user)
    if ride.status not in ("PENDING", "ONGOING"):
        raise HTTPException(409, "This ride can no longer be cancelled.")
    ride.status = "CANCELLED"
    affected = db.scalars(select(RideRequest).where(RideRequest.ride_id == ride.id, RideRequest.status.in_(("PENDING", "ACCEPTED")))).all()
    for q in affected:
        notify(db, q.requester_id, f"{user.name} cancelled the ride to {ride.destination}.", f"/rides/{ride.id}", "notifyAnswers")
    db.execute(update(RideRequest).where(RideRequest.ride_id == ride.id, RideRequest.status == "PENDING").values(status="REJECTED"))
    commit_and_push(db, [user.id, *[q.requester_id for q in affected]])
    return {"ok": True}


@router.post("/rides/{ride_id}/complete")
def complete_ride(ride_id: int, body: CompleteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    ride = lock_ride(db, ride_id)
    _creator_only(ride, user)
    if ride.status not in ("PENDING", "ONGOING"):
        raise HTTPException(409, "This ride is already finished.")
    fare = money(body.actualFare)
    rider_ids = [q.requester_id for q in db.scalars(select(RideRequest).where(RideRequest.ride_id == ride.id, RideRequest.status == "ACCEPTED")).all()]
    share = individual_share(fare, len(rider_ids) + 1)
    ride.status = "COMPLETED"
    ride.actual_fare = fare
    ride.completed_at = datetime.now(timezone.utc)
    db.execute(update(RideRequest).where(RideRequest.ride_id == ride.id, RideRequest.status == "PENDING").values(status="REJECTED"))
    for rid in rider_ids:
        db.add(Payment(ride_id=ride.id, payer_id=rid, amount=share))
        notify(db, rid, f"Your ride to {ride.destination} is complete. Your share is ₹{share}. Pay {user.name} directly by UPI.", f"/rides/{ride.id}", "notifyAnswers")
    commit_and_push(db, [user.id, *rider_ids])
    return {"ok": True, "share": float(share), "participants": len(rider_ids) + 1}


@router.post("/payments/{payment_id}/mark-paid")
def mark_paid(payment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    pay = db.get(Payment, payment_id)
    if pay is None or pay.payer_id != user.id:
        raise HTTPException(404, "Payment not found.")
    if pay.status != "PENDING":
        raise HTTPException(409, "This payment is already settled.")
    ride = db.get(Ride, pay.ride_id)
    pay.rider_marked_paid = True
    if ride:
        notify(db, ride.creator_id, f"{user.name} says they paid ₹{pay.amount} for the ride to {ride.destination}. Confirm once the money arrives.", f"/rides/{ride.id}", "notifyIncoming")
    commit_and_push(db, [user.id, ride.creator_id if ride else user.id])
    return {"ok": True}


@router.post("/payments/{payment_id}/confirm")
def confirm_payment(payment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    pay = db.get(Payment, payment_id)
    ride = db.get(Ride, pay.ride_id) if pay else None
    if pay is None or ride is None or ride.creator_id != user.id:
        raise HTTPException(404, "Payment not found.")
    if pay.status != "PENDING":
        raise HTTPException(409, "This payment is already confirmed.")
    pay.status = "SUCCESS"
    pay.rider_marked_paid = True
    pay.paid_at = datetime.now(timezone.utc)
    notify(db, pay.payer_id, f"{user.name} confirmed your payment for the ride to {ride.destination}.", f"/rides/{ride.id}", "notifyAnswers")
    commit_and_push(db, [user.id, pay.payer_id])
    return {"ok": True}


@router.delete("/rides/{ride_id}")
def remove_ride(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    ride = lock_ride(db, ride_id)
    _creator_only(ride, user)
    if ride.status not in ("COMPLETED", "CANCELLED"):
        raise HTTPException(409, "Complete or cancel the ride before removing it.")
    unsettled = db.scalar(select(Payment.id).where(Payment.ride_id == ride.id, Payment.status == "PENDING").limit(1))
    if unsettled is not None:
        raise HTTPException(409, "Confirm every rider's payment first. Removing the ride would erase the record of who owes what.")
    db.delete(ride)
    commit_and_push(db, everyone=True)
    return {"ok": True}


@router.post("/rides/{ride_id}/cancel-series")
def cancel_series(ride_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Cancels this ride and every later open ride created together with it."""
    ride = lock_ride(db, ride_id)
    _creator_only(ride, user)
    if not ride.series_id:
        raise HTTPException(409, "This ride is not part of a repeating series.")
    rides = db.scalars(
        select(Ride).where(Ride.series_id == ride.series_id, Ride.creator_id == user.id, Ride.status.in_(("PENDING", "ONGOING")), Ride.departs_at >= ride.departs_at).with_for_update()
    ).all()
    touched: list[int] = [user.id]
    for r in rides:
        r.status = "CANCELLED"
        affected = db.scalars(select(RideRequest).where(RideRequest.ride_id == r.id, RideRequest.status.in_(("PENDING", "ACCEPTED")))).all()
        for q in affected:
            notify(db, q.requester_id, f"{user.name} cancelled the ride to {r.destination}.", f"/rides/{r.id}", "notifyAnswers")
            touched.append(q.requester_id)
        db.execute(update(RideRequest).where(RideRequest.ride_id == r.id, RideRequest.status == "PENDING").values(status="REJECTED"))
    commit_and_push(db, touched)
    return {"ok": True, "cancelled": len(rides)}
