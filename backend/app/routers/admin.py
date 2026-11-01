"""Moderation and overview for administrators (emails listed in ADMIN_EMAILS)."""

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import as_utc, require_admin
from ..helpers import commit_and_push, notify
from ..models import Activity, Feedback, Report, Ride, User, UserSession
from ..views import ms

router = APIRouter(prefix="/admin", tags=["admin"])


class ResolveIn(BaseModel):
    action: Literal["dismiss", "remove_post", "ban_user"]
    note: str | None = Field(default=None, max_length=200)


class BanIn(BaseModel):
    banned: bool


def _person(u: User | None) -> dict | None:
    return None if u is None else {"id": str(u.id), "name": u.name, "email": u.email, "banned": u.banned_at is not None}


def _owner_and_exists(db: Session, r: Report) -> tuple[User | None, bool]:
    if r.kind == "ride":
        ride = db.get(Ride, r.target_id)
        return (db.get(User, ride.creator_id) if ride else None), ride is not None
    if r.kind == "activity":
        act = db.get(Activity, r.target_id)
        return (db.get(User, act.creator_id) if act else None), act is not None
    user = db.get(User, r.target_id)
    return user, user is not None


def _report_view(db: Session, r: Report) -> dict:
    owner, exists = _owner_and_exists(db, r)
    return {
        "id": str(r.id),
        "kind": r.kind,
        "targetId": str(r.target_id),
        "targetTitle": r.target_title,
        "reason": r.reason,
        "status": r.status,
        "resolution": r.resolution,
        "evidence": r.evidence,
        "at": ms(r.created_at),
        "reporter": _person(db.get(User, r.reporter_id)),
        "targetExists": exists,
        "owner": _person(owner),
    }


@router.get("/overview")
def overview(_admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    week = now - timedelta(days=7)
    count = lambda stmt: db.scalar(stmt) or 0  # noqa: E731
    popular = db.execute(select(Ride.destination, func.count().label("n")).group_by(Ride.destination).order_by(func.count().desc()).limit(5)).all()
    created = [as_utc(d) for d in db.scalars(select(Ride.created_at).where(Ride.created_at >= week)).all()]
    created += [as_utc(d) for d in db.scalars(select(Activity.created_at).where(Activity.created_at >= week)).all()]
    per_day = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        per_day.append({"date": day.isoformat(), "count": sum(1 for d in created if d.date() == day)})
    return {
        "users": count(select(func.count()).select_from(User)),
        "newUsers7d": count(select(func.count()).select_from(User).where(User.created_at >= week)),
        "suspended": count(select(func.count()).select_from(User).where(User.banned_at.is_not(None))),
        "openRides": count(select(func.count()).select_from(Ride).where(Ride.status == "PENDING", Ride.departs_at >= now)),
        "ridesTotal": count(select(func.count()).select_from(Ride)),
        "openActivities": count(select(func.count()).select_from(Activity).where(Activity.status == "UPCOMING", Activity.starts_at >= now)),
        "openReports": count(select(func.count()).select_from(Report).where(Report.status == "OPEN")),
        "newFeedback": count(select(func.count()).select_from(Feedback).where(Feedback.status == "NEW")),
        "averageRating": (lambda v: round(float(v), 1) if v is not None else None)(db.scalar(select(func.avg(Feedback.rating)))),
        "popularRoutes": [{"destination": d, "count": n} for d, n in popular],
        "postsPerDay": per_day,
    }


@router.get("/reports")
def list_reports(status: Literal["OPEN", "RESOLVED", "ALL"] = Query(default="OPEN"), _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    stmt = select(Report).order_by(Report.id.desc()).limit(200)
    if status != "ALL":
        stmt = stmt.where(Report.status == status)
    return {"reports": [_report_view(db, r) for r in db.scalars(stmt).all()]}


def _suspend(db: Session, user: User) -> None:
    if user.email in settings.admin_emails:
        raise HTTPException(409, "Administrators cannot be suspended here.")
    user.banned_at = datetime.now(timezone.utc)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))


@router.post("/reports/{report_id}/resolve")
def resolve_report(report_id: int, body: ResolveIn, _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(404, "Report not found.")
    if report.status != "OPEN":
        raise HTTPException(409, "This report is already resolved.")
    owner, exists = _owner_and_exists(db, report)
    outcome = "Dismissed"

    if body.action == "remove_post":
        if report.kind == "user":
            raise HTTPException(422, "A student report has no post to remove. Suspend the student instead.")
        if not exists:
            raise HTTPException(409, "That post is already gone.")
        obj = db.get(Ride, report.target_id) if report.kind == "ride" else db.get(Activity, report.target_id)
        if owner is not None:
            notify(db, owner.id, f"A moderator removed your {report.kind}: {report.target_title}.")
        db.delete(obj)
        outcome = "Post removed"
    elif body.action == "ban_user":
        if owner is None:
            raise HTTPException(409, "The student behind this report no longer exists.")
        _suspend(db, owner)
        outcome = "Student suspended"

    report.status = "RESOLVED"
    report.resolution = f"{outcome}. {body.note.strip()}"[:300] if body.note and body.note.strip() else outcome
    report.resolved_at = datetime.now(timezone.utc)
    commit_and_push(db, everyone=True)
    return {"ok": True}


@router.get("/users")
def list_users(q: str = Query(default="", max_length=80), _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    stmt = select(User).order_by(User.id.desc()).limit(100)
    term = q.strip()
    if term:
        like = f"%{term.lower()}%"
        stmt = stmt.where(or_(func.lower(User.name).like(like), func.lower(User.email).like(like)))
    rows = db.scalars(stmt).all()
    return {
        "users": [{**(_person(u) or {}), "branch": u.branch, "hostel": u.hostel, "joinedAt": ms(u.created_at), "isAdmin": u.email in settings.admin_emails} for u in rows]
    }


@router.post("/users/{user_id}/ban")
def set_ban(user_id: int, body: BanIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Student not found.")
    if user.id == admin.id:
        raise HTTPException(409, "You cannot suspend yourself.")
    if body.banned:
        _suspend(db, user)
    else:
        user.banned_at = None
    db.commit()
    return {"ok": True}


@router.get("/feedback")
def list_feedback(status: Literal["NEW", "READ", "ALL"] = Query(default="NEW"), _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    stmt = select(Feedback).order_by(Feedback.id.desc()).limit(200)
    if status != "ALL":
        stmt = stmt.where(Feedback.status == status)
    out = []
    for f in db.scalars(stmt).all():
        author = db.get(User, f.user_id)
        out.append({"id": str(f.id), "category": f.category, "rating": f.rating, "message": f.message, "status": f.status, "at": ms(f.created_at), "from": _person(author)})
    return {"feedback": out}


@router.post("/feedback/{feedback_id}/read")
def mark_feedback_read(feedback_id: int, _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    f = db.get(Feedback, feedback_id)
    if f is None:
        raise HTTPException(404, "Feedback not found.")
    f.status = "READ"
    db.commit()
    return {"ok": True}
