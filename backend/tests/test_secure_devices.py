"""Automatic secure-chat keys, device linking, recovery keys, typing hints and signing out other browsers."""

from .conftest import sign_up
from .test_api import ENVELOPE, connected_pair

KEY_A = "A" * 60
KEY_B = "B" * 60
ONE_TIME = "T" * 60
SEALED = "S" * 80


def test_first_key_is_set_once_and_a_reset_needs_replace(make_client, codes):
    a = make_client()
    sign_up(a, codes, "keys@thapar.edu", "Key Owner")
    assert a.put("/e2ee/me", json={"publicKey": KEY_A}).status_code == 200
    # A second device starting at the same moment must not overwrite the first key.
    assert a.put("/e2ee/me", json={"publicKey": KEY_B}).status_code == 409
    assert a.get("/e2ee/me").json()["publicKey"] == KEY_A
    # Same key again is harmless (for example a retry).
    assert a.put("/e2ee/me", json={"publicKey": KEY_A}).status_code == 200

    assert a.put("/e2ee/me/recovery", json={"recovery": "R" * 40}).status_code == 200
    assert a.get("/e2ee/me").json()["recovery"] == "R" * 40

    # A reset makes new keys and drops copies sealed for the old one.
    r = a.put("/e2ee/me", json={"publicKey": KEY_B, "replace": True})
    assert r.status_code == 200
    me = a.get("/e2ee/me").json()
    assert me["publicKey"] == KEY_B and me["recovery"] is None and me["legacyWrappedKey"] is None


def test_new_device_gets_the_sealed_key_only_after_approval(make_client, codes):
    old, new, other = make_client(), make_client(), make_client()
    sign_up(old, codes, "devices@thapar.edu", "Two Devices")
    # The same student signs in on a second browser.
    new.post("/auth/request-otp", json={"email": "devices@thapar.edu", "purpose": "signin"})
    assert new.post("/auth/verify-otp", json={"email": "devices@thapar.edu", "code": codes["devices@thapar.edu"]}).status_code == 200
    sign_up(other, codes, "someone-else@thapar.edu", "Someone Else")

    assert new.post("/e2ee/links", json={"publicKey": ONE_TIME, "label": "Phone"}).status_code == 409  # nothing to link yet
    old.put("/e2ee/me", json={"publicKey": KEY_A})

    link = new.post("/e2ee/links", json={"publicKey": ONE_TIME, "label": "Chrome on Android"}).json()["id"]
    assert new.get(f"/e2ee/links/{link}").json() == {"status": "PENDING", "approverKey": None, "sealed": None}

    pending = old.get("/e2ee/links").json()["links"]
    assert len(pending) == 1 and pending[0]["publicKey"] == ONE_TIME and pending[0]["label"] == "Chrome on Android"
    assert any("wants to open your chats" in n["text"] for n in old.get("/bootstrap").json()["notifications"])

    # Another student can neither see nor answer it.
    assert other.get("/e2ee/links").json()["links"] == []
    assert other.post(f"/e2ee/links/{link}/approve", json={"publicKey": KEY_B, "sealed": SEALED}).status_code == 404

    assert old.post(f"/e2ee/links/{link}/approve", json={"publicKey": KEY_B, "sealed": SEALED}).status_code == 200
    assert old.post(f"/e2ee/links/{link}/approve", json={"publicKey": KEY_B, "sealed": SEALED}).status_code == 409  # answered once
    assert new.get(f"/e2ee/links/{link}").json() == {"status": "APPROVED", "approverKey": KEY_B, "sealed": SEALED}
    assert old.get("/e2ee/links").json()["links"] == []


def test_denied_and_replaced_requests(make_client, codes):
    a = make_client()
    sign_up(a, codes, "deny@thapar.edu", "Deny Me")
    a.put("/e2ee/me", json={"publicKey": KEY_A})
    first = a.post("/e2ee/links", json={"publicKey": ONE_TIME}).json()["id"]
    second = a.post("/e2ee/links", json={"publicKey": ONE_TIME + "2"}).json()["id"]
    assert a.get(f"/e2ee/links/{first}").json()["status"] == "DENIED"  # a newer request replaces the older one
    assert a.post(f"/e2ee/links/{second}/deny").status_code == 200
    assert a.get(f"/e2ee/links/{second}").json()["status"] == "DENIED"
    assert a.delete(f"/e2ee/links/{second}").status_code == 200
    assert a.get(f"/e2ee/links/{second}").status_code == 404


def test_chat_list_carries_the_sealed_preview_and_peer_key(make_client, codes):
    a, b, ua, ub, cid, _ = connected_pair(make_client, codes, "preview")
    b.post(f"/chats/{cid}/messages", json={"envelope": ENVELOPE})
    row = a.get("/chats").json()["chats"][0]
    assert row["last"]["envelope"] == ENVELOPE and row["last"]["text"] == ""  # still unreadable to the server
    assert row["last"]["senderId"] == str(ub["userId"])
    assert row["other"]["publicKey"].endswith("b")


def test_typing_hint_reaches_only_the_other_person(make_client, codes):
    from app.db import session_factory
    from app.routers.chat import typing_target

    a, b, ua, ub, cid, _ = connected_pair(make_client, codes, "typing")
    with session_factory()() as db:
        assert typing_target(db, int(cid), ub["userId"]) == ua["userId"]
        assert typing_target(db, int(cid), 999999) is None
    a.post(f"/chats/{cid}/restrict", json={"blocked": True})
    with session_factory()() as db:
        assert typing_target(db, int(cid), ub["userId"]) is None  # restricted students reach A quietly


