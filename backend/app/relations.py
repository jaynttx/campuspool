"""Block and restrict rules between students.

Block: neither side can message the other or ask to join the other's posts, and open posts are hidden from each other.
Restrict: one-way and silent. The restricted student is not told. Their requests and messages still arrive, but with
no notifications and no unread badge for the person who restricted them.
A pair has at most one of the two states; setting one clears the other.
"""

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from .models import Activity, ActivityRequest, Ride, RideRequest, UserBlock, UserRestriction


def blocked_pair(db: Session, a: int, b: int) -> bool:
    return (
        db.scalar(select(UserBlock.id).where(or_(and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b), and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a))).limit(1))
        is not None
    )


def blocked_by_me(db: Session, me: int, other: int) -> bool:
    return db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == me, UserBlock.blocked_id == other)) is not None


def hidden_user_ids(db: Session, uid: int) -> set[int]:
    """Everyone I blocked plus everyone who blocked me."""
    mine = set(db.scalars(select(UserBlock.blocked_id).where(UserBlock.blocker_id == uid)).all())
    theirs = set(db.scalars(select(UserBlock.blocker_id).where(UserBlock.blocked_id == uid)).all())
    return mine | theirs


def is_restricted(db: Session, restrictor: int, other: int) -> bool:
    return db.scalar(select(UserRestriction.id).where(UserRestriction.restrictor_id == restrictor, UserRestriction.restricted_id == other)) is not None


def restricted_ids(db: Session, uid: int) -> set[int]:
    return set(db.scalars(select(UserRestriction.restricted_id).where(UserRestriction.restrictor_id == uid)).all())


def _reject_pending_between(db: Session, a: int, b: int) -> None:
    for owner, asker in ((a, b), (b, a)):
        db.execute(
            update(RideRequest)
            .where(RideRequest.status == "PENDING", RideRequest.requester_id == asker, RideRequest.ride_id.in_(select(Ride.id).where(Ride.creator_id == owner)))
            .values(status="REJECTED")
        )
        db.execute(
            update(ActivityRequest)
            .where(
                ActivityRequest.status == "PENDING",
                ActivityRequest.requester_id == asker,
                ActivityRequest.activity_id.in_(select(Activity.id).where(Activity.creator_id == owner)),
            )
            .values(status="REJECTED")
        )


def set_block(db: Session, me: int, other: int, on: bool) -> None:
    existing = db.scalar(select(UserBlock).where(UserBlock.blocker_id == me, UserBlock.blocked_id == other))
    if on:
        restriction = db.scalar(select(UserRestriction).where(UserRestriction.restrictor_id == me, UserRestriction.restricted_id == other))
        if restriction is not None:
            db.delete(restriction)
        if existing is None:
            db.add(UserBlock(blocker_id=me, blocked_id=other))
        _reject_pending_between(db, me, other)
    elif existing is not None:
        db.delete(existing)


def set_restrict(db: Session, me: int, other: int, on: bool) -> None:
    existing = db.scalar(select(UserRestriction).where(UserRestriction.restrictor_id == me, UserRestriction.restricted_id == other))
    if on:
        block = db.scalar(select(UserBlock).where(UserBlock.blocker_id == me, UserBlock.blocked_id == other))
        if block is not None:
            db.delete(block)
        if existing is None:
            db.add(UserRestriction(restrictor_id=me, restricted_id=other))
    elif existing is not None:
        db.delete(existing)
