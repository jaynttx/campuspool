from datetime import datetime, timedelta, timezone

from .conftest import sign_up


def soon(hours: float = 2) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def ride_body(**over):
    body = {"source": "Thapar Main Gate", "destination": "Chandigarh ISBT 43", "departsAt": soon(), "totalSeats": 3, "expectedFare": 600}
    body.update(over)
    return body


def test_only_thapar_addresses_can_start_sign_up(make_client, codes):
    c = make_client()
    for bad in ["a@gmail.com", "a+1@thapar.edu", "a@mail.thapar.edu"]:
        r = c.post("/auth/request-otp", json={"email": bad, "purpose": "signup", "profile": {"name": "Aa"}})
        assert r.status_code == 400, bad
    assert codes == {}


def test_sign_up_sign_out_sign_in(make_client, codes):
    c = make_client()
    user = sign_up(c, codes, "riya@thapar.edu", "Riya Sharma")
    assert user["name"] == "Riya Sharma"
    assert c.get("/auth/me").status_code == 200
    c.post("/auth/logout")
    assert c.get("/auth/me").status_code == 401
    r = c.post("/auth/request-otp", json={"email": "riya@thapar.edu", "purpose": "signin"})
    assert r.status_code == 200
    assert c.post("/auth/verify-otp", json={"email": "riya@thapar.edu", "code": codes["riya@thapar.edu"]}).status_code == 200


def test_wrong_code_is_rejected_and_limited(make_client, codes):
    c = make_client()
    c.post("/auth/request-otp", json={"email": "a1@thapar.edu", "purpose": "signup", "profile": {"name": "Aa"}})
    real = codes["a1@thapar.edu"]
    wrong = "000000" if real != "000000" else "111111"
    for _ in range(5):
        assert c.post("/auth/verify-otp", json={"email": "a1@thapar.edu", "code": wrong}).status_code == 400
    assert c.post("/auth/verify-otp", json={"email": "a1@thapar.edu", "code": real}).status_code == 429


def test_sign_in_does_not_reveal_whether_an_account_exists(make_client, codes):
    c = make_client()
    r = c.post("/auth/request-otp", json={"email": "ghost@thapar.edu", "purpose": "signin"})
    assert r.status_code == 200
    assert "ghost@thapar.edu" not in codes


def test_pages_need_sign_in(make_client):
    c = make_client()
    assert c.get("/bootstrap").status_code == 401
    assert c.get("/avatars/abcdefgh12345678.jpg").status_code == 401


def test_ride_request_accept_complete_and_pay(make_client, codes):
    host, rider = make_client(), make_client()
    sign_up(host, codes, "host@thapar.edu", "Host One")
    sign_up(rider, codes, "rider@thapar.edu", "Rider Two")

    ride_id = host.post("/rides", json=ride_body(totalSeats=1)).json()["id"]
    assert rider.post(f"/rides/{ride_id}/request").status_code == 200
    assert rider.post(f"/rides/{ride_id}/request").status_code == 409  # already asked

    req = next(q for q in host.get("/bootstrap").json()["rideRequests"] if q["rideId"] == ride_id)
    assert rider.post(f"/ride-requests/{req['id']}/decide", json={"approve": True}).status_code == 403  # only the creator decides
    assert host.post(f"/ride-requests/{req['id']}/decide", json={"approve": True}).status_code == 200

    third = make_client()
    sign_up(third, codes, "third@thapar.edu", "Third Three")
    assert third.post(f"/rides/{ride_id}/request").status_code == 409  # no seats left

    r = host.post(f"/rides/{ride_id}/complete", json={"actualFare": 600})
    assert r.status_code == 200 and r.json()["share"] == 300.0

    pay = rider.get("/bootstrap").json()["payments"][0]
    assert pay["amount"] == 300.0 and pay["status"] == "PENDING"
    assert host.post(f"/payments/{pay['id']}/mark-paid").status_code == 404  # only the payer can say they paid
    assert rider.post(f"/payments/{pay['id']}/confirm").status_code == 404  # only the creator can confirm
    assert rider.post(f"/payments/{pay['id']}/mark-paid").status_code == 200
    assert rider.get("/bootstrap").json()["payments"][0]["status"] == "PENDING"  # saying "paid" is not confirmation
    assert host.post(f"/payments/{pay['id']}/confirm").status_code == 200
    assert rider.get("/bootstrap").json()["payments"][0]["status"] == "SUCCESS"


