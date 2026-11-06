import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import COOKIE, as_utc, end_session, get_current_user, start_session
from ..chatfiles import purge_chat_files
from ..mailer import MailError, deliver_otp
from ..models import OtpCode, Payment, Ride, User, UserSession
from ..ratelimit import client_ip, enforce
from ..security import codes_match, hash_code, hash_token, is_allowed_email, new_otp, normalize_email
from ..views import me_view

log = logging.getLogger("campuspool")
router = APIRouter(prefix="/auth", tags=["auth"])


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    branch: str = Field(default="", max_length=80)
    year: int = Field(default=1, ge=1, le=6)
    hostel: str = Field(default="", max_length=80)


class RequestOtpIn(BaseModel):
    email: str = Field(max_length=254)
    purpose: Literal["signin", "signup"]
    profile: ProfileIn | None = None


class VerifyOtpIn(BaseModel):
    email: str = Field(max_length=254)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def _expected_delivery() -> str:
    return "console" if (not settings.smtp_host and settings.environment == "development") else "email"


@router.post("/request-otp")
def request_otp(body: RequestOtpIn, request: Request, db: Session = Depends(get_db)) -> dict:
    enforce(f"otp-ip:{client_ip(request)}", 10, 3600, "Too many code requests from this network. Try again later.")
    email = normalize_email(body.email)
    if not is_allowed_email(email):
        raise HTTPException(400, f"Use your @{settings.allowed_email_domain} email address (no + aliases).")

    user = db.scalar(select(User).where(User.email == email))
    if user is None and body.purpose == "signup" and body.profile is None:
        raise HTTPException(422, "Add your name to create an account.")

    # The reply is identical whether or not an account exists, so this form cannot be used to look up who has joined.
    generic = {"ok": True, "expiresInMinutes": settings.otp_ttl_minutes, "delivery": _expected_delivery()}
    if user is None and body.purpose == "signin":
        log.info("Sign-in code requested for %s, which has no account. No code sent.", email)
        return generic
    if user is not None and user.banned_at is not None:
        log.info("Sign-in code requested for suspended account %s. No code sent.", email)
        return generic

    purpose = "signin" if user is not None else "signup"  # signing up with an existing email just signs that person in
    now = datetime.now(timezone.utc)
    recent = db.scalars(select(OtpCode).where(OtpCode.email == email, OtpCode.created_at > now - timedelta(hours=1)).order_by(OtpCode.id.desc())).all()
    if len(recent) >= settings.otp_max_per_hour:
        raise HTTPException(429, "Too many codes requested. Try again in an hour.")
    if recent and as_utc(recent[0].created_at) > now - timedelta(seconds=settings.otp_resend_seconds):
        raise HTTPException(429, f"Wait {settings.otp_resend_seconds} seconds before asking for another code.")

    db.execute(update(OtpCode).where(OtpCode.email == email, OtpCode.consumed_at.is_(None)).values(consumed_at=now))
    code = new_otp()
    row = OtpCode(
        email=email,
        code_hash=hash_code(email, code),
        purpose=purpose,
        pending_profile=body.profile.model_dump() if (purpose == "signup" and body.profile) else None,
        expires_at=now + timedelta(minutes=settings.otp_ttl_minutes),
    )
    db.add(row)
    db.commit()
    try:
        delivery = deliver_otp(email, code)
    except MailError as exc:
        row.consumed_at = now
        db.commit()
        raise HTTPException(503, str(exc)) from exc
    return {**generic, "delivery": delivery}


@router.post("/verify-otp")
def verify_otp(body: VerifyOtpIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    enforce(f"verify-ip:{client_ip(request)}", 30, 3600, "Too many attempts from this network. Try again later.")
    email = normalize_email(body.email)
    now = datetime.now(timezone.utc)
    row = db.scalar(
        select(OtpCode).where(OtpCode.email == email, OtpCode.consumed_at.is_(None), OtpCode.expires_at > now).order_by(OtpCode.id.desc()).limit(1)
    )
    if row is None:
        raise HTTPException(400, "That code expired or was never sent. Ask for a new one.")
    if row.attempts >= settings.otp_max_attempts:
        row.consumed_at = now
        db.commit()
        raise HTTPException(429, "Too many wrong attempts. Ask for a new code.")
    if not codes_match(email, body.code, row.code_hash):
        row.attempts += 1
        db.commit()
        left = max(0, settings.otp_max_attempts - row.attempts)
        raise HTTPException(400, f"That code is not correct. {left} attempt{'s' if left != 1 else ''} left.")

    row.consumed_at = now
    user = db.scalar(select(User).where(User.email == email))
    if user is not None and user.banned_at is not None:
        db.commit()
        raise HTTPException(403, "This account has been suspended.")
    if user is None:
        if row.purpose != "signup" or not row.pending_profile:
            db.commit()
            raise HTTPException(400, "That code expired or was never sent. Ask for a new one.")
        p = row.pending_profile
        user = User(email=email, name=str(p.get("name", "")).strip()[:80], branch=str(p.get("branch", ""))[:80], year=int(p.get("year", 1)), hostel=str(p.get("hostel", ""))[:80], settings={})
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                raise HTTPException(500, "Could not create the account. Try again.") from None
    db.commit()
    start_session(db, response, user)
    return {"user": me_view(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return {"user": me_view(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    end_session(db, request, response)
    return {"ok": True}


@router.post("/logout-others")
def logout_others(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Signs the student out on every other browser. This one stays signed in."""
    current = hash_token(request.cookies.get(COOKIE) or "")
    res = db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.token_hash != current))
    db.commit()
    return {"ok": True, "signedOut": res.rowcount or 0}


@router.delete("/me")
def delete_account(response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    owed = db.scalar(select(func.count()).select_from(Payment).where(Payment.payer_id == user.id, Payment.status == "PENDING")) or 0
    unconfirmed = (
        db.scalar(select(func.count()).select_from(Payment).join(Ride, Ride.id == Payment.ride_id).where(Ride.creator_id == user.id, Payment.status == "PENDING")) or 0
    )
    if owed or unconfirmed:
        raise HTTPException(409, "Settle your ride payments first: pay what you owe and confirm what riders paid you.")
    if user.avatar_file:
        from .me import remove_avatar_file

        remove_avatar_file(user.avatar_file)
    purge_chat_files(db, user.id)
    db.delete(user)
    db.commit()
    response.delete_cookie("cp_session", path="/")
    return {"ok": True}