def test_sign_out_everywhere_else(make_client, codes):
    one, two = make_client(), make_client()
    sign_up(one, codes, "everywhere@thapar.edu", "Many Browsers")
    two.post("/auth/request-otp", json={"email": "everywhere@thapar.edu", "purpose": "signin"})
    two.post("/auth/verify-otp", json={"email": "everywhere@thapar.edu", "code": codes["everywhere@thapar.edu"]})
    assert two.get("/auth/me").status_code == 200
    r = one.post("/auth/logout-others")
    assert r.status_code == 200 and r.json()["signedOut"] == 1
    assert one.get("/auth/me").status_code == 200
    assert two.get("/auth/me").status_code == 401


def test_files_can_live_in_the_database(make_client, codes, monkeypatch):
    """For hosts without a permanent disk: photos go into the stored_files table, sealed as on disk."""
    from sqlalchemy import select

    from app.db import session_factory
    from app.models import StoredFile

    from .test_api import PHOTO_CIPHERTEXT

    monkeypatch.setattr("app.storage._in_db", lambda: True)
    a, b, ua, ub, cid, _ = connected_pair(make_client, codes, "dbstore")
    r = b.post(f"/chats/{cid}/images", content=PHOTO_CIPHERTEXT, headers={"Content-Type": "application/octet-stream", "X-Envelope": ENVELOPE})
    assert r.status_code == 200, r.text
    msg = a.get(f"/chats/{cid}/messages").json()["messages"][-1]
    assert a.get(msg["imageUrl"]).content == PHOTO_CIPHERTEXT
    with session_factory()() as db:
        rows = db.scalars(select(StoredFile).where(StoredFile.kind == "chat")).all()
        assert rows and all(row.data != PHOTO_CIPHERTEXT for row in rows)  # sealed again at rest

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    r = a.post("/me/avatar", content=png, headers={"Content-Type": "image/png"})
    assert r.status_code == 200, r.text
    url = r.json()["user"]["avatarUrl"]
    assert a.get(url).content == png
    assert a.delete("/me/avatar").status_code == 200
    with session_factory()() as db:
        assert db.scalars(select(StoredFile).where(StoredFile.kind == "avatars")).all() == []


def test_brevo_is_used_when_configured(monkeypatch):
    """Hosts that block SMTP can send codes through Brevo's HTTPS API instead."""
    import json
    from dataclasses import replace

    from app import mailer

    sent = {}

    class Ok:
        status = 201

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout):
        sent["url"] = req.full_url
        sent["key"] = req.get_header("Api-key")
        sent["body"] = json.loads(req.data)
        return Ok()

    monkeypatch.setattr(mailer, "settings", replace(mailer.settings, brevo_api_key="test-key", mail_from_email="codes@example.com", smtp_host=None))
    monkeypatch.setattr(mailer.urllib.request, "urlopen", fake_urlopen)
    assert mailer.deliver_otp("student@thapar.edu", "123456") == "email"
    assert sent["url"] == "https://api.brevo.com/v3/smtp/email" and sent["key"] == "test-key"
    assert sent["body"]["to"] == [{"email": "student@thapar.edu"}] and "123456" in sent["body"]["textContent"]
    assert sent["body"]["sender"]["email"] == "codes@example.com"


def test_same_site_origin_and_database_urls():
    from dataclasses import replace

    from app import deps
    from app.config import _database_url

    assert _database_url("postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require") == "postgresql+psycopg://u:p@ep-x.neon.tech/neondb?sslmode=require"
    assert _database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert _database_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"

    prod = replace(deps.settings, environment="production", cors_origins=[], cors_origin_regex=None)
    deps_settings = deps.settings
    try:
        deps.settings = prod
        assert deps.origin_allowed("https://campuspool.onrender.com", "campuspool.onrender.com")  # the site itself
        assert not deps.origin_allowed("https://evil.example", "campuspool.onrender.com")
        assert not deps.origin_allowed("http://campuspool.onrender.com", "campuspool.onrender.com")  # no plain http in production
        assert not deps.origin_allowed("https://campuspool.onrender.com", None)
    finally:
        deps.settings = deps_settings


def test_housekeeping_lets_an_idle_database_sleep():
    from app.tasks import housekeeping_due

    minute = 60
    # People are using the app: every interval.
    assert housekeeping_due(now=1000 * minute, last_run=999 * minute, last_activity=995 * minute, interval=60, idle_interval=1800)
    # Quiet for over 20 minutes (only keep-awake pings): not again until the idle interval has passed.
    assert not housekeeping_due(now=1000 * minute, last_run=990 * minute, last_activity=900 * minute, interval=60, idle_interval=1800)
    assert housekeeping_due(now=1000 * minute, last_run=969 * minute, last_activity=900 * minute, interval=60, idle_interval=1800)
    # First run after start-up always happens.
    assert housekeeping_due(now=5, last_run=float("-inf"), last_activity=0, interval=60, idle_interval=1800)


def test_health_checks_do_not_count_as_visitors(make_client):
    import app.tasks as tasks

    client = make_client()
    tasks._last_activity = 0.0
    client.get("/health")
    assert tasks._last_activity == 0.0
    client.get("/rides")
    assert tasks._last_activity > 0.0