def test_past_rides_are_rejected(make_client, codes):
    c = make_client()
    sign_up(c, codes, "p1@thapar.edu", "Past One")
    assert c.post("/rides", json=ride_body(departsAt=soon(-3))).status_code == 422




def test_admin_can_remove_reported_post_and_regular_users_cannot_admin(make_client, codes):
    owner, reporter, admin = make_client(), make_client(), make_client()
    sign_up(owner, codes, "own@thapar.edu", "Owner")
    sign_up(reporter, codes, "rep@thapar.edu", "Reporter")
    sign_up(admin, codes, "admin@thapar.edu", "Admin")

    ride_id = owner.post("/rides", json=ride_body()).json()["id"]
    assert reporter.post("/reports", json={"kind": "ride", "targetId": int(ride_id), "reason": "Looks like a scam"}).status_code == 200

    assert reporter.get("/admin/overview").status_code == 403
    assert admin.get("/admin/overview").json()["openReports"] == 1

    report = admin.get("/admin/reports").json()["reports"][0]
    assert admin.post(f"/admin/reports/{report['id']}/resolve", json={"action": "remove_post"}).status_code == 200
    assert all(r["id"] != ride_id for r in reporter.get("/bootstrap").json()["rides"])
    assert admin.get("/admin/overview").json()["openReports"] == 0


def test_suspended_students_are_locked_out(make_client, codes):
    victim, admin = make_client(), make_client()
    u = sign_up(victim, codes, "bad@thapar.edu", "Bad Actor")
    sign_up(admin, codes, "admin@thapar.edu", "Admin")
    assert admin.post(f"/admin/users/{u['userId']}/ban", json={"banned": True}).status_code == 200
    assert victim.get("/auth/me").status_code == 401  # sessions were ended


def test_block_stops_requests_chat_and_hides_posts(make_client, codes):
    a, b = make_client(), make_client()
    ua = sign_up(a, codes, "blk-a@thapar.edu", "Block A")
    ub = sign_up(b, codes, "blk-b@thapar.edu", "Block B")
    ride_id = a.post("/rides", json=ride_body()).json()["id"]
    assert any(r["id"] == ride_id for r in b.get("/bootstrap").json()["rides"])

    assert a.post("/relations/block", json={"userId": ub["userId"], "on": True}).status_code == 200
    assert all(r["id"] != ride_id for r in b.get("/bootstrap").json()["rides"])  # hidden from the blocked student
    assert b.post(f"/rides/{ride_id}/request").status_code == 404  # and a block is never revealed
    assert b.post("/chats", json={"userId": ua["userId"]}).status_code == 403
    assert any(p["id"] == str(ub["userId"]) for p in a.get("/bootstrap").json()["relations"]["blocked"])

    assert a.post("/relations/block", json={"userId": ub["userId"], "on": False}).status_code == 200
    assert b.post(f"/rides/{ride_id}/request").status_code == 200


def test_blocking_declines_pending_requests(make_client, codes):
    a, b = make_client(), make_client()
    sign_up(a, codes, "bp-a@thapar.edu", "Block A")
    ub = sign_up(b, codes, "bp-b@thapar.edu", "Block B")
    ride_id = a.post("/rides", json=ride_body()).json()["id"]
    b.post(f"/rides/{ride_id}/request")
    a.post("/relations/block", json={"userId": ub["userId"], "on": True})
    mine = [q for q in b.get("/bootstrap").json()["rideRequests"] if q["rideId"] == ride_id]
    assert mine and mine[0]["status"] == "REJECTED"






