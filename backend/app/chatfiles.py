"""Encrypted chat photos live on disk. These helpers find and delete them."""

import os

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .config import settings
from .models import Conversation, Message


def chat_dir() -> str:
    path = os.path.join(settings.upload_dir, "chat")
    os.makedirs(path, exist_ok=True)
    return path


def remove_chat_file(name: str | None) -> None:
    if not name or "/" in name or "\\" in name or name.startswith("."):
        return
    try:
        os.remove(os.path.join(chat_dir(), name))
    except FileNotFoundError:
        pass


def purge_chat_files(db: Session, user_id: int) -> None:
    """Delete the photo files of every conversation a student is part of (used when they delete their account)."""
    convo_ids = select(Conversation.id).where(or_(Conversation.user_low_id == user_id, Conversation.user_high_id == user_id))
    for name in db.scalars(select(Message.image_file).where(Message.conversation_id.in_(convo_ids), Message.image_file.is_not(None))).all():
        remove_chat_file(name)
