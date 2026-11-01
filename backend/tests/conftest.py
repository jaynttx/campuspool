"""Integration tests run against an in-memory SQLite database. They need `pip install -r requirements-dev.txt`."""

import base64
import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["ENVIRONMENT"] = "development"
os.environ["RATE_LIMITS"] = "false"
os.environ["OTP_RESEND_SECONDS"] = "0"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_EMAILS"] = "admin@thapar.edu"
os.environ["SMTP_HOST"] = ""
os.environ["DATA_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"k" * 32).decode()
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="campuspool-test-")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, get_engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    from app import models  # noqa: F401

    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def codes(monkeypatch):
    """Captures the one-time code instead of sending it."""
    sent: dict[str, str] = {}

    def fake(email: str, code: str) -> str:
        sent[email] = code
        return "console"

    monkeypatch.setattr("app.routers.auth.deliver_otp", fake)
    return sent


@pytest.fixture
def make_client():
    clients = []

    def _make() -> TestClient:
        c = TestClient(app)
        clients.append(c)
        return c

    yield _make


def sign_up(client: TestClient, codes: dict, email: str, name: str = "Test Student") -> dict:
    r = client.post("/auth/request-otp", json={"email": email, "purpose": "signup", "profile": {"name": name}})
    assert r.status_code == 200, r.text
    r = client.post("/auth/verify-otp", json={"email": email, "code": codes[email]})
    assert r.status_code == 200, r.text
    return r.json()["user"]
