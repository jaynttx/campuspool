"""Where uploaded files (profile photos, sealed chat photos) are kept.

STORAGE_BACKEND=disk      files under UPLOAD_DIR (default; use with a permanent disk)
STORAGE_BACKEND=database  files in the stored_files table (for hosts whose disk is wiped on restart, like free Render)
"""

import os
import re

from sqlalchemy import delete, select

from .config import settings
from .db import session_factory
from .models import StoredFile

KINDS = ("avatars", "chat")
_SAFE = re.compile(r"^[A-Za-z0-9_\-]{8,80}\.[a-z]{2,4}$")


def _valid(kind: str, name: str | None) -> bool:
    return kind in KINDS and bool(name) and bool(_SAFE.match(name or ""))


def _in_db() -> bool:
    return settings.storage_backend == "database"


def _path(kind: str, name: str) -> str:
    folder = os.path.join(settings.upload_dir, kind)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, name)


def put(kind: str, name: str, data: bytes) -> None:
    if not _valid(kind, name):
        raise ValueError("bad file name")
    if _in_db():
        with session_factory()() as db:
            db.add(StoredFile(kind=kind, name=name, data=data))
            db.commit()
        return
    with open(_path(kind, name), "wb") as fh:
        fh.write(data)


def get(kind: str, name: str | None) -> bytes | None:
    if not _valid(kind, name):
        return None
    assert name is not None
    if _in_db():
        with session_factory()() as db:
            return db.scalar(select(StoredFile.data).where(StoredFile.kind == kind, StoredFile.name == name))
    try:
        with open(_path(kind, name), "rb") as fh:
            return fh.read()
    except FileNotFoundError:
        return None


def remove(kind: str, name: str | None) -> None:
    if not _valid(kind, name):
        return
    assert name is not None
    if _in_db():
        with session_factory()() as db:
            db.execute(delete(StoredFile).where(StoredFile.kind == kind, StoredFile.name == name))
            db.commit()
        return
    try:
        os.remove(_path(kind, name))
    except FileNotFoundError:
        pass