def test_privacy_settings_hide_year_and_photo(make_client, codes):
    a, b = make_client(), make_client()
    sign_up(a, codes, "pv-a@thapar.edu", "Private A")
    ub = sign_up(b, codes, "pv-b@thapar.edu", "Private B")
    a.post("/rides", json=ride_body())

    def year_of_b_as_seen_by_a() -> int | None:
        return next(p for p in a.get("/bootstrap").json()["people"] if p["id"] == str(ub["userId"]))["year"]

    b.post(f"/rides", json=ride_body())  # puts B in A's people list
    assert year_of_b_as_seen_by_a() == 1  # shown by default
    settings_body = {**b.get("/bootstrap").json()["me"]["settings"], "showYear": False}
    assert b.patch("/me/settings", json=settings_body).status_code == 200
    assert year_of_b_as_seen_by_a() is None


def test_finished_rides_can_be_removed_once_settled(make_client, codes):
    host, rider, _ub = make_client(), make_client(), None
    sign_up(host, codes, "rm-h@thapar.edu", "Remove Host")
    sign_up(rider, codes, "rm-r@thapar.edu", "Remove Rider")
    ride_id = host.post("/rides", json=ride_body()).json()["id"]
    assert host.delete(f"/rides/{ride_id}").status_code == 409  # still open

    rider.post(f"/rides/{ride_id}/request")
    req = next(q for q in host.get("/bootstrap").json()["rideRequests"] if q["rideId"] == ride_id)
    host.post(f"/ride-requests/{req['id']}/decide", json={"approve": True})
    host.post(f"/rides/{ride_id}/complete", json={"actualFare": 400})

    assert host.delete(f"/rides/{ride_id}").status_code == 409  # a share is still unpaid
    assert rider.post("/hide", json={"kind": "ride", "targetId": int(ride_id)}).status_code == 409

    pay = rider.get("/bootstrap").json()["payments"][0]
    host.post(f"/payments/{pay['id']}/confirm")
    assert rider.post("/hide", json={"kind": "ride", "targetId": int(ride_id)}).status_code == 200
    assert all(r["id"] != ride_id for r in rider.get("/bootstrap").json()["rides"])  # gone from the rider's list
    assert any(r["id"] == ride_id for r in host.get("/bootstrap").json()["rides"])  # still on the host's
    assert host.delete(f"/rides/{ride_id}").status_code == 200
    assert all(r["id"] != ride_id for r in host.get("/bootstrap").json()["rides"])


def test_feedback_reaches_admin(make_client, codes):
    student, admin = make_client(), make_client()
    sign_up(student, codes, "fb@thapar.edu", "Feedback Giver")
    sign_up(admin, codes, "admin@thapar.edu", "Admin")
    assert student.post("/feedback", json={"category": "idea", "rating": 5, "message": "Add a dark mode please"}).status_code == 200
    assert student.get("/admin/feedback").status_code == 403
    items = admin.get("/admin/feedback").json()["feedback"]
    assert items[0]["message"] == "Add a dark mode please" and items[0]["rating"] == 5
    assert admin.post(f"/admin/feedback/{items[0]['id']}/read").status_code == 200
    assert admin.get("/admin/feedback").json()["feedback"] == []


ENVELOPE = "eyJ2IjoxLCJpdiI6ImFiYyIsImN0IjoiZGVmIn0"  # stands in for a browser-made secure message
PHOTO_CIPHERTEXT = bytes(range(256)) * 8  # stands in for an encrypted photo


def enable_e2ee(client, tag="x"):
    r = client.put("/e2ee/me", json={"publicKey": "P" * 40 + tag, "wrappedKey": "W" * 80})
    assert r.status_code == 200, r.text


