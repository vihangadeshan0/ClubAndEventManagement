from datetime import datetime, timedelta, timezone

from backend.campusflow.extensions import db
from backend.campusflow.models import Event


def csrf(client):
    return client.get("/api/auth/csrf").get_json()["csrfToken"]


def login(client, campus_id="NIBM001", password="TestPassword1!"):
    return client.post("/api/auth/login", json={"studentId": campus_id, "password": password},
                       headers={"X-CSRFToken": csrf(client)})


def future_event(app):
    with app.app_context():
        event = Event(title="Workflow Event", description="Description", category="other",
                      starts_at=datetime.now(timezone.utc) + timedelta(days=10), location="Hall", capacity=2, published=True)
        db.session.add(event)
        db.session.commit()
        return event.id


def test_admin_event_create_update_publication(client):
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    payload = {"title": "New event", "description": "Details", "category": "technology",
               "startsAt": "2026-11-08T09:00:00+05:30", "venue": "Main Hall", "capacity": 10}
    created = client.post("/api/events", json=payload, headers=headers)
    assert created.status_code == 201
    event_id = int(created.json["event"]["id"])
    assert client.get(f"/api/events/{event_id}").status_code == 404
    updated = client.patch(f"/api/events/{event_id}", json={"published": True}, headers=headers)
    assert updated.status_code == 200
    assert client.get(f"/api/events/{event_id}").status_code == 200
    assert any(str(row["id"]) == str(event_id) for row in client.get("/api/events").json["events"])
    assert any(str(row["id"]) == str(event_id) for row in client.get("/api/admin/events").json["events"])


def test_registration_cancellation_and_private_notifications(app, client):
    event_id = future_event(app)
    assert login(client).status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    assert client.post(f"/api/events/{event_id}/registrations", json={}, headers=headers).status_code == 201
    registration = client.get("/api/registrations").json["registrations"][0]
    assert client.delete(f"/api/registrations/{registration['id']}", headers=headers).status_code == 200
    assert client.get("/api/registrations").json["registrations"] == []
    notifications = client.get("/api/notifications").json["notifications"]
    assert {item["title"] for item in notifications} == {"Registration confirmed", "Registration cancelled"}


def test_club_membership_approval_and_unverified_registration(client):
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    club = client.post("/api/clubs", json={"name": "Robotics", "description": "Build things"}, headers=headers)
    assert club.status_code == 201
    club_id = club.json["club"]["id"]
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})

    assert login(client).status_code == 200
    request = client.post(f"/api/clubs/{club_id}/memberships", json={}, headers={"X-CSRFToken": csrf(client)})
    assert request.status_code == 201
    assert client.get("/api/memberships").json["memberships"][0]["status"] == "pending"

    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    pending = client.get("/api/admin/memberships").json["memberships"][0]
    assert client.patch(f"/api/admin/memberships/{pending['id']}", json={"status": "approved"},
                        headers={"X-CSRFToken": csrf(client)}).status_code == 200
    assert client.get(f"/api/clubs/{club_id}/members").json["members"][0]["campusId"] == "NIBM001"

    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    signup = client.post("/api/auth/register", json={"fullName": "New Student", "studentId": "NIBM002",
                                                       "password": "StudentPassword1!"},
                         headers={"X-CSRFToken": csrf(client)})
    assert signup.status_code == 202
    assert login(client, "NIBM002", "StudentPassword1!").status_code == 403


def test_new_student_waits_for_admin_approval(client):
    signup = client.post("/api/auth/register", json={"fullName": "Pending Student", "studentId": "NIBM004",
                                                       "password": "StudentPassword1!"},
                         headers={"X-CSRFToken": csrf(client)})
    assert signup.status_code == 202
    assert login(client, "NIBM004", "StudentPassword1!").status_code == 403

    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    pending = client.get("/api/admin/users/pending-verification").json["users"]
    applicant = next(user for user in pending if user["campusId"] == "NIBM004")
    approved = client.post(f"/api/admin/users/{applicant['id']}/verify", json={},
                           headers={"X-CSRFToken": csrf(client)})
    assert approved.status_code == 200
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM004", "StudentPassword1!").status_code == 200


def test_admin_dashboard_metrics_and_student_search(client):
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    assert client.get("/api/admin/overview").status_code == 200
    assert client.get("/api/admin/students?status=approved&q=Test").json["students"]
    assert client.get("/api/admin/events").status_code == 200
    admin_headers = {"X-CSRFToken": csrf(client)}
    assert client.post("/api/clubs", json={"name": "Unified Admin Club"}, headers=admin_headers).status_code == 201
    assert any(club["name"] == "Unified Admin Club" for club in client.get("/api/admin/clubs").json["clubs"])
    assert client.get("/api/admin/memberships").status_code == 200
    assert client.post("/api/announcements", json={"title": "Admin notice", "body": "Live"},
                       headers={"X-CSRFToken": csrf(client)}).status_code == 201
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    assert login(client).status_code == 200
    assert client.get("/api/admin/overview").status_code == 403


def test_club_and_announcement_admin_operations(client):
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    event = client.post("/api/events", json={"title": "Club Admin Event", "description": "Published from admin",
        "category": "other", "startsAt": "2026-12-08T09:00:00+05:30", "venue": "Main Hall", "capacity": 20,
        "published": True}, headers=headers)
    assert event.status_code == 201
    event_id = int(event.json["event"]["id"])
    assert any(int(row["id"]) == event_id for row in client.get("/api/admin/events").json["events"])
    assert any(int(row["id"]) == event_id for row in client.get("/api/events").json["events"])
    created_club = client.post("/api/clubs", json={"name": "Drama Guild", "description": "Stage and screen"}, headers=headers)
    assert created_club.status_code == 201
    club_id = created_club.json["club"]["id"]
    assert client.get("/api/admin/clubs").json["clubs"][0]["name"] == "Drama Guild"
    assert client.patch(f"/api/clubs/{club_id}", json={"description": "Performing arts"}, headers=headers).status_code == 200

    announcement = client.post("/api/announcements", json={"title": "Auditions", "body": "Sign up this week"}, headers=headers)
    assert announcement.status_code == 201
    announcement_id = announcement.json["announcement"]["id"]
    assert client.patch(f"/api/announcements/{announcement_id}", json={"title": "Auditions open"}, headers=headers).status_code == 200
    assert client.delete(f"/api/announcements/{announcement_id}", headers=headers).status_code == 204
    assert client.delete(f"/api/clubs/{club_id}", headers=headers).status_code == 204
