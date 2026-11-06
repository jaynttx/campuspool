"""Builds the JSON the frontend loads. The signed-in user is always written as "me"."""

from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from .crypto import decrypt_text
from .deps import as_utc
from .helpers import is_admin, user_settings
from .relations import hidden_user_ids, restricted_ids
from .models import (
    Activity,
    ActivityMessage,
    ActivityRequest,
    Conversation,
    HiddenItem,
    Message,
    Notification,
    Payment,
    Report,
    Ride,
    RideRating,
    RideRequest,
    User,
    UserBlock,
    UserRestriction,
)


def ms(dt: datetime | None) -> int | None:
    return None if dt is None else int(as_utc(dt).timestamp() * 1000)


def iso(dt: datetime) -> str:
    return as_utc(dt).isoformat()


def avatar_path(user: User) -> str | None:
    return f"/avatars/{user.avatar_file}" if user.avatar_file else None


def rating_summary(db: Session, ids: set[int]) -> dict[int, tuple[float, int]]:
    """Average stars and number of ratings per student."""
    if not ids:
        return {}
    rows = db.execute(select(RideRating.ratee_id, func.avg(RideRating.stars), func.count()).where(RideRating.ratee_id.in_(list(ids))).group_by(RideRating.ratee_id)).all()
    return {r[0]: (round(float(r[1]), 1), int(r[2])) for r in rows}


def public_person(u: User, upi: bool = False, rating: tuple[float, int] | None = None) -> dict:
    """What other students may see about someone. Their own privacy settings decide year, branch, hostel and photo."""
    prefs = user_settings(u)
    out = {
        "id": str(u.id),
        "name": u.name,
        "year": u.year if prefs.get("showYear", True) else None,
        "branch": u.branch if prefs.get("showBranch", True) else "",
        "hostel": u.hostel if prefs.get("showHostel", False) else "",
        "avatarUrl": avatar_path(u) if prefs.get("showPhoto", True) else None,
    }
    if upi and u.upi_id:
        out["upiId"] = u.upi_id
    out["ratingAvg"] = rating[0] if rating else None
    out["ratingCount"] = rating[1] if rating else 0
    return out


def me_view(user: User) -> dict:
    return {
        "id": "me",
        "userId": user.id,
        "email": user.email,
        "name": user.name,
        "branch": user.branch,
        "year": user.year,
        "hostel": user.hostel,
        "phone": user.phone,
        "upiId": user.upi_id,
        "avatarUrl": avatar_path(user),
        "settings": user_settings(user),
        "isAdmin": is_admin(user),
    }


