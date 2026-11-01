from datetime import datetime, timedelta, timezone

from backend.campusflow.extensions import db
from backend.campusflow.models import Announcement, Club, ClubMembership, Event, Notification


def csrf(client):
    return client.get("/api/auth/csrf").get_json()["csrfToken"]


def login(client, campus_id="NIBM001", password="TestPassword1!"):
    return client.post("/api/auth/login", json={"studentId": campus_id, "password": password},
                       headers={"X-CSRFToken": csrf(client)})


def test_club_directory_details_requests_and_approved_membership(app, client):
    assert login(client).status_code == 200
    with app.app_context():
        club = Club(name="Portal Robotics", description="Build campus robots")
        db.session.add(club)
        db.session.commit()
        club_id = club.id
    directory = client.get("/api/clubs")
    assert directory.status_code == 200
    assert directory.json["clubs"][0]["name"] == "Portal Robotics"
    assert client.get(f"/api/clubs/{club_id}").json["club"]["description"] == "Build campus robots"
    headers = {"X-CSRFToken": csrf(client)}
    requested = client.post(f"/api/clubs/{club_id}/memberships", json={}, headers=headers)
    assert requested.status_code == 201
    assert client.post(f"/api/clubs/{club_id}/memberships", json={}, headers={"X-CSRFToken": csrf(client)}).status_code == 409
    assert client.get("/api/memberships").json["memberships"][0]["status"] == "pending"
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    membership_id = client.get("/api/admin/memberships").json["memberships"][0]["id"]
    assert client.patch(f"/api/admin/memberships/{membership_id}", json={"status": "approved"},
                        headers={"X-CSRFToken": csrf(client)}).status_code == 200
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client).status_code == 200
    item = client.get("/api/memberships").json["memberships"][0]
    assert item["status"] == "approved"
    assert item["club"]["name"] == "Portal Robotics"
    assert client.get("/api/clubs").json["clubs"][0]["membershipStatus"] == "approved"
    with app.app_context():
        db.session.get(ClubMembership, membership_id).status = "rejected"
        db.session.commit()
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client).status_code == 200
    retry = client.post(f"/api/clubs/{club_id}/memberships", json={}, headers={"X-CSRFToken": csrf(client)})
    assert retry.status_code == 201 and retry.json["membership"]["status"] == "pending"


def test_membership_cancel_and_club_announcements_are_private(app, client):
    with app.app_context():
        club = Club(name="Private Club")
        db.session.add(club)
        db.session.flush()
        db.session.add_all([
            ClubMembership(club_id=club.id, user_id=1, status="approved"),
            Announcement(club_id=club.id, title="Club only", body="Members only"),
            Announcement(title="Campus", body="Everyone"),
            Notification(user_id=1, title="Student one", body="Private"),
            Notification(user_id=2, title="Student two", body="Private"),
        ])
        db.session.commit()
        club_id = club.id
    assert login(client).status_code == 200
    announcements = client.get("/api/announcements").json["announcements"]
    assert {a["title"] for a in announcements} == {"Club only", "Campus"}
    notifications = client.get("/api/notifications").json
    assert notifications["unreadCount"] == 1
    only_notification = notifications["notifications"][0]
    assert only_notification["title"] == "Student one"
    assert client.post(f"/api/notifications/{only_notification['id']}/read", json={},
                       headers={"X-CSRFToken": csrf(client)}).status_code == 200
    assert client.get("/api/notifications").json["unreadCount"] == 0
    with app.app_context():
        request_row = ClubMembership(club_id=club_id, user_id=2, status="pending")
        db.session.add(request_row)
        db.session.commit()
        request_id = request_row.id
    assert client.delete(f"/api/memberships/{request_id}", headers={"X-CSRFToken": csrf(client)}).status_code == 404


def test_student_can_cancel_own_pending_membership(app, client):
    with app.app_context():
        club = Club(name="Cancel Club")
        db.session.add(club)
        db.session.flush()
        membership = ClubMembership(club_id=club.id, user_id=1, status="pending")
        db.session.add(membership)
        db.session.commit()
        membership_id = membership.id
    assert login(client).status_code == 200
    assert client.delete(f"/api/memberships/{membership_id}", headers={"X-CSRFToken": csrf(client)}).status_code == 200
    assert client.get("/api/memberships").json["memberships"] == []


def test_dashboard_data_and_registration_history_include_cancelled_records(app, client):
    with app.app_context():
        event = Event(title="History Event", description="Old event", category="other",
                      starts_at=datetime.now(timezone.utc) + timedelta(days=2), location="Hall", capacity=2,
                      published=True)
        db.session.add(event)
        db.session.commit()
        event_id = event.id
    assert login(client).status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    assert client.post(f"/api/events/{event_id}/registrations", json={}, headers=headers).status_code == 201
    registration = client.get("/api/registrations").json["registrations"][0]
    assert registration["registeredAt"]
    assert registration["event"]["title"] == "History Event"
    assert client.delete(f"/api/registrations/{registration['id']}", headers={"X-CSRFToken": csrf(client)}).status_code == 200
    assert client.get("/api/registrations").json["registrations"] == []
    history = client.get("/api/registrations?history=1").json["registrations"]
    assert len(history) == 1 and history[0]["status"] == "cancelled"
    assert history[0]["event"]["title"] == "History Event"
    assert client.get("/api/events").json["events"][0]["startsAt"]
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    assert client.delete(f"/api/events/{event_id}", headers={"X-CSRFToken": csrf(client)}).status_code == 409


def test_profile_update_password_change_and_student_data_isolation(client):
    assert login(client).status_code == 200
    assert client.patch("/api/auth/profile", json={"fullName": "Updated Student"},
                        headers={"X-CSRFToken": csrf(client)}).json["user"]["fullName"] == "Updated Student"
    assert client.post("/api/auth/password", json={"currentPassword": "TestPassword1!", "newPassword": "ChangedPassword1!"},
                       headers={"X-CSRFToken": csrf(client)}).status_code == 200
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM003", "SecondPassword1!").status_code == 200
    assert client.get("/api/auth/me").json["user"]["fullName"] == "Second Student"
    assert client.get("/api/memberships").json["memberships"] == []
    assert client.get("/api/notifications").json["notifications"] == []
    assert client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM001", "ChangedPassword1!").status_code == 200


def test_student_portal_static_pages_are_served(client):
    for page in ("clubs.html", "club-details.html", "my-clubs.html", "notifications.html", "profile.html"):
        assert client.get(f"/{page}").status_code == 200

