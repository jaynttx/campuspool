from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..crypto import encrypt_text
from ..db import get_db
from ..deps import as_utc, get_current_user
from ..helpers import accepted_count_activity, commit_and_push, lock_activity, notify
from ..ratelimit import enforce
from ..relations import blocked_pair, is_restricted
from ..models import Activity, ActivityMessage, ActivityRequest, User, utcnow

router = APIRouter(tags=["activities"])

ActivityType = Literal["SPORTS", "WALK", "GYM", "FOOD", "MOVIE", "STUDY", "HANGOUT", "OTHER"]


class ActivityIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    type: ActivityType
    location: str = Field(min_length=1, max_length=120)
    startsAt: datetime
    description: str = Field(default="", max_length=500)
    maxParticipants: int = Field(ge=2, le=30)


class DecideIn(BaseModel):
    approve: bool


class StatusIn(BaseModel):
    status: Literal["COMPLETED", "CANCELLED"]


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


def _creator_only(act: Activity, user: User) -> None:
    if act.creator_id != user.id:
        raise HTTPException(403, "Only the host can do this.")


@router.post("/activities")
def create_activity(body: ActivityIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    enforce(f"post:{user.id}", 20, 3600, "You are posting too fast. Try again later.")
    if body.startsAt.tzinfo is None:
        raise HTTPException(422, "Start time must include a timezone.")
    starts = as_utc(body.startsAt)
    now = utcnow()
    if starts < now - timedelta(minutes=1):
        raise HTTPException(422, "The start time has already passed.")
    if starts > now + timedelta(days=60):
        raise HTTPException(422, "Activities can be posted up to 60 days ahead.")
    title, location = body.title.strip(), body.location.strip()
    if not title or not location:
        raise HTTPException(422, "Add a title and a location.")
    act = Activity(creator_id=user.id, title=title, type=body.type, location=location, starts_at=starts, description=body.description.strip(), max_participants=body.maxParticipants)
    db.add(act)
    commit_and_push(db, everyone=True)
    return {"id": str(act.id)}


@router.post("/activities/{activity_id}/request")
def request_join(activity_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    act = lock_activity(db, activity_id)
    if blocked_pair(db, act.creator_id, user.id):
        raise HTTPException(404, "Activity not found. It may have expired.")  # a block is never revealed
    if act.creator_id == user.id:
        raise HTTPException(400, "This is your own activity.")
    if act.status != "UPCOMING":
        raise HTTPException(409, "This activity is no longer open.")
    if as_utc(act.starts_at) < utcnow():
        raise HTTPException(409, "This activity has already started.")
    existing = db.scalar(
        select(ActivityRequest).where(ActivityRequest.activity_id == act.id, ActivityRequest.requester_id == user.id, ActivityRequest.status.in_(("PENDING", "ACCEPTED")))
    )
    if existing is not None:
        raise HTTPException(409, "You already joined this activity." if existing.status == "ACCEPTED" else "You already sent a request.")
    if accepted_count_activity(db, act.id) + 1 >= act.max_participants:
        raise HTTPException(409, "This activity is full.")
    db.add(ActivityRequest(activity_id=act.id, requester_id=user.id))
    if not is_restricted(db, act.creator_id, user.id):
        notify(db, act.creator_id, f"{user.name} asked to join: {act.title}.", f"/company/{act.id}", "notifyIncoming")
    commit_and_push(db, [user.id, act.creator_id])
    return {"ok": True}


@router.post("/activity-requests/{request_id}/decide")
def decide_request(request_id: int, body: DecideIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    req = db.get(ActivityRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found.")
    act = lock_activity(db, req.activity_id)
    _creator_only(act, user)
    db.refresh(req)
    if req.status != "PENDING":
        raise HTTPException(409, "This request was already decided.")
    if act.status != "UPCOMING":
        raise HTTPException(409, "This activity is closed.")
    if body.approve and accepted_count_activity(db, act.id) + 1 >= act.max_participants:
        raise HTTPException(409, "No spots left. Decline the request instead.")
    req.status = "ACCEPTED" if body.approve else "REJECTED"
    notify(db, req.requester_id, f"{user.name} {'accepted' if body.approve else 'declined'} your request: {act.title}.", f"/company/{act.id}", "notifyAnswers")
    commit_and_push(db, [user.id, req.requester_id])
    return {"ok": True}


@router.post("/activities/{activity_id}/status")
def set_status(activity_id: int, body: StatusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    act = lock_activity(db, activity_id)
    _creator_only(act, user)
    if act.status not in ("UPCOMING", "ONGOING"):
        raise HTTPException(409, "This activity is already finished.")
    act.status = body.status
    members = [q.requester_id for q in db.scalars(select(ActivityRequest).where(ActivityRequest.activity_id == act.id, ActivityRequest.status.in_(("PENDING", "ACCEPTED")))).all()]
    if body.status == "CANCELLED":
        for uid in members:
            notify(db, uid, f"{user.name} cancelled: {act.title}.", f"/company/{act.id}", "notifyAnswers")
    db.execute(update(ActivityRequest).where(ActivityRequest.activity_id == act.id, ActivityRequest.status == "PENDING").values(status="REJECTED"))
    commit_and_push(db, [user.id, *members])
    return {"ok": True}


@router.post("/activities/{activity_id}/messages")
def post_message(activity_id: int, body: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    enforce(f"msg:{user.id}", 60, 60, "You are sending messages too fast.")
    act = db.get(Activity, activity_id)
    if act is None:
        raise HTTPException(404, "Activity not found. It may have expired.")
    accepted = db.scalars(select(ActivityRequest.requester_id).where(ActivityRequest.activity_id == act.id, ActivityRequest.status == "ACCEPTED")).all()
    if user.id != act.creator_id and user.id not in accepted:
        raise HTTPException(403, "Only the host and accepted students can post here.")
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "Write a message first.")
    db.add(ActivityMessage(activity_id=act.id, author_id=user.id, body=encrypt_text(text, f"act:{act.id}")))
    commit_and_push(db, [act.creator_id, *accepted])
    return {"ok": True}


@router.delete("/activities/{activity_id}")
def remove_activity(activity_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    act = lock_activity(db, activity_id)
    _creator_only(act, user)
    if act.status not in ("COMPLETED", "CANCELLED"):
        raise HTTPException(409, "Complete or cancel the activity before removing it.")
    db.delete(act)
    commit_and_push(db, everyone=True)
    return {"ok": True}
