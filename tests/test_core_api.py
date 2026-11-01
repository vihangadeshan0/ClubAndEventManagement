from datetime import datetime, timedelta, timezone

from backend.campusflow.extensions import db
from backend.campusflow.models import Event


def csrf(client):
    return client.get("/api/auth/csrf").get_json()["csrfToken"]


def login(client, campus_id="NIBM001", password="TestPassword1!"):
    token = csrf(client)
    return client.post("/api/auth/login", json={"studentId": campus_id, "password": password},
                       headers={"X-CSRFToken": token})


def make_event(app, capacity=1):
    with app.app_context():
        event = Event(title="Campus Tech Day", description="A campus technology event", category="technology",
                      starts_at=datetime.now(timezone.utc) + timedelta(days=10), location="Main Hall",
                      capacity=capacity, published=True)
        db.session.add(event)
        db.session.commit()
        return event.id


def test_login_password_and_session(client):
    bad = login(client, password="incorrect")
    assert bad.status_code == 401
    assert login(client).status_code == 200
    assert client.get("/api/auth/me").get_json()["user"]["campusId"] == "NIBM001"
    assert client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)}).status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_deactivated_student_cannot_login_and_admin_can_reactivate(client):
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    users = client.get("/api/admin/students").json["students"]
    student = next(user for user in users if user["campusId"] == "NIBM001")
    headers = {"X-CSRFToken": csrf(client)}
    assert client.patch(f"/api/admin/students/{student['id']}/status", json={"isActive": False}, headers=headers).status_code == 200
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    inactive = login(client)
    assert inactive.status_code == 403
    assert inactive.json["error"]["code"] == "account_deactivated"
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    assert client.patch(f"/api/admin/students/{student['id']}/status", json={"isActive": True}, headers=headers).status_code == 200
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    assert login(client).status_code == 200


def test_admin_student_detail_edit_and_password_reset(client):
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    student = next(user for user in client.get("/api/admin/students").json["students"] if user["campusId"] == "NIBM001")
    headers = {"X-CSRFToken": csrf(client)}
    assert client.get(f"/api/admin/students/{student['id']}").json["student"]["verified"] is True
    changed = client.patch(f"/api/admin/students/{student['id']}", json={"fullName": "Updated Test Student"}, headers=headers)
    assert changed.status_code == 200
    reset = client.post(f"/api/admin/students/{student['id']}/password", json={"newPassword": "ResetPassword1!"}, headers=headers)
    assert reset.status_code == 200
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    assert login(client, password="TestPassword1!").status_code == 401
    assert login(client, password="ResetPassword1!").status_code == 200


def test_password_change_requires_current_password_and_updates_hash(client):
    assert login(client).status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    wrong = client.post("/api/auth/password", json={"currentPassword": "wrong", "newPassword": "NewPassword2!"}, headers=headers)
    assert wrong.status_code == 401
    short = client.post("/api/auth/password", json={"currentPassword": "TestPassword1!", "newPassword": "short"}, headers=headers)
    assert short.status_code == 422
    changed = client.post("/api/auth/password", json={"currentPassword": "TestPassword1!", "newPassword": "NewPassword2!"}, headers=headers)
    assert changed.status_code == 200
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    assert login(client, password="TestPassword1!").status_code == 401
    assert login(client, password="NewPassword2!").status_code == 200


def test_auth_post_without_csrf_returns_json_error(client):
    response = client.post("/api/auth/login", json={"studentId": "NIBM001", "password": "TestPassword1!"})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "csrf_failed"


def test_auth_rejects_csrf_token_from_another_session(app):
    client = app.test_client()
    stale_token = csrf(client)
    accepted = client.post("/api/auth/login", json={"studentId": "NIBM001", "password": "TestPassword1!"},
                           headers={"X-CSRFToken": stale_token})
    assert accepted.status_code == 200
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    # Simulate the session cookie being updated by another tab after this token was obtained.
    with client.session_transaction() as session:
        session["csrf_token"] = "changed-session-token"
    response = client.post("/api/auth/login", json={"studentId": "NIBM001", "password": "TestPassword1!"},
                           headers={"X-CSRFToken": stale_token})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "csrf_failed"


def test_registration_requires_auth_and_enforces_capacity(app, client):
    event_id = make_event(app)
    assert client.post(f"/api/events/{event_id}/registrations", json={}, headers={"X-CSRFToken": csrf(client)}).status_code == 401
    login(client)
    headers = {"X-CSRFToken": csrf(client)}
    assert client.post(f"/api/events/{event_id}/registrations", json={}, headers=headers).status_code == 201
    assert client.post(f"/api/events/{event_id}/registrations", json={}, headers=headers).status_code == 409
    rows = client.get("/api/registrations").get_json()["registrations"]
    assert len(rows) == 1
    assert rows[0]["event"]["availableSeats"] == 0


def test_student_cannot_create_events_and_unpublished_hidden(app, client):
    event_id = make_event(app)
    login(client)
    assert client.post("/api/events", json={}, headers={"X-CSRFToken": csrf(client)}).status_code == 403
    assert client.get(f"/api/events/{event_id}").status_code == 200


def test_frontend_is_served_and_full_event_cannot_be_overbooked(app, client):
    assert client.get("/").status_code == 302
    assert client.get("/login.html").status_code == 200
    assert client.get("/admin.html").status_code == 200
    event_id = make_event(app, capacity=1)
    login(client)
    headers = {"X-CSRFToken": csrf(client)}
    assert client.post(f"/api/events/{event_id}/registrations", json={}, headers=headers).status_code == 201
    client.post("/api/auth/logout", headers={"X-CSRFToken": csrf(client)})
    token = csrf(client)
    assert client.post("/api/auth/login", json={"studentId": "NIBM003", "password": "SecondPassword1!"},
                       headers={"X-CSRFToken": token}).status_code == 200
    assert client.post(f"/api/events/{event_id}/registrations", json={},
                       headers={"X-CSRFToken": csrf(client)}).status_code == 409