def connected_pair(make_client, codes, tag):
    """Two students with secure chat on, where B has asked to join A's ride, so they may chat."""
    a, b = make_client(), make_client()
    ua = sign_up(a, codes, f"{tag}-a@thapar.edu", f"{tag} A")
    ub = sign_up(b, codes, f"{tag}-b@thapar.edu", f"{tag} B")
    enable_e2ee(a, "a")
    enable_e2ee(b, "b")
    ride_id = a.post("/rides", json=ride_body()).json()["id"]
    b.post(f"/rides/{ride_id}/request")
    cid = b.post("/chats", json={"userId": ua["userId"]}).json()["id"]
    return a, b, ua, ub, cid, ride_id


def test_chat_needs_a_connection_keys_and_supports_blocking(make_client, codes):
    a, b = make_client(), make_client()
    ua = sign_up(a, codes, "chat-a@thapar.edu", "Chat A")
    sign_up(b, codes, "chat-b@thapar.edu", "Chat B")
    assert b.post("/chats", json={"userId": ua["userId"]}).status_code == 403  # strangers cannot message

    ride_id = a.post("/rides", json=ride_body()).json()["id"]
    b.post(f"/rides/{ride_id}/request")
    cid = b.post("/chats", json={"userId": ua["userId"]}).json()["id"]
    assert b.post(f"/chats/{cid}/messages", json={"envelope": ENVELOPE}).status_code == 409  # secure chat is not set up yet

    enable_e2ee(a, "a")
    enable_e2ee(b, "b")
    assert b.post(f"/chats/{cid}/messages", json={"envelope": ENVELOPE}).status_code == 200
    assert b.post(f"/chats/{cid}/messages", json={"text": "plain text is not accepted"}).status_code == 422

    msgs = a.get(f"/chats/{cid}/messages").json()["messages"]
    assert msgs[0]["envelope"] == ENVELOPE and msgs[0]["e2ee"] is True and msgs[0]["text"] == ""
    assert msgs[0]["senderId"] != "me"
    assert any("New message" in n["text"] for n in a.get("/bootstrap").json()["notifications"])
    assert a.get("/chats").json()["chats"][0]["last"]["e2ee"] is True  # the server cannot preview it

    assert a.post(f"/chats/{cid}/block", json={"blocked": True}).status_code == 200
    assert b.post(f"/chats/{cid}/messages", json={"envelope": ENVELOPE}).status_code == 403
    assert a.post(f"/chats/{cid}/report", json={"reason": "Spam messages", "evidence": "Chat B: buy my notes"}).status_code == 200


def test_secure_messages_are_stored_unreadable(make_client, codes):
    from app.crypto import decrypt_text
    from app.db import session_factory
    from app.models import Message

    a, b, ua, ub, cid, _ = connected_pair(make_client, codes, "enc")
    b.post(f"/chats/{cid}/messages", json={"envelope": ENVELOPE})
    with session_factory()() as db:
        row = db.query(Message).one()
        assert row.e2ee is True
        assert row.body.startswith("v1:") and ENVELOPE not in row.body  # sealed again at rest
        assert decrypt_text(row.body, f"chat:{cid}") == ENVELOPE


def test_secure_photos_are_stored_and_served_as_ciphertext(make_client, codes):
    import os

    from app.config import settings

    a, b, ua, ub, cid, _ = connected_pair(make_client, codes, "img")
    headers = {"Content-Type": "application/octet-stream", "X-Envelope": ENVELOPE}
    assert b.post(f"/chats/{cid}/images", content=PHOTO_CIPHERTEXT, headers={"Content-Type": "image/jpeg", "X-Envelope": ENVELOPE}).status_code == 415
    assert b.post(f"/chats/{cid}/images", content=PHOTO_CIPHERTEXT, headers={"Content-Type": "application/octet-stream"}).status_code == 422  # no envelope
    r = b.post(f"/chats/{cid}/images", content=PHOTO_CIPHERTEXT, headers=headers)
    assert r.status_code == 200, r.text

    msg = a.get(f"/chats/{cid}/messages").json()["messages"][0]
    assert msg["imageUrl"] and msg["envelope"] == ENVELOPE
    assert a.get(msg["imageUrl"]).content == PHOTO_CIPHERTEXT  # the server hands back exactly what the browser encrypted

    stored = os.listdir(os.path.join(settings.upload_dir, "chat"))
    assert stored and all(open(os.path.join(settings.upload_dir, "chat", f), "rb").read() != PHOTO_CIPHERTEXT for f in stored)

    outsider = make_client()
    sign_up(outsider, codes, "img-out@thapar.edu", "Outsider")
    assert outsider.get(msg["imageUrl"]).status_code == 404


