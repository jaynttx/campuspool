from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..helpers import commit_and_push, notify
from ..models import Ride, RideRating, RideRequest, User
from ..ratelimit import enforce
from ..relations import blocked_pair

router = APIRouter(tags=["ratings"])


class RatingIn(BaseModel):
    rateeId: int
    stars: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=300)


@router.post("/rides/{ride_id}/ratings")
def rate_ride_partner(ride_id: int, body: RatingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """After a completed ride, riders rate the creator and the creator rates each rider. One rating per pair per ride."""
    enforce(f"rate:{user.id}", 30, 3600, "You are rating too fast. Try again later.")
    ride = db.get(Ride, ride_id)
    if ride is None:
        raise HTTPException(404, "That ride is no longer available to rate.")
    if ride.status != "COMPLETED":
        raise HTTPException(409, "You can rate once the ride is completed.")
    riders = set(db.scalars(select(RideRequest.requester_id).where(RideRequest.ride_id == ride.id, RideRequest.status == "ACCEPTED")).all())
    members = riders | {ride.creator_id}
    if user.id not in members or body.rateeId not in members or body.rateeId == user.id:
        raise HTTPException(403, "You can only rate people who were on this ride.")
    if ride.creator_id not in (user.id, body.rateeId):
        raise HTTPException(403, "Riders rate the creator, and the creator rates each rider.")
    if blocked_pair(db, user.id, body.rateeId):
        raise HTTPException(403, "You cannot rate this student.")
    ratee = db.get(User, body.rateeId)
    if ratee is None:
        raise HTTPException(404, "That student has left CampusPool.")
    db.add(
        RideRating(
            ride_id=ride.id,
            ride_title=f"Ride to {ride.destination}"[:160],
            rater_id=user.id,
            ratee_id=ratee.id,
            stars=body.stars,
            comment=(body.comment or "").strip() or None,
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You already rated this person for this ride.") from None
    notify(db, ratee.id, f"You received {body.stars} out of 5 for the ride to {ride.destination}.", "/profile")
    commit_and_push(db, [user.id, ratee.id])
    return {"ok": True}
