"""All settings come from environment variables (and backend/.env when present)."""

import logging
import os
import secrets
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("campuspool")


def _database_url(raw: str | None) -> str | None:
    """Accepts the plain postgres:// or postgresql:// address hosts like Neon show, and uses the psycopg 3 driver."""
    if not raw:
        return None
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


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
    brevo_api_key: str | None
    mail_from_email: str | None
    mail_from_name: str
    upload_dir: str
    storage_backend: str
    cleanup_interval_seconds: int
    cleanup_idle_seconds: int
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
        database_url=_database_url(os.getenv("DATABASE_URL")),
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
        # Email over HTTPS (for hosts that block SMTP ports, such as free Render services).
        brevo_api_key=os.getenv("BREVO_API_KEY") or None,
        mail_from_email=os.getenv("MAIL_FROM_EMAIL") or None,
        mail_from_name=os.getenv("MAIL_FROM_NAME") or "CampusPool",
        upload_dir=os.getenv("UPLOAD_DIR", "uploads"),
        # "disk" (default) or "database" for hosts whose disk is wiped on restart, such as free Render services.
        storage_backend=(os.getenv("STORAGE_BACKEND") or "disk").strip().lower(),
        cleanup_interval_seconds=max(30, int(os.getenv("CLEANUP_INTERVAL_SECONDS", "60"))),
        # While nobody is using the app, housekeeping runs only this often, so a sleeping database can stay asleep.
        cleanup_idle_seconds=max(60, int(os.getenv("CLEANUP_IDLE_SECONDS", "1800"))),
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