def test_restrict_is_quiet_and_not_announced(make_client, codes):
    a, b = make_client(), make_client()
    ua = sign_up(a, codes, "rs-a@thapar.edu", "Restrict A")
    ub = sign_up(b, codes, "rs-b@thapar.edu", "Restrict B")
    enable_e2ee(a, "a")
    enable_e2ee(b, "b")
    ride_id = a.post("/rides", json=ride_body()).json()["id"]
    assert a.post("/relations/restrict", json={"userId": ub["userId"], "on": True}).status_code == 200

    assert b.post(f"/rides/{ride_id}/request").status_code == 200  # the request still goes through
    boot = a.get("/bootstrap").json()
    assert not any("asked to join" in n["text"] for n in boot["notifications"])  # but no notification
    assert next(q for q in boot["rideRequests"] if q["rideId"] == ride_id)["restricted"] is True

    cid = b.post("/chats", json={"userId": ua["userId"]}).json()["id"]
    assert b.post(f"/chats/{cid}/messages", json={"envelope": ENVELOPE}).status_code == 200
    boot = a.get("/bootstrap").json()
    assert boot["chatUnread"] == 0  # no badge
    assert not any("New message" in n["text"] for n in boot["notifications"])
    assert a.get(f"/chats/{cid}/messages").json()["messages"][0]["envelope"] == ENVELOPE  # but the message is delivered
    assert b.get("/bootstrap").json()["relations"] == {"blocked": [], "restricted": []}  # the restricted student sees nothing


def test_secure_chat_keys_and_who_may_look_them_up(make_client, codes):
    a, b, stranger = make_client(), make_client(), make_client()
    ua = sign_up(a, codes, "k-a@thapar.edu", "Key A")
    ub = sign_up(b, codes, "k-b@thapar.edu", "Key B")
    sign_up(stranger, codes, "k-s@thapar.edu", "Stranger")
    assert a.get("/e2ee/me").json()["publicKey"] is None
    enable_e2ee(a, "a")
    assert a.get("/e2ee/me").json()["publicKey"].endswith("a")
    assert stranger.get(f"/e2ee/peers/{ua['userId']}").status_code == 403  # only connected students may fetch a key
    ride_id = a.post("/rides", json=ride_body()).json()["id"]
    b.post(f"/rides/{ride_id}/request")
    assert b.get(f"/e2ee/peers/{ua['userId']}").json()["publicKey"].endswith("a")
    assert ub["userId"] != ua["userId"]


