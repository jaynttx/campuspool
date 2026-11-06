"""All settings come from environment variables (and backend/.env when present)."""

import logging
import os
import secrets
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("campuspool")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str | None
    secret_key: str
    cors_origins: list[str]
    allowed_email_domain: str
    otp_ttl_minutes: int
    otp_resend_seconds: int
    otp_max_per_hour: int
    otp_max_attempts: int
    session_days: int
    cookie_secure: bool
    smtp_host: str | None
    smtp_port: int
    smtp_user: str | None
    smtp_password: str | None
    smtp_from: str | None
    smtp_starttls: bool
    upload_dir: str
    max_avatar_bytes: int
    ride_grace_hours: int
    activity_grace_hours: int
    settled_ride_keep_hours: int
    admin_emails: list[str]
    trust_proxy: bool
    email_pattern: str | None
    auto_create_tables: bool
    rate_limits_enabled: bool
    cors_origin_regex: str | None
    data_encryption_key: str | None
    message_retention_days: int
    max_chat_image_bytes: int


def load_settings() -> Settings:
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()
    secret = os.getenv("SECRET_KEY", "").strip()
    if not secret:
        if environment == "production":
            raise RuntimeError("SECRET_KEY must be set when ENVIRONMENT=production.")
        secret = secrets.token_urlsafe(48)
        log.warning("SECRET_KEY is not set. Using a random key for this run; one-time codes sent before a restart will stop working.")
    if environment == "production" and not os.getenv("DATA_ENCRYPTION_KEY"):
        raise RuntimeError("DATA_ENCRYPTION_KEY must be set when ENVIRONMENT=production.")
    origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    dev_regex = r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):3000"
    return Settings(
        environment=environment,
        database_url=os.getenv("DATABASE_URL") or None,
        secret_key=secret,
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
        allowed_email_domain=os.getenv("ALLOWED_EMAIL_DOMAIN", "thapar.edu").strip().lower(),
        otp_ttl_minutes=_int("OTP_TTL_MINUTES", 10),
        otp_resend_seconds=_int("OTP_RESEND_SECONDS", 30),
        otp_max_per_hour=_int("OTP_MAX_PER_HOUR", 5),
        otp_max_attempts=_int("OTP_MAX_ATTEMPTS", 5),
        session_days=_int("SESSION_DAYS", 30),
        cookie_secure=_bool("COOKIE_SECURE", environment == "production"),
        smtp_host=os.getenv("SMTP_HOST") or None,
        smtp_port=_int("SMTP_PORT", 587),
        smtp_user=os.getenv("SMTP_USER") or None,
        smtp_password=os.getenv("SMTP_PASSWORD") or None,
        smtp_from=os.getenv("SMTP_FROM") or None,
        smtp_starttls=_bool("SMTP_STARTTLS", True),
        upload_dir=os.getenv("UPLOAD_DIR", "uploads"),
        max_avatar_bytes=_int("MAX_AVATAR_BYTES", 2 * 1024 * 1024),
        ride_grace_hours=_int("RIDE_GRACE_HOURS", 12),
        activity_grace_hours=_int("ACTIVITY_GRACE_HOURS", 2),
        settled_ride_keep_hours=_int("SETTLED_RIDE_KEEP_HOURS", 24),
        admin_emails=[e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()],
        trust_proxy=_bool("TRUST_PROXY", False),
        email_pattern=os.getenv("EMAIL_PATTERN") or None,
        auto_create_tables=_bool("AUTO_CREATE_TABLES", environment != "production"),
        rate_limits_enabled=_bool("RATE_LIMITS", True),
        data_encryption_key=os.getenv("DATA_ENCRYPTION_KEY") or None,
        message_retention_days=_int("MESSAGE_RETENTION_DAYS", 90),
        max_chat_image_bytes=_int("MAX_CHAT_IMAGE_BYTES", 5 * 1024 * 1024),
        cors_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or (dev_regex if environment == "development" else None),
    )


settings = load_settings()
