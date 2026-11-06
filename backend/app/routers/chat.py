import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session

from ..chatfiles import chat_dir
from ..config import settings
from ..crypto import decrypt_bytes, decrypt_text, encrypt_bytes, encrypt_text
from ..db import get_db
from ..deps import get_current_user
from ..helpers import notify
from ..models import Activity, ActivityRequest, Conversation, Message, Report, Ride, RideRequest, User, UserBlock
from ..ratelimit import enforce
from ..realtime import hub
from ..relations import is_restricted, set_block, set_restrict
from ..views import ms, public_person

router = APIRouter(prefix="/chats", tags=["chat"])


class StartIn(BaseModel):
    userId: int


class SendIn(BaseModel):
    envelope: str = Field(min_length=10, max_length=12000)  # end-to-end encrypted; the server cannot read it


class BlockIn(BaseModel):
    blocked: bool


class ReportIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    evidence: str | None = Field(default=None, max_length=3000)  # lines the reporter chose to share


def _pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def related(db: Session, a: int, b: int) -> bool:
    """Two students may start a chat only when one asked to join (or joined) the other's ride or activity."""
    ride = db.scalar(
        select(Ride.id)
        .join(RideRequest, RideRequest.ride_id == Ride.id)
        .where(
            RideRequest.status.in_(("PENDING", "ACCEPTED")),
            or_(and_(Ride.creator_id == a, RideRequest.requester_id == b), and_(Ride.creator_id == b, RideRequest.requester_id == a)),
        )
        .limit(1)
    )
    if ride is not None:
        return True
    act = db.scalar(
        select(Activity.id)
        .join(ActivityRequest, ActivityRequest.activity_id == Activity.id)
        .where(
            ActivityRequest.status.in_(("PENDING", "ACCEPTED")),
            or_(and_(Activity.creator_id == a, ActivityRequest.requester_id == b), and_(Activity.creator_id == b, ActivityRequest.requester_id == a)),
        )
        .limit(1)
    )
    return act is not None


def _block_state(db: Session, me: int, other: int) -> tuple[bool, bool]:
    """(blocked by me, blocked me)"""
    by_me = db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == me, UserBlock.blocked_id == other)) is not None
    me_blocked = db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == other, UserBlock.blocked_id == me)) is not None
    return by_me, me_blocked


def _convo_for(db: Session, convo_id: int, user: User) -> Conversation:
    convo = db.get(Conversation, convo_id)
    if convo is None or user.id not in (convo.user_low_id, convo.user_high_id):
        raise HTTPException(404, "Conversation not found.")
    return convo


def _other_id(convo: Conversation, me: int) -> int:
    return convo.user_high_id if convo.user_low_id == me else convo.user_low_id


def _person(u: User | None) -> dict:
    if u is None:
        return {"id": "0", "name": "Former student", "avatarUrl": None, "year": None}
    p = public_person(u)
    return {"id": p["id"], "name": p["name"], "avatarUrl": p["avatarUrl"], "year": p["year"]}


def _ctx(convo_id: int) -> str:
    return f"chat:{convo_id}"


def _preview(m: Message) -> dict:
    """The server cannot read secure messages. It hands the sealed envelope to the browser, which opens the preview itself."""
    if m.e2ee:
        return {"text": "", "e2ee": True, "hasImage": bool(m.image_file), "envelope": decrypt_text(m.body, _ctx(m.conversation_id)), "senderId": str(m.sender_id)}
    text = decrypt_text(m.body, _ctx(m.conversation_id))
    return {"text": text or ("Photo" if m.image_file else ""), "e2ee": False, "hasImage": bool(m.image_file), "envelope": None, "senderId": str(m.sender_id)}


@router.get("")
def list_chats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    convos = db.scalars(select(Conversation).where(or_(Conversation.user_low_id == user.id, Conversation.user_high_id == user.id))).all()
    out = []
    for c in convos:
        last = db.scalar(select(Message).where(Message.conversation_id == c.id).order_by(Message.id.desc()).limit(1))
        unread = db.scalar(select(func.count()).select_from(Message).where(Message.conversation_id == c.id, Message.sender_id != user.id, Message.read_at.is_(None))) or 0
        other = db.get(User, _other_id(c, user.id))
        out.append(
            {
                "id": str(c.id),
                "other": {**_person(other), "publicKey": other.e2ee_public_key if other else None},
                "last": {**_preview(last), "at": ms(last.created_at), "mine": last.sender_id == user.id} if last else None,
                "unread": unread,
                "restricted": is_restricted(db, user.id, _other_id(c, user.id)),
                "sortAt": ms(last.created_at) if last else ms(c.created_at),
            }
        )
    out.sort(key=lambda x: x["sortAt"] or 0, reverse=True)
    return {"chats": out}


