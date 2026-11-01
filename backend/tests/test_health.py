from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "campuspool-api"}


def test_health_db_reports_state():
    res = client.get("/health/db")
    assert res.status_code == 200
    assert res.json()["database"] in {"not_configured", "ok", "unreachable"}