def build_bootstrap(db: Session, user: User) -> dict:
    uid = user.id
    now = datetime.now(timezone.utc)

    def ref(i: int) -> str:
        return "me" if i == uid else str(i)

    hidden = list(hidden_user_ids(db, uid))
    quiet = list(restricted_ids(db, uid))

    hidden_rides = list(db.scalars(select(HiddenItem.target_id).where(HiddenItem.user_id == uid, HiddenItem.kind == "ride")).all())
    hidden_acts = list(db.scalars(select(HiddenItem.target_id).where(HiddenItem.user_id == uid, HiddenItem.kind == "activity")).all())

    # ---- rides: every open future ride, plus anything I created or asked about
    asked_rides = select(RideRequest.ride_id).where(RideRequest.requester_id == uid)
    rides = db.scalars(
        select(Ride)
        .where(or_(Ride.creator_id == uid, Ride.id.in_(asked_rides), and_(Ride.status == "PENDING", Ride.departs_at >= now, Ride.creator_id.not_in(hidden) if hidden else True)))
        .where(Ride.id.not_in(hidden_rides) if hidden_rides else True)
        .order_by(Ride.departs_at)
        .limit(300)
    ).all()
    ride_ids = [r.id for r in rides]
    my_ride_ids = [r.id for r in rides if r.creator_id == uid]
    ride_reqs = (
        db.scalars(
            select(RideRequest).where(
                RideRequest.ride_id.in_(ride_ids),
                or_(RideRequest.status == "ACCEPTED", RideRequest.requester_id == uid, RideRequest.ride_id.in_(my_ride_ids)),
            )
        ).all()
        if ride_ids
        else []
    )
    payments = (
        db.scalars(select(Payment).where(or_(Payment.payer_id == uid, Payment.ride_id.in_(my_ride_ids)))).all() if ride_ids else []
    )

    # ---- activities
    asked_acts = select(ActivityRequest.activity_id).where(ActivityRequest.requester_id == uid)
    acts = db.scalars(
        select(Activity)
        .where(or_(Activity.creator_id == uid, Activity.id.in_(asked_acts), and_(Activity.status == "UPCOMING", Activity.starts_at >= now, Activity.creator_id.not_in(hidden) if hidden else True)))
        .where(Activity.id.not_in(hidden_acts) if hidden_acts else True)
        .order_by(Activity.starts_at)
        .limit(300)
    ).all()
    act_ids = [a.id for a in acts]
    my_act_ids = [a.id for a in acts if a.creator_id == uid]
    act_reqs = (
        db.scalars(
            select(ActivityRequest).where(
                ActivityRequest.activity_id.in_(act_ids),
                or_(ActivityRequest.status == "ACCEPTED", ActivityRequest.requester_id == uid, ActivityRequest.activity_id.in_(my_act_ids)),
            )
        ).all()
        if act_ids
        else []
    )
    member_act_ids = set(my_act_ids) | {q.activity_id for q in act_reqs if q.requester_id == uid and q.status == "ACCEPTED"}
    msgs = (
        db.scalars(select(ActivityMessage).where(ActivityMessage.activity_id.in_(list(member_act_ids))).order_by(ActivityMessage.id)).all()
        if member_act_ids
        else []
    )

    notes = db.scalars(select(Notification).where(Notification.user_id == uid).order_by(Notification.id.desc()).limit(100)).all()
    reports = db.scalars(select(Report).where(Report.reporter_id == uid).order_by(Report.id.desc()).limit(50)).all()

    # ---- people referenced anywhere
    people_ids = {r.creator_id for r in rides} | {q.requester_id for q in ride_reqs} | {p.payer_id for p in payments}
    people_ids |= {a.creator_id for a in acts} | {q.requester_id for q in act_reqs} | {m.author_id for m in msgs}
    people_ids.discard(uid)
    people_rows = db.scalars(select(User).where(User.id.in_(list(people_ids)))).all() if people_ids else []
    # A creator's UPI ID is shared only with riders who owe them a share.
    creators_i_owe = {r.creator_id for r in rides if any(p.ride_id == r.id and p.payer_id == uid and p.status == "PENDING" for p in payments)}

    ride_participants: dict[int, list[str]] = {}
    for q in ride_reqs:
        if q.status == "ACCEPTED":
            ride_participants.setdefault(q.ride_id, []).append(ref(q.requester_id))
    act_participants: dict[int, list[str]] = {}
    for q in act_reqs:
        if q.status == "ACCEPTED":
            act_participants.setdefault(q.activity_id, []).append(ref(q.requester_id))
    act_messages: dict[int, list[dict]] = {}
    for m in msgs:
        act_messages.setdefault(m.activity_id, []).append({"id": str(m.id), "authorId": ref(m.author_id), "text": decrypt_text(m.body, f"act:{m.activity_id}"), "at": ms(m.created_at)})

    convo_ids = select(Conversation.id).where(or_(Conversation.user_low_id == uid, Conversation.user_high_id == uid))
    unread_q = select(func.count()).select_from(Message).where(Message.conversation_id.in_(convo_ids), Message.sender_id != uid, Message.read_at.is_(None))
    if quiet:
        unread_q = unread_q.where(Message.sender_id.not_in(quiet))  # restricted students do not add to the badge
    chat_unread = db.scalar(unread_q) or 0

    def rel_person(u: User) -> dict:
        return {"id": str(u.id), "name": u.name, "avatarUrl": avatar_path(u)}

    blocked_rows = db.scalars(select(User).join(UserBlock, UserBlock.blocked_id == User.id).where(UserBlock.blocker_id == uid)).all()
    restricted_rows = db.scalars(select(User).join(UserRestriction, UserRestriction.restricted_id == User.id).where(UserRestriction.restrictor_id == uid)).all()

    summary = rating_summary(db, people_ids | {uid})
    my_view = me_view(user)
    my_view["ratingAvg"], my_view["ratingCount"] = summary.get(uid, (None, 0))
    given = db.scalars(select(RideRating).where(RideRating.rater_id == uid).order_by(RideRating.id.desc()).limit(500)).all()
    received = db.scalars(select(RideRating).where(RideRating.ratee_id == uid).order_by(RideRating.id.desc()).limit(30)).all()

    return {
        "me": my_view,
        "people": [public_person(p, upi=p.id in creators_i_owe, rating=summary.get(p.id)) for p in people_rows],
        "rides": [
            {
                "id": str(r.id),
                "creatorId": ref(r.creator_id),
                "source": r.source,
                "destination": r.destination,
                "departsAt": iso(r.departs_at),
                "totalSeats": r.total_seats,
                "expectedFare": float(r.expected_fare),
                "actualFare": float(r.actual_fare) if r.actual_fare is not None else None,
                "status": r.status,
                "participants": ride_participants.get(r.id, []),
                "note": r.note,
                "srcLat": r.src_lat,
                "srcLng": r.src_lng,
                "dstLat": r.dst_lat,
                "dstLng": r.dst_lng,
                "seriesId": r.series_id,
                "createdOn": ms(r.created_at),
            }
            for r in rides
        ],
        "rideRequests": [
            {"id": str(q.id), "rideId": str(q.ride_id), "requesterId": ref(q.requester_id), "status": q.status, "requestedOn": ms(q.created_at), "restricted": q.requester_id in quiet}
            for q in ride_reqs
        ],
        "payments": [
            {
                "id": str(p.id),
                "rideId": str(p.ride_id),
                "studentId": ref(p.payer_id),
                "amount": float(p.amount),
                "status": p.status,
                "riderMarkedPaid": p.rider_marked_paid,
                "paidOn": ms(p.paid_at),
            }
            for p in payments
        ],
        "activities": [
            {
                "id": str(a.id),
                "creatorId": ref(a.creator_id),
                "title": a.title,
                "type": a.type,
                "location": a.location,
                "startsAt": iso(a.starts_at),
                "description": a.description,
                "maxParticipants": a.max_participants,
                "status": a.status,
                "participants": act_participants.get(a.id, []),
                "messages": act_messages.get(a.id, []),
                "createdOn": ms(a.created_at),
            }
            for a in acts
        ],
        "activityRequests": [
            {"id": str(q.id), "activityId": str(q.activity_id), "requesterId": ref(q.requester_id), "status": q.status, "requestedOn": ms(q.created_at), "restricted": q.requester_id in quiet}
            for q in act_reqs
        ],
        "notifications": [{"id": str(n.id), "text": n.text, "href": n.href, "at": ms(n.created_at), "read": n.read} for n in notes],
        "reports": [
            {"id": str(r.id), "kind": r.kind, "targetId": str(r.target_id), "targetTitle": r.target_title, "reason": r.reason, "at": ms(r.created_at)}
            for r in reports
        ],
        "myRatings": [{"rideId": str(g.ride_id), "rateeId": ref(g.ratee_id), "stars": g.stars} for g in given],
        "receivedRatings": [{"id": str(x.id), "stars": x.stars, "comment": x.comment, "at": ms(x.created_at), "rideTitle": x.ride_title} for x in received],
        "chatUnread": chat_unread,
        "relations": {"blocked": [rel_person(u) for u in blocked_rows], "restricted": [rel_person(u) for u in restricted_rows]},
    }