@router.post("")
def start_chat(body: StartIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    if body.userId == user.id:
        raise HTTPException(400, "You cannot message yourself.")
    other = db.get(User, body.userId)
    if other is None:
        raise HTTPException(404, "That student was not found.")
    if any(_block_state(db, user.id, other.id)):
        raise HTTPException(403, "You cannot message this student.")
    low, high = _pair(user.id, other.id)
    convo = db.scalar(select(Conversation).where(Conversation.user_low_id == low, Conversation.user_high_id == high))
    if convo is None:
        if not related(db, user.id, other.id):
            raise HTTPException(403, "You can message a student once one of you has asked to join the other's ride or activity.")
        convo = Conversation(user_low_id=low, user_high_id=high)
        db.add(convo)
        db.commit()
    return {"id": str(convo.id)}


@router.get("/{convo_id}")
def get_chat(convo_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    convo = _convo_for(db, convo_id, user)
    other_id = _other_id(convo, user.id)
    by_me, me_blocked = _block_state(db, user.id, other_id)
    return {
        "id": str(convo.id),
        "other": _person(db.get(User, other_id)),
        "blockedByMe": by_me,
        "blockedMe": me_blocked,
        "restrictedByMe": is_restricted(db, user.id, other_id),
    }


@router.get("/{convo_id}/messages")
def list_messages(convo_id: int, after: int = Query(default=0, ge=0), user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    convo = _convo_for(db, convo_id, user)
    rows = db.scalars(select(Message).where(Message.conversation_id == convo.id, Message.id > after).order_by(Message.id.desc()).limit(200)).all()
    rows.reverse()
    return {
        "messages": [
            {
                "id": m.id,
                "senderId": "me" if m.sender_id == user.id else str(m.sender_id),
                "e2ee": m.e2ee,
                "envelope": decrypt_text(m.body, _ctx(convo.id)) if m.e2ee else None,
                "text": "" if m.e2ee else decrypt_text(m.body, _ctx(convo.id)),
                "imageUrl": f"/chats/{convo.id}/images/{m.id}" if m.image_file else None,
                "at": ms(m.created_at),
                "read": m.read_at is not None,
            }
            for m in rows
        ]
    }


def _can_send(db: Session, convo: Conversation, user: User) -> int:
    other_id = _other_id(convo, user.id)
    if db.get(User, other_id) is None:
        raise HTTPException(409, "This student has left CampusPool.")
    if any(_block_state(db, user.id, other_id)):
        raise HTTPException(403, "You cannot message this student.")
    other = db.get(User, other_id)
    if not user.e2ee_public_key or other is None or not other.e2ee_public_key:
        raise HTTPException(409, "Secure chat is not set up for both students yet.")
    return other_id


def _store_message(db: Session, convo: Conversation, user: User, other_id: int, envelope: str, image_file: str | None = None) -> Message:
    already_unread = db.scalar(select(func.count()).select_from(Message).where(Message.conversation_id == convo.id, Message.sender_id == user.id, Message.read_at.is_(None))) or 0
    msg = Message(conversation_id=convo.id, sender_id=user.id, body=encrypt_text(envelope, _ctx(convo.id)), e2ee=True, image_file=image_file)
    db.add(msg)
    if already_unread == 0 and not is_restricted(db, other_id, user.id):  # one notification per burst; none if the recipient restricted the sender
        notify(db, other_id, f"New message from {user.name}.", f"/chats/{convo.id}")
    db.commit()
    hub.push([user.id, other_id], {"type": "chat", "conversationId": str(convo.id)})
    return msg


@router.post("/{convo_id}/messages")
def send_message(convo_id: int, body: SendIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    enforce(f"msg:{user.id}", 60, 60, "You are sending messages too fast.")
    convo = _convo_for(db, convo_id, user)
    other_id = _can_send(db, convo, user)
    msg = _store_message(db, convo, user, other_id, body.envelope.strip())
    return {"id": msg.id}


@router.post("/{convo_id}/images")
async def send_image(convo_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """The body is the photo already encrypted in the sender's browser; the envelope header says how to open it."""
    if (request.headers.get("content-type") or "").split(";")[0].strip() != "application/octet-stream":
        raise HTTPException(415, "Photos are sent encrypted.")
    envelope = (request.headers.get("x-envelope") or "").strip()
    if not (10 <= len(envelope) <= 4000):
        raise HTTPException(422, "The photo is missing its encryption details.")
    limit = settings.max_chat_image_bytes + 1024
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(413, "That photo is too large. Use one under 5 MB.")
    data = await request.body()
    if not data or len(data) > limit:
        raise HTTPException(413, "That photo is too large. Use one under 5 MB.")

    def save() -> dict:
        enforce(f"img:{user.id}", 20, 600, "You are sending photos too fast.")
        convo = _convo_for(db, convo_id, user)
        other_id = _can_send(db, convo, user)
        name = f"{secrets.token_urlsafe(24)}.enc"
        with open(os.path.join(chat_dir(), name), "wb") as fh:
            fh.write(encrypt_bytes(data, f"img:{convo.id}"))  # sealed again at rest, on top of the sender's own encryption
        msg = _store_message(db, convo, user, other_id, envelope, image_file=name)
        return {"id": msg.id}

    return await run_in_threadpool(save)


@router.get("/{convo_id}/images/{message_id}")
def get_image(convo_id: int, message_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    convo = _convo_for(db, convo_id, user)
    msg = db.get(Message, message_id)
    if msg is None or msg.conversation_id != convo.id or not msg.image_file:
        raise HTTPException(404, "Photo not found.")
    path = os.path.join(chat_dir(), msg.image_file)
    if not os.path.isfile(path):
        raise HTTPException(404, "Photo not found.")
    try:
        with open(path, "rb") as fh:
            data = decrypt_bytes(fh.read(), f"img:{convo.id}")
    except Exception:
        raise HTTPException(404, "Photo not found.") from None
    return Response(content=data, media_type=("application/octet-stream" if msg.e2ee else (msg.image_mime or "application/octet-stream")), headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"})


def typing_target(db: Session, convo_id: int, user_id: int) -> int | None:
    """Who should see "typing..." for this user in this conversation, if anyone. Used by the WebSocket."""
    convo = db.get(Conversation, convo_id)
    if convo is None or user_id not in (convo.user_low_id, convo.user_high_id):
        return None
    other_id = _other_id(convo, user_id)
    if any(_block_state(db, user_id, other_id)) or is_restricted(db, other_id, user_id):
        return None  # blocked pairs see nothing; restricted students reach the other person quietly
    return other_id


@router.post("/{convo_id}/read")
def mark_read(convo_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    convo = _convo_for(db, convo_id, user)
    db.execute(
        update(Message).where(Message.conversation_id == convo.id, Message.sender_id != user.id, Message.read_at.is_(None)).values(read_at=datetime.now(timezone.utc))
    )
    db.commit()
    hub.push([user.id, _other_id(convo, user.id)], {"type": "chat", "conversationId": str(convo.id)})
    return {"ok": True}


@router.post("/{convo_id}/block")
def block_from_chat(convo_id: int, body: BlockIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    convo = _convo_for(db, convo_id, user)
    other_id = _other_id(convo, user.id)
    set_block(db, user.id, other_id, body.blocked)
    db.commit()
    hub.push([user.id, other_id], {"type": "chat", "conversationId": str(convo.id)})
    return {"ok": True, "blockedByMe": body.blocked}


@router.post("/{convo_id}/restrict")
def restrict_from_chat(convo_id: int, body: BlockIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    convo = _convo_for(db, convo_id, user)
    set_restrict(db, user.id, _other_id(convo, user.id), body.blocked)
    db.commit()
    hub.push([user.id], {"type": "chat", "conversationId": str(convo.id)})
    return {"ok": True, "restrictedByMe": body.blocked}


@router.post("/{convo_id}/report")
def report_student(convo_id: int, body: ReportIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    enforce(f"report:{user.id}", 20, 3600, "You have sent many reports. Try again later.")
    convo = _convo_for(db, convo_id, user)
    other = db.get(User, _other_id(convo, user.id))
    if other is None:
        raise HTTPException(404, "That student has left CampusPool.")
    db.add(Report(reporter_id=user.id, kind="user", target_id=other.id, target_title=f"Student: {other.name}"[:160], reason=body.reason.strip(), evidence=(body.evidence or "").strip() or None))
    db.commit()
    return {"ok": True}
