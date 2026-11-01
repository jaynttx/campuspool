"""Key storage for secure (end-to-end encrypted) chat.

The server keeps each student's PUBLIC key and a copy of their PRIVATE key that is sealed with their chat
passphrase in the browser. The server never sees the passphrase or the unsealed private key.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Conversation, User
from ..relations import blocked_pair
from ..views import ms
from .chat import related

router = APIRouter(prefix="/e2ee", tags=["secure-chat"])


class KeysIn(BaseModel):
    publicKey: str = Field(min_length=20, max_length=2000)
    wrappedKey: str = Field(min_length=20, max_length=8000)


@router.get("/me")
def my_keys(user: User = Depends(get_current_user)) -> dict:
    return {"publicKey": user.e2ee_public_key, "wrappedKey": user.e2ee_wrapped_key, "updatedAt": ms(user.e2ee_updated_at)}


@router.put("/me")
def set_my_keys(body: KeysIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """First setup, a passphrase change (same public key), or a reset (new keys; old messages become unreadable)."""
    user.e2ee_public_key = body.publicKey
    user.e2ee_wrapped_key = body.wrappedKey
    user.e2ee_updated_at = datetime.now(timezone.utc)
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
