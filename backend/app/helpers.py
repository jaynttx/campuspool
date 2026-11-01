from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import Activity, ActivityRequest, Notification, Ride, RideRequest, User
from .realtime import hub

DEFAULT_SETTINGS = {
    "defaultPickup": "Thapar Main Gate",
    "defaultSeats": 3,
    "defaultActivityType": "SPORTS",
    "notifyIncoming": True,
    "notifyAnswers": True,
    "reduceMotion": False,
    "showYear": True,
    "showBranch": True,
    "showHostel": False,
    "showPhoto": True,
    "reminderMinutes": 60,
    "emailReminders": False,
}


def is_admin(user: User) -> bool:
    return user.email in settings.admin_emails


def user_settings(user: User) -> dict:
    return {**DEFAULT_SETTINGS, **(user.settings or {})}


def notify(db: Session, user_id: int, text: str, href: str | None = None, pref: str | None = None) -> None:
    """Adds an in-app notification unless the user switched that kind off."""
    target = db.get(User, user_id)
    if target is None:
        return
    if pref and not user_settings(target).get(pref, True):
        return
    db.add(Notification(user_id=user_id, text=text[:300], href=href))


def commit_and_push(db: Session, user_ids: Iterable[int] = (), everyone: bool = False) -> None:
    """Commit first, then tell connected clients to re-fetch."""
    db.commit()
    if everyone:
        hub.push_all({"type": "refresh"})
    else:
        hub.push(user_ids, {"type": "refresh"})


def lock_ride(db: Session, ride_id: int) -> Ride:
    ride = db.scalar(select(Ride).where(Ride.id == ride_id).with_for_update())
    if ride is None:
        raise HTTPException(404, "Ride not found. It may have expired.")
    return ride


def lock_activity(db: Session, activity_id: int) -> Activity:
    act = db.scalar(select(Activity).where(Activity.id == activity_id).with_for_update())
    if act is None:
        raise HTTPException(404, "Activity not found. It may have expired.")
    return act


def accepted_count_ride(db: Session, ride_id: int) -> int:
    return db.scalar(select(func.count()).select_from(RideRequest).where(RideRequest.ride_id == ride_id, RideRequest.status == "ACCEPTED")) or 0


def accepted_count_activity(db: Session, activity_id: int) -> int:
    return (
        db.scalar(select(func.count()).select_from(ActivityRequest).where(ActivityRequest.activity_id == activity_id, ActivityRequest.status == "ACCEPTED"))
        or 0
    )
