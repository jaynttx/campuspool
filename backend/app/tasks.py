"""Housekeeping: removes rides, activities and old records once their time has passed."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, exists, select

from .config import settings
from .db import session_factory
from .chatfiles import remove_chat_file
from .models import Activity, Message, Notification, OtpCode, Payment, ReminderSent, Ride, UserSession
from .reminders import run_reminders

log = logging.getLogger("campuspool")


def run_cleanup() -> dict[str, int]:
    now = datetime.now(timezone.utc)
    counts: dict[str, int] = {}
    with session_factory()() as db:
        # Activities: gone shortly after they start.
        res = db.execute(delete(Activity).where(Activity.starts_at < now - timedelta(hours=settings.activity_grace_hours)))
        counts["activities"] = res.rowcount or 0

        # Rides that never reached "completed": gone after a grace period so creators can still finish them.
        res = db.execute(
            delete(Ride).where(Ride.status.in_(("PENDING", "ONGOING", "CANCELLED")), Ride.departs_at < now - timedelta(hours=settings.ride_grace_hours))
        )
        counts["rides"] = res.rowcount or 0

        # Completed rides: kept while any share is still unconfirmed (it is a money record), then removed.
        unsettled = exists(select(1).where(Payment.ride_id == Ride.id, Payment.status != "SUCCESS"))
        res = db.execute(
            delete(Ride).where(Ride.status == "COMPLETED", Ride.completed_at < now - timedelta(hours=settings.settled_ride_keep_hours), ~unsettled)
        )
        counts["settled_rides"] = res.rowcount or 0

        # Chat messages (and their photos) are kept for a limited time.
        cutoff = now - timedelta(days=settings.message_retention_days)
        for name in db.scalars(select(Message.image_file).where(Message.created_at < cutoff, Message.image_file.is_not(None))).all():
            remove_chat_file(name)
        res = db.execute(delete(Message).where(Message.created_at < cutoff))
        counts["messages"] = res.rowcount or 0

        db.execute(delete(ReminderSent).where(ReminderSent.sent_at < now - timedelta(days=7)))
        db.execute(delete(Notification).where(Notification.created_at < now - timedelta(days=30)))
        db.execute(delete(OtpCode).where(OtpCode.expires_at < now - timedelta(days=1)))
        db.execute(delete(UserSession).where(UserSession.expires_at < now))
        db.commit()
    return counts


async def cleanup_loop(interval_seconds: int = 60) -> None:
    while True:
        try:
            counts = await run_in_threadpool(run_cleanup)
            counts["reminders"] = await run_in_threadpool(run_reminders)
            if any(counts.values()):
                log.info("Expired items removed: %s", counts)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Cleanup failed")
        await asyncio.sleep(interval_seconds)