def test_ratings_after_a_completed_ride(make_client, codes):
    host, rider, other = make_client(), make_client(), make_client()
    uh = sign_up(host, codes, "rt-h@thapar.edu", "Rate Host")
    ur = sign_up(rider, codes, "rt-r@thapar.edu", "Rate Rider")
    sign_up(other, codes, "rt-o@thapar.edu", "Rate Other")
    ride_id = host.post("/rides", json=ride_body()).json()["id"]
    rider.post(f"/rides/{ride_id}/request")
    req = next(q for q in host.get("/bootstrap").json()["rideRequests"] if q["rideId"] == ride_id)
    host.post(f"/ride-requests/{req['id']}/decide", json={"approve": True})

    assert rider.post(f"/rides/{ride_id}/ratings", json={"rateeId": uh["userId"], "stars": 5}).status_code == 409  # not completed yet
    host.post(f"/rides/{ride_id}/complete", json={"actualFare": 300})

    assert other.post(f"/rides/{ride_id}/ratings", json={"rateeId": uh["userId"], "stars": 1}).status_code == 403  # was not on the ride
    assert rider.post(f"/rides/{ride_id}/ratings", json={"rateeId": ur["userId"], "stars": 5}).status_code == 403  # cannot rate yourself
    assert rider.post(f"/rides/{ride_id}/ratings", json={"rateeId": uh["userId"], "stars": 6}).status_code == 422
    assert rider.post(f"/rides/{ride_id}/ratings", json={"rateeId": uh["userId"], "stars": 5, "comment": "On time"}).status_code == 200
    assert rider.post(f"/rides/{ride_id}/ratings", json={"rateeId": uh["userId"], "stars": 1}).status_code == 409  # once per ride
    assert host.post(f"/rides/{ride_id}/ratings", json={"rateeId": ur["userId"], "stars": 4}).status_code == 200

    boot_host = host.get("/bootstrap").json()
    assert boot_host["me"]["ratingAvg"] == 5.0 and boot_host["me"]["ratingCount"] == 1
    assert boot_host["receivedRatings"][0]["comment"] == "On time" and "rater" not in boot_host["receivedRatings"][0]  # reviews are anonymous
    boot_rider = rider.get("/bootstrap").json()
    assert any(r["rateeId"] != "me" and r["stars"] == 5 for r in boot_rider["myRatings"])
    assert next(p for p in boot_rider["people"] if p["id"] == str(uh["userId"]))["ratingAvg"] == 5.0


def test_repeating_rides_and_map_points(make_client, codes):
    c = make_client()
    sign_up(c, codes, "rp@thapar.edu", "Repeater")
    partial = ride_body(srcLat=30.35, srcLng=76.36)
    assert c.post("/rides", json=partial).status_code == 422  # both points or neither

    body = ride_body(srcLat=30.356, srcLng=76.364, dstLat=30.719, dstLng=76.746, repeatAt=[soon(26), soon(50)])
    made = c.post("/rides", json=body).json()
    assert len(made["ids"]) == 3
    rides = [r for r in c.get("/bootstrap").json()["rides"] if r["id"] in made["ids"]]
    assert len({r["seriesId"] for r in rides}) == 1 and rides[0]["seriesId"]
    assert all(r["dstLat"] == 30.719 for r in rides)

    first = sorted(rides, key=lambda r: r["departsAt"])[0]
    res = c.post(f"/rides/{first['id']}/cancel-series")
    assert res.status_code == 200 and res.json()["cancelled"] == 3
    assert all(r["status"] == "CANCELLED" for r in c.get("/bootstrap").json()["rides"] if r["id"] in made["ids"])
    single = c.post("/rides", json=ride_body()).json()["id"]
    assert c.post(f"/rides/{single}/cancel-series").status_code == 409  # not part of a series


def test_reminders_are_sent_once(make_client, codes):
    from app.reminders import run_reminders

    host, rider = make_client(), make_client()
    sign_up(host, codes, "rm-host@thapar.edu", "Remind Host")
    sign_up(rider, codes, "rm-rider@thapar.edu", "Remind Rider")
    ride_id = host.post("/rides", json=ride_body(departsAt=soon(0.5))).json()["id"]  # leaves in 30 minutes
    rider.post(f"/rides/{ride_id}/request")
    req = next(q for q in host.get("/bootstrap").json()["rideRequests"] if q["rideId"] == ride_id)
    host.post(f"/ride-requests/{req['id']}/decide", json={"approve": True})

    assert run_reminders() == 2  # the creator and the accepted rider
    assert run_reminders() == 0  # never twice
    for c in (host, rider):
        assert any(n["text"].startswith("Reminder:") for n in c.get("/bootstrap").json()["notifications"])

    # a student who turns reminders off is skipped
    later = host.post("/rides", json=ride_body(departsAt=soon(0.5))).json()["id"]
    settings_body = {**host.get("/bootstrap").json()["me"]["settings"], "reminderMinutes": 0}
    assert host.patch("/me/settings", json=settings_body).status_code == 200
    assert run_reminders() == 0 and later

