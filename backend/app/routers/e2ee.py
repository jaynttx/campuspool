"""Key handling for secure (end-to-end encrypted) chat.

Each student has one chat identity: an ECDH P-256 key pair made in their browser.

* The PUBLIC key is stored here so the people they talk to can encrypt to them.
* The PRIVATE key never reaches the server in readable form. It lives in the browser (IndexedDB), so nobody has
  to type a passphrase to read their messages.
* A new browser gets the private key from one of the student's existing devices through a device link:
  the new device posts a one-time public key and shows a short code; the student types that code on a device
  where chat already works, which seals the private key to the one-time key. The server only relays ciphertext.
* Optionally, the student can keep a recovery key (shown once, never sent). The private key sealed with it is
  stored here as `recovery`, for when every device is lost.
* `legacyWrappedKey` is the older passphrase-sealed copy. It is used once to move a student to the new scheme.
"""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import as_utc, get_current_user
from ..helpers import notify
from ..models import Conversation, DeviceLink, User
from ..ratelimit import enforce
from ..realtime import hub
from ..relations import blocked_pair
from ..views import ms
from .chat import related

router = APIRouter(prefix="/e2ee", tags=["secure-chat"])

LINK_MINUTES = 10


class KeysIn(BaseModel):
    publicKey: str = Field(min_length=20, max_length=2000)
    # Replacing an existing key is a reset: old messages can no longer be opened. Without this flag the server
    # refuses, so two devices that start at the same moment cannot overwrite each other.
    replace: bool = False
    recovery: str | None = Field(default=None, max_length=8000)
    wrappedKey: str | None = Field(default=None, max_length=8000)  # older clients only


class RecoveryIn(BaseModel):
    recovery: str | None = Field(default=None, min_length=20, max_length=8000)


class LinkIn(BaseModel):
    publicKey: str = Field(min_length=20, max_length=2000)
    label: str = Field(default="New device", max_length=80)


class ApproveIn(BaseModel):
    publicKey: str = Field(min_length=20, max_length=2000)
    sealed: str = Field(min_length=20, max_length=12000)


def _keys_view(user: User) -> dict:
    return {
        "publicKey": user.e2ee_public_key,
        "recovery": user.e2ee_recovery,
        "legacyWrappedKey": user.e2ee_wrapped_key,
        # kept for older clients
        "wrappedKey": user.e2ee_wrapped_key,
        "updatedAt": ms(user.e2ee_updated_at),
    }


@router.get("/me")
def my_keys(user: User = Depends(get_current_user)) -> dict:
    return _keys_view(user)


