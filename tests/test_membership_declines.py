from backend.campusflow.extensions import db
from backend.campusflow.models import Club, ClubMembership, Notification


def csrf(client):
    return client.get("/api/auth/csrf").get_json()["csrfToken"]


def login(client, campus_id, password):
    return client.post("/api/auth/login", json={"studentId": campus_id, "password": password},
                       headers={"X-CSRFToken": csrf(client)})


def post_request(client, club_id):
    return client.post(f"/api/clubs/{club_id}/memberships", json={}, headers={"X-CSRFToken": csrf(client)})


def decide(client, membership_id, status, reason=None):
    body = {"status": status}
    if reason is not None:
        body["reason"] = reason
    return client.patch(f"/api/admin/memberships/{membership_id}", json=body,
                        headers={"X-CSRFToken": csrf(client)})


def make_clubs(app):
    with app.app_context():
        clubs = [Club(name="Decline Club"), Club(name="Other Club")]
        db.session.add_all(clubs)
        db.session.commit()
        return clubs[0].id, clubs[1].id


def test_decline_retry_block_notifications_and_club_isolation(app):
    club_id, other_club_id = make_clubs(app)
    client = app.test_client()
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200

    assert post_request(client, club_id).status_code == 201
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    membership_id = client.get("/api/admin/memberships").json["memberships"][0]["id"]
    assert decide(client, membership_id, "declined", "Missing required experience.").status_code == 200
    with app.app_context():
        membership = db.session.get(ClubMembership, membership_id)
        assert membership.status == "declined" and membership.declined_count == 1
        assert membership.decline_reason == "Missing required experience."
        first_notification = Notification.query.filter_by(user_id=1).one()
        first_notification_id = first_notification.id
        assert "Decline Club" in first_notification.body
        assert "Missing required experience." in first_notification.body
        assert "one more request" in first_notification.body
        assert first_notification.target_url == f"club-details.html?id={club_id}"

    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    assert client.get("/api/clubs").json["clubs"][0]["canRequest"] is True
    assert post_request(client, club_id).status_code == 201
    duplicate_pending = post_request(client, club_id)
    assert duplicate_pending.status_code == 409
    assert duplicate_pending.json["error"]["code"] == "duplicate_membership"
    with app.app_context():
        membership = db.session.get(ClubMembership, membership_id)
        assert membership.status == "pending" and membership.declined_count == 1

    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    assert decide(client, membership_id, "declined").status_code == 200
    retry_decision = decide(client, membership_id, "declined", "Repeated request")
    assert retry_decision.status_code == 409
    assert retry_decision.json["error"]["code"] == "request_already_decided"
    with app.app_context():
        membership = db.session.get(ClubMembership, membership_id)
        assert membership.declined_count == 2
        notices = Notification.query.filter_by(user_id=1).order_by(Notification.id).all()
        assert len(notices) == 2
        assert "No reason provided" in notices[1].body
        assert "second time" in notices[1].body
        assert "no longer request" in notices[1].body

    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    blocked = post_request(client, club_id)
    assert blocked.status_code == 403
    assert blocked.json["error"]["code"] == "membership_blocked"
    assert client.get("/api/clubs").json["clubs"][0]["canRequest"] is False
    assert client.get(f"/api/clubs/{club_id}").json["club"]["declinedCount"] == 2
    assert post_request(client, other_club_id).status_code == 201

    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM003", "SecondPassword1!").status_code == 200
    assert client.get("/api/notifications").json["notifications"] == []
    assert client.post(f"/api/notifications/{first_notification_id}/read", json={},
                       headers={"X-CSRFToken": csrf(client)}).status_code == 404


def test_pending_approved_and_admin_notification_routing(app):
    club_id, _ = make_clubs(app)
    client = app.test_client()
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200

    assert post_request(client, club_id).status_code == 201
    assert post_request(client, club_id).status_code == 409
    with app.app_context():
        membership_id = ClubMembership.query.filter_by(club_id=club_id, user_id=1).one().id
    assert decide(client, membership_id, "approved").status_code == 403
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    assert len(client.get("/api/notifications").json["notifications"]) == 1
    membership_id = client.get("/api/admin/memberships").json["memberships"][0]["id"]
    assert decide(client, membership_id, "approved").status_code == 200
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    assert client.get("/api/notifications").json["notifications"] == []
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    already_member = post_request(client, club_id)
    assert already_member.status_code == 409
    assert already_member.json["error"]["code"] == "already_member"
    assert len(client.get("/api/notifications").json["notifications"]) == 1

