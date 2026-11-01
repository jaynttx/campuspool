from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _tz() -> DateTime:
    return DateTime(timezone=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    branch: Mapped[str] = mapped_column(String(80), default="")
    year: Mapped[int] = mapped_column(Integer, default=1)
    hostel: Mapped[str] = mapped_column(String(80), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    upi_id: Mapped[str] = mapped_column(String(80), default="")
    avatar_file: Mapped[str | None] = mapped_column(String(120), nullable=True)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    banned_at: Mapped[datetime | None] = mapped_column(_tz(), nullable=True)
    e2ee_public_key: Mapped[str | None] = mapped_column(Text, nullable=True)  # for secure chat
    e2ee_wrapped_key: Mapped[str | None] = mapped_column(Text, nullable=True)  # private key sealed with the student's chat passphrase
    e2ee_updated_at: Mapped[datetime | None] = mapped_column(_tz(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(String(10))  # signin | signup
    pending_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(_tz())
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(_tz(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(_tz())
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class Ride(Base):
    __tablename__ = "rides"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(120))
    destination: Mapped[str] = mapped_column(String(120))
    departs_at: Mapped[datetime] = mapped_column(_tz(), index=True)
    total_seats: Mapped[int] = mapped_column(Integer)
    expected_fare: Mapped[float] = mapped_column(Numeric(10, 2))
    actual_fare: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="PENDING", index=True)  # PENDING | ONGOING | COMPLETED | CANCELLED
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    src_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    src_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    dst_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    dst_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    series_id: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)  # rides created together as a repeating series
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(_tz(), nullable=True)


class RideRequest(Base):
    __tablename__ = "ride_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id", ondelete="CASCADE"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="PENDING")  # PENDING | ACCEPTED | REJECTED
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("ride_id", "payer_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(ForeignKey("rides.id", ondelete="CASCADE"), index=True)
    payer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(10), default="PENDING")  # PENDING | SUCCESS (set only by the ride creator)
    rider_marked_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    paid_at: Mapped[datetime | None] = mapped_column(_tz(), nullable=True)


class Activity(Base):
    __tablename__ = "activities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(10))
    location: Mapped[str] = mapped_column(String(120))
    starts_at: Mapped[datetime] = mapped_column(_tz(), index=True)
    description: Mapped[str] = mapped_column(String(500), default="")
    max_participants: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), default="UPCOMING", index=True)  # UPCOMING | ONGOING | COMPLETED | CANCELLED
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class ActivityRequest(Base):
    __tablename__ = "activity_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class ActivityMessage(Base):
    __tablename__ = "activity_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(300))
    href: Mapped[str | None] = mapped_column(String(120), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    target_id: Mapped[int] = mapped_column(Integer)
    target_title: Mapped[str] = mapped_column(String(160))
    reason: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(10), default="OPEN", index=True)  # OPEN | RESOLVED
    resolution: Mapped[str | None] = mapped_column(String(300), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(_tz(), nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)  # chat lines the reporter chose to share (decrypted on their device)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    blocker_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class UserRestriction(Base):
    """A restricted student can still ask to join and message, but it reaches the restrictor quietly: no notifications, no badge counts."""

    __tablename__ = "user_restrictions"
    __table_args__ = (UniqueConstraint("restrictor_id", "restricted_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    restrictor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    restricted_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("user_low_id", "user_high_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_low_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_high_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)  # at-rest encrypted (see crypto.py). When e2ee is true it holds an end-to-end envelope the server cannot read.
    e2ee: Mapped[bool] = mapped_column(Boolean, default=False)
    image_file: Mapped[str | None] = mapped_column(String(120), nullable=True)  # encrypted file under uploads/chat
    image_mime: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(_tz(), nullable=True)


class HiddenItem(Base):
    """A student's own "remove from my list" for a finished ride or activity."""

    __tablename__ = "hidden_items"
    __table_args__ = (UniqueConstraint("user_id", "kind", "target_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # ride | activity
    target_id: Mapped[int] = mapped_column(Integer)


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(10))  # bug | idea | praise | other
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(10), default="NEW", index=True)  # NEW | READ
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class RideRating(Base):
    """Ratings outlive the ride they came from, so the ride is stored as a plain number plus a title, not a foreign key."""

    __tablename__ = "ride_ratings"
    __table_args__ = (UniqueConstraint("ride_id", "rater_id", "ratee_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ride_id: Mapped[int] = mapped_column(Integer, index=True)
    ride_title: Mapped[str] = mapped_column(String(160))
    rater_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ratee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stars: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow)


class ReminderSent(Base):
    __tablename__ = "reminders_sent"
    __table_args__ = (UniqueConstraint("kind", "target_id", "user_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # ride | activity
    target_id: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sent_at: Mapped[datetime] = mapped_column(_tz(), default=utcnow, index=True)