@router.put("/me")
def set_my_keys(body: KeysIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """First setup (automatic), or a reset to new keys when `replace` is true."""
    changed = user.e2ee_public_key != body.publicKey
    if user.e2ee_public_key and changed and not body.replace:
        raise HTTPException(409, "Secure chat is already set up for your account. Link this device from one where chat works.")
    user.e2ee_public_key = body.publicKey
    if changed:
        # Copies sealed for the old key are useless now.
        user.e2ee_recovery = None
        user.e2ee_wrapped_key = None
        user.e2ee_updated_at = datetime.now(timezone.utc)
        db.execute(delete(DeviceLink).where(DeviceLink.user_id == user.id))
    if body.recovery is not None:
        user.e2ee_recovery = body.recovery
    if body.wrappedKey is not None:
        user.e2ee_wrapped_key = body.wrappedKey
    db.commit()
    if changed:
        # People waiting to message this student can start now (or must re-check a changed key).
        partners = db.execute(select(Conversation.user_low_id, Conversation.user_high_id).where(or_(Conversation.user_low_id == user.id, Conversation.user_high_id == user.id))).all()
        others = {a if b == user.id else b for a, b in partners}
        if others:
            hub.push(others, {"type": "e2ee-key", "userId": str(user.id)})
    return {"ok": True, **_keys_view(user)}


@router.put("/me/recovery")
def set_recovery(body: RecoveryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Stores (or, with null, removes) the copy of the chat key sealed with the student's recovery key."""
    if not user.e2ee_public_key:
        raise HTTPException(409, "Secure chat is not set up yet.")
    user.e2ee_recovery = body.recovery
    db.commit()
    return {"ok": True, "hasRecovery": body.recovery is not None}


@router.delete("/me/legacy")
def drop_legacy(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Removes the old passphrase-sealed copy once a device has moved to the new scheme."""
    user.e2ee_wrapped_key = None
    db.commit()
    return {"ok": True}


@router.get("/peers/{user_id}")
def peer_key(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    other = db.get(User, user_id)
    if other is None or blocked_pair(db, user.id, other.id):
        raise HTTPException(404, "That student was not found.")
    low, high = sorted((user.id, other.id))
    talked = db.scalar(select(Conversation.id).where(Conversation.user_low_id == low, Conversation.user_high_id == high)) is not None
    if not talked and not related(db, user.id, other.id):
        raise HTTPException(403, "You can only look up students you are connected to.")
    return {"publicKey": other.e2ee_public_key, "updatedAt": ms(other.e2ee_updated_at)}


# ---------- device links ----------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _link_for(db: Session, token: str, user: User) -> DeviceLink:
    link = db.scalar(select(DeviceLink).where(DeviceLink.token == token, DeviceLink.user_id == user.id))
    if link is None or as_utc(link.expires_at) < _now():
        raise HTTPException(404, "This request has expired. Start again on the new device.")
    return link


def _label(raw: str, request: Request) -> str:
    text = " ".join(raw.split())[:80]
    return text or (request.headers.get("user-agent") or "New device")[:80]


@router.post("/links")
def request_link(body: LinkIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Called by a new device. Returns an id it polls until another device answers."""
    enforce(f"link:{user.id}", 10, 3600, "You have asked to link many devices. Try again in an hour.")
    if not user.e2ee_public_key:
        raise HTTPException(409, "Secure chat is not set up yet, so there is nothing to link.")
    # One open request per student is enough; a new one replaces the old.
    db.execute(update(DeviceLink).where(DeviceLink.user_id == user.id, DeviceLink.status == "PENDING").values(status="DENIED"))
    link = DeviceLink(
        token=secrets.token_urlsafe(24),
        user_id=user.id,
        label=_label(body.label, request),
        request_key=body.publicKey,
        expires_at=_now() + timedelta(minutes=LINK_MINUTES),
    )
    db.add(link)
    notify(db, user.id, f"{link.label} wants to open your chats. Approve it from a device where chat already works, using the code it shows.", "/chats")
    db.commit()
    hub.push([user.id], {"type": "e2ee-link"})
    return {"id": link.token, "expiresAt": ms(link.expires_at)}


@router.get("/links")
def pending_links(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Open requests, shown on the student's existing devices."""
    rows = db.scalars(
        select(DeviceLink).where(DeviceLink.user_id == user.id, DeviceLink.status == "PENDING", DeviceLink.expires_at > _now()).order_by(DeviceLink.id.desc())
    ).all()
    return {"links": [{"id": r.token, "label": r.label, "publicKey": r.request_key, "createdAt": ms(r.created_at), "expiresAt": ms(r.expires_at)} for r in rows]}


@router.get("/links/{token}")
def link_status(token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Polled by the new device. Once approved it carries the sealed key."""
    link = _link_for(db, token, user)
    return {"status": link.status, "approverKey": link.approver_key, "sealed": link.sealed}


@router.post("/links/{token}/approve")
def approve_link(token: str, body: ApproveIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    enforce(f"link-ok:{user.id}", 20, 3600)
    link = _link_for(db, token, user)
    if link.status != "PENDING":
        raise HTTPException(409, "This request was already answered.")
    link.status = "APPROVED"
    link.approver_key = body.publicKey
    link.sealed = body.sealed
    db.commit()
    hub.push([user.id], {"type": "e2ee-link"})
    return {"ok": True}


@router.post("/links/{token}/deny")
def deny_link(token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    link = _link_for(db, token, user)
    if link.status == "PENDING":
        link.status = "DENIED"
        db.commit()
    hub.push([user.id], {"type": "e2ee-link"})
    return {"ok": True}


@router.delete("/links/{token}")
def cancel_link(token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    db.execute(delete(DeviceLink).where(DeviceLink.token == token, DeviceLink.user_id == user.id))
    db.commit()
    hub.push([user.id], {"type": "e2ee-link"})
    return {"ok": True}
