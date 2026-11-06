from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Activity, ActivityRequest, Feedback, HiddenItem, Notification, Payment, Report, Ride, RideRequest, User
from ..ratelimit import enforce
from ..views import build_bootstrap

router = APIRouter(tags=["misc"])


class ReportIn(BaseModel):
    kind: Literal["ride", "activity"]
    targetId: int
    reason: str = Field(min_length=3, max_length=500)


class ReadIn(BaseModel):
    id: int | None = None  # omit to mark everything read


@router.get("/bootstrap")
def bootstrap(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return build_bootstrap(db, user)


@router.post("/reports")
def file_report(body: ReportIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    enforce(f"report:{user.id}", 20, 3600, "You have sent many reports. Try again later.")
    if body.kind == "ride":
        ride = db.get(Ride, body.targetId)
        title = f"Ride to {ride.destination}" if ride else None
    else:
        act = db.get(Activity, body.targetId)
        title = act.title if act else None
    if title is None:
        raise HTTPException(404, "That post no longer exists.")
    db.add(Report(reporter_id=user.id, kind=body.kind, target_id=body.targetId, target_title=title[:160], reason=body.reason.strip()))
    db.commit()
    return {"ok": True}


@router.post("/notifications/read")
def read_notifications(body: ReadIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    q = update(Notification).where(Notification.user_id == user.id)
    if body.id is not None:
        q = q.where(Notification.id == body.id)
    db.execute(q.values(read=True))
    db.commit()
    return {"ok": True}


class HideIn(BaseModel):
    kind: Literal["ride", "activity"]
    targetId: int


@router.post("/hide")
def hide_item(body: HideIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Removes a finished ride or activity from this student's own lists. Other people still see it."""
    if body.kind == "ride":
        ride = db.get(Ride, body.targetId)
        if ride is None:
            raise HTTPException(404, "That ride is already gone.")
        asked = db.scalar(select(RideRequest.id).where(RideRequest.ride_id == ride.id, RideRequest.requester_id == user.id).limit(1)) is not None
        if ride.creator_id != user.id and not asked:
            raise HTTPException(404, "That ride is already gone.")
        if ride.status not in ("COMPLETED", "CANCELLED"):
            raise HTTPException(409, "Only finished rides can be removed from your list.")
        owed = select(Payment.id).where(Payment.ride_id == ride.id, Payment.status == "PENDING")
        if ride.creator_id != user.id:
            owed = owed.where(Payment.payer_id == user.id)
        if db.scalar(owed.limit(1)) is not None:
            raise HTTPException(409, "Settle the payment first, then you can remove this ride.")
    else:
        act = db.get(Activity, body.targetId)
        if act is None:
            raise HTTPException(404, "That activity is already gone.")
        asked = db.scalar(select(ActivityRequest.id).where(ActivityRequest.activity_id == act.id, ActivityRequest.requester_id == user.id).limit(1)) is not None
        if act.creator_id != user.id and not asked:
            raise HTTPException(404, "That activity is already gone.")
        if act.status not in ("COMPLETED", "CANCELLED"):
            raise HTTPException(409, "Only finished activities can be removed from your list.")
    exists = db.scalar(select(HiddenItem.id).where(HiddenItem.user_id == user.id, HiddenItem.kind == body.kind, HiddenItem.target_id == body.targetId))
    if exists is None:
        db.add(HiddenItem(user_id=user.id, kind=body.kind, target_id=body.targetId))
        db.commit()
    return {"ok": True}


class FeedbackIn(BaseModel):
    category: Literal["bug", "idea", "praise", "other"]
    rating: int | None = Field(default=None, ge=1, le=5)
    message: str = Field(min_length=5, max_length=1000)


@router.post("/feedback")
def send_feedback(body: FeedbackIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    enforce(f"fb:{user.id}", 10, 86400, "You have sent a lot of feedback today. Thank you. Try again tomorrow.")
    db.add(Feedback(user_id=user.id, category=body.category, rating=body.rating, message=body.message.strip()))
    db.commit()
    return {"ok": True}
