"""Encrypted chat photos (see storage.py for where they are kept). These helpers delete them."""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from . import storage
from .models import Conversation, Message


def remove_chat_file(name: str | None) -> None:
    storage.remove("chat", name)


def purge_chat_files(db: Session, user_id: int) -> None:
    """Delete the photo files of every conversation a student is part of (used when they delete their account)."""
    convo_ids = select(Conversation.id).where(or_(Conversation.user_low_id == user_id, Conversation.user_high_id == user_id))
    for name in db.scalars(select(Message.image_file).where(Message.conversation_id.in_(convo_ids), Message.image_file.is_not(None))).all():
        remove_chat_file(name)
