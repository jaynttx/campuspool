import hashlib
import hmac
import re
import secrets

from .config import settings

# No "+": name+1@domain and name@domain are the same mailbox, which would allow many accounts per person.
_LOCAL_PART = re.compile(r"^[a-z0-9][a-z0-9._%\-]{0,63}$")
_EXTRA = re.compile(settings.email_pattern) if settings.email_pattern else None


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


def is_allowed_email(email: str) -> bool:
    """Exactly one '@', a sane local part, and the domain must be the allowed one (default thapar.edu)."""
    if len(email) > 254 or email.count("@") != 1:
        return False
    local, domain = email.split("@")
    if domain != settings.allowed_email_domain or not _LOCAL_PART.match(local):
        return False
    return _EXTRA is None or bool(_EXTRA.fullmatch(email))


def new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(email: str, code: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def codes_match(email: str, code: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_code(email, code), expected_hash)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
