import re
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User, UserSession
from .security import hash_token, new_session_token

COOKIE = "cp_session"


def origin_allowed(origin: str) -> bool:
    if origin in settings.cors_origins:
        return True
    return bool(settings.cors_origin_regex and re.fullmatch(settings.cors_origin_regex, origin))


def as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if sess is None or as_utc(sess.expires_at) < datetime.now(timezone.utc):
        return None
    return db.get(User, sess.user_id)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = user_for_token(db, request.cookies.get(COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="Please sign in.")
    if user.banned_at is not None:
        raise HTTPException(status_code=403, detail="This account has been suspended.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.email not in settings.admin_emails:
        raise HTTPException(status_code=403, detail="Administrators only.")
    return user


def start_session(db: Session, response: Response, user: User) -> None:
    token = new_session_token()
    db.add(UserSession(user_id=user.id, token_hash=hash_token(token), expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_days)))
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def end_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        sess = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
        if sess:
            db.delete(sess)
            db.commit()
    response.delete_cookie(COOKIE, path="/")
