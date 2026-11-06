import os
import re
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import get_current_user
from ..helpers import DEFAULT_SETTINGS, user_settings
from ..imaging import MIME, sniff_image
from ..models import User
from ..views import me_view

router = APIRouter(tags=["profile"])

_UPI = re.compile(r"^[\w.\-]{2,}@[A-Za-z][\w.\-]*$")
_PHONE = re.compile(r"^[0-9+\- ]{0,20}$")
_FILENAME = re.compile(r"^[A-Za-z0-9_\-]{8,64}\.(jpg|png|webp)$")


def _avatar_dir() -> str:
    path = os.path.join(settings.upload_dir, "avatars")
    os.makedirs(path, exist_ok=True)
    return path


def remove_avatar_file(filename: str) -> None:
    if _FILENAME.match(filename):
        try:
            os.remove(os.path.join(_avatar_dir(), filename))
        except FileNotFoundError:
            pass


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    branch: str | None = Field(default=None, max_length=80)
    year: int | None = Field(default=None, ge=1, le=6)
    hostel: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    upiId: str | None = Field(default=None, max_length=80)


class SettingsIn(BaseModel):
    defaultPickup: str = Field(max_length=120)
    defaultSeats: int = Field(ge=1, le=6)
    defaultActivityType: Literal["SPORTS", "WALK", "GYM", "FOOD", "MOVIE", "STUDY", "HANGOUT", "OTHER"]
    notifyIncoming: bool
    notifyAnswers: bool
    reduceMotion: bool
    showYear: bool
    showBranch: bool
    showHostel: bool
    showPhoto: bool
    reminderMinutes: int = Field(ge=0, le=240)  # 0 turns reminders off
    emailReminders: bool


@router.patch("/me")
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    if body.name is not None:
        user.name = body.name.strip()
        if len(user.name) < 2:
            raise HTTPException(422, "Your name needs at least 2 characters.")
    if body.branch is not None:
        user.branch = body.branch.strip()
    if body.year is not None:
        user.year = body.year
    if body.hostel is not None:
        user.hostel = body.hostel.strip()
    if body.phone is not None:
        if not _PHONE.match(body.phone.strip()):
            raise HTTPException(422, "Phone can contain digits, spaces, + and - only.")
        user.phone = body.phone.strip()
    if body.upiId is not None:
        upi = body.upiId.strip()
        if upi and not _UPI.match(upi):
            raise HTTPException(422, "A UPI ID looks like name@bank.")
        user.upi_id = upi
    db.commit()
    return {"user": me_view(user)}


@router.patch("/me/settings")
def update_settings(body: SettingsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    merged = {**DEFAULT_SETTINGS, **body.model_dump()}
    user.settings = merged
    db.commit()
    return {"settings": user_settings(user)}


@router.post("/me/avatar")
async def upload_avatar(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.max_avatar_bytes:
        raise HTTPException(413, "That image is too large. Use one under 2 MB.")
    data = await request.body()
    if not data or len(data) > settings.max_avatar_bytes:
        raise HTTPException(413, "That image is too large. Use one under 2 MB.")
    ext = sniff_image(data)
    if ext is None:
        raise HTTPException(415, "Use a JPEG, PNG or WebP image.")

    def save() -> dict:
        filename = f"{secrets.token_urlsafe(18)}.{ext}"
        with open(os.path.join(_avatar_dir(), filename), "wb") as fh:
            fh.write(data)
        old = user.avatar_file
        user.avatar_file = filename
        db.commit()
        if old:
            remove_avatar_file(old)
        return {"user": me_view(user)}

    return await run_in_threadpool(save)


@router.delete("/me/avatar")
def delete_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    if user.avatar_file:
        remove_avatar_file(user.avatar_file)
        user.avatar_file = None
        db.commit()
    return {"user": me_view(user)}


@router.get("/avatars/{filename}")
def get_avatar(filename: str, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)) -> FileResponse:
    if not _FILENAME.match(filename):
        raise HTTPException(404, "Not found.")
    owner = db.scalar(select(User).where(User.avatar_file == filename))
    if owner is None or (owner.id != viewer.id and not user_settings(owner).get("showPhoto", True)):
        raise HTTPException(404, "Not found.")  # a hidden photo looks the same as a missing one
    path = os.path.join(_avatar_dir(), filename)
    if not os.path.isfile(path):
        raise HTTPException(404, "Not found.")
    media = MIME[filename.rsplit(".", 1)[1]]
    return FileResponse(path, media_type=media, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400"})
