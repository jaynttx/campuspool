"""Encryption at rest for chat messages and chat photos (AES-256-GCM).

This protects stored data: a copy of the database or the uploads folder is unreadable without
DATA_ENCRYPTION_KEY. It is NOT end-to-end encryption: the running server holds the key and decrypts
messages to show them to the two people in a conversation. Use HTTPS in production for data in transit.
"""

import base64
import os
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings

PREFIX = "v1:"
_aes: AESGCM | None = None


def _load_key() -> bytes:
    raw = settings.data_encryption_key
    if raw:
        key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
        if len(key) != 32:
            raise RuntimeError("DATA_ENCRYPTION_KEY must be 32 random bytes, urlsafe-base64 encoded.")
        return key
    # Development only: keep one generated key next to the uploads so messages stay readable across restarts.
    os.makedirs(settings.upload_dir, exist_ok=True)
    path = os.path.join(settings.upload_dir, ".dev_data_key")
    if os.path.exists(path):
        with open(path, "rb") as fh:
            return base64.urlsafe_b64decode(fh.read().strip())
    key = secrets.token_bytes(32)
    with open(path, "wb") as fh:
        fh.write(base64.urlsafe_b64encode(key))
    os.chmod(path, 0o600)
    return key


def _cipher() -> AESGCM:
    global _aes
    if _aes is None:
        _aes = AESGCM(_load_key())
    return _aes


def encrypt_bytes(data: bytes, context: str) -> bytes:
    """`context` (for example "chat:12") is authenticated, so a ciphertext cannot be moved to another conversation."""
    nonce = secrets.token_bytes(12)
    return nonce + _cipher().encrypt(nonce, data, context.encode())


def decrypt_bytes(blob: bytes, context: str) -> bytes:
    return _cipher().decrypt(blob[:12], blob[12:], context.encode())


def encrypt_text(text: str, context: str) -> str:
    return PREFIX + base64.urlsafe_b64encode(encrypt_bytes(text.encode(), context)).decode()


def decrypt_text(stored: str, context: str) -> str:
    if not stored.startswith(PREFIX):
        return stored  # written before encryption existed
    try:
        return decrypt_bytes(base64.urlsafe_b64decode(stored[len(PREFIX):]), context).decode()
    except (InvalidTag, ValueError):
        return "[This message could not be decrypted.]"
