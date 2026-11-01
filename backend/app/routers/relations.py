from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..helpers import commit_and_push
from ..models import User, UserBlock, UserRestriction
from ..relations import set_block, set_restrict
from ..views import avatar_path

router = APIRouter(prefix="/relations", tags=["relations"])


class ToggleIn(BaseModel):
    userId: int
    on: bool


def _person(u: User) -> dict:
    return {"id": str(u.id), "name": u.name, "avatarUrl": avatar_path(u)}


def _other(db: Session, me: User, user_id: int) -> User:
    if user_id == me.id:
        raise HTTPException(400, "You cannot do that to yourself.")
    other = db.get(User, user_id)
    if other is None:
        raise HTTPException(404, "That student was not found.")
    return other


@router.get("")
def list_relations(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    blocked = db.scalars(select(User).join(UserBlock, UserBlock.blocked_id == User.id).where(UserBlock.blocker_id == user.id)).all()
    restricted = db.scalars(select(User).join(UserRestriction, UserRestriction.restricted_id == User.id).where(UserRestriction.restrictor_id == user.id)).all()
    return {"blocked": [_person(u) for u in blocked], "restricted": [_person(u) for u in restricted]}


@router.post("/block")
def block(body: ToggleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    other = _other(db, user, body.userId)
    set_block(db, user.id, other.id, body.on)
    commit_and_push(db, [user.id, other.id])
    return {"ok": True}


@router.post("/restrict")
def restrict(body: ToggleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    other = _other(db, user, body.userId)
    set_restrict(db, user.id, other.id, body.on)
    commit_and_push(db, [user.id])  # the restricted student is not told
    return {"ok": True}
