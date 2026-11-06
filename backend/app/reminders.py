"""Reminders before a ride or activity: an in-app notification, plus an email if the student opted in."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .db import session_factory
from .helpers import user_settings
from .mailer import MailError, send_notification_email
from .models import Activity, ActivityRequest, Notification, ReminderSent, Ride, RideRequest, User
from .deps import as_utc

log = logging.getLogger("campuspool")


def _remind(db, kind: str, target_id: int, user: User, minutes_left: int, text: str, href: str, subject: str) -> bool:
    prefs = user_settings(user)
    lead = int(prefs.get("reminderMinutes", 60))
    if lead <= 0 or minutes_left > lead:
        return False
    try:  # the unique row also prevents a double send if two workers race
        db.add(ReminderSent(kind=kind, target_id=target_id, user_id=user.id))
        db.flush()
    except IntegrityError:
        db.rollback()
        return False
    db.add(Notification(user_id=user.id, text=text[:300], href=href))
    db.commit()
    if prefs.get("emailReminders"):
        try:
            send_notification_email(user.email, subject, f"{text}\n\nOpen CampusPool for the details.")
        except MailError as exc:
            log.warning("Reminder email to %s failed: %s", user.email, exc)
    return True


def _already(db, kind: str, target_id: int, user_id: int) -> bool:
    return db.scalar(select(ReminderSent.id).where(ReminderSent.kind == kind, ReminderSent.target_id == target_id, ReminderSent.user_id == user_id)) is not None


def run_reminders() -> int:
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(minutes=241)
    sent = 0
    with session_factory()() as db:
        for ride in db.scalars(select(Ride).where(Ride.status == "PENDING", Ride.departs_at > now, Ride.departs_at <= horizon)).all():
            left = int((as_utc(ride.departs_at) - now).total_seconds() // 60)
            ids = [ride.creator_id, *db.scalars(select(RideRequest.requester_id).where(RideRequest.ride_id == ride.id, RideRequest.status == "ACCEPTED")).all()]
            for uid in ids:
                if _already(db, "ride", ride.id, uid):
                    continue
                user = db.get(User, uid)
                if user is not None and _remind(
                    db, "ride", ride.id, user, left, f"Reminder: your ride to {ride.destination} leaves in about {max(left, 1)} minutes.", f"/rides/{ride.id}", "Your ride is leaving soon"
                ):
                    sent += 1
        for act in db.scalars(select(Activity).where(Activity.status == "UPCOMING", Activity.starts_at > now, Activity.starts_at <= horizon)).all():
            left = int((as_utc(act.starts_at) - now).total_seconds() // 60)
            ids = [act.creator_id, *db.scalars(select(ActivityRequest.requester_id).where(ActivityRequest.activity_id == act.id, ActivityRequest.status == "ACCEPTED")).all()]
            for uid in ids:
                if _already(db, "activity", act.id, uid):
                    continue
                user = db.get(User, uid)
                if user is not None and _remind(
                    db, "activity", act.id, user, left, f"Reminder: {act.title} starts in about {max(left, 1)} minutes.", f"/company/{act.id}", "An activity is starting soon"
                ):
                    sent += 1
    return sent
