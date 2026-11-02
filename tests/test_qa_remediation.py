from backend.campusflow.extensions import db
from backend.campusflow.models import Notification, User
from sqlalchemy import event as sqlalchemy_event


def csrf(client):
    return client.get("/api/auth/csrf").get_json()["csrfToken"]


def login(client, campus_id, password):
    token = csrf(client)
    return client.post("/api/auth/login", json={"studentId": campus_id, "password": password},
                       headers={"X-CSRFToken": token})


def test_registration_rejects_non_strings_blank_and_malformed_ids(client):
    token = csrf(client)
    cases = [
        {"fullName": None, "studentId": "NIBM009", "password": "ValidPassword123!"},
        {"fullName": "   ", "studentId": "NIBM009", "password": "ValidPassword123!"},
        {"fullName": "New Student", "studentId": "@@@", "password": "ValidPassword123!"},
        {"fullName": "New Student", "studentId": "NIBM009", "password": None},
    ]
    for payload in cases:
        response = client.post("/api/auth/register", json=payload, headers={"X-CSRFToken": token})
        assert response.status_code == 422
        assert response.json["error"]["code"] == "validation_error"
    valid = client.post("/api/auth/register", json={"fullName": "  New Student ", "studentId": "KIC-DCSAI-009", "password": "ValidPassword123!"}, headers={"X-CSRFToken": token})
    assert valid.status_code == 202


def test_registration_persists_admin_notifications_and_account(client, app):
    response = client.post("/api/auth/register", json={"fullName": "Fresh Student", "studentId": "NIBM777", "password": "ValidPassword123!"}, headers={"X-CSRFToken": csrf(client)})
    assert response.status_code == 202
    with app.app_context():
        user = User.query.filter_by(campus_id="NIBM777").one()
        assert user.verification_status == "pending" and not user.verified
        notices = Notification.query.filter(Notification.title == "Student registration awaiting review").all()
        assert {db.session.get(User, n.user_id).role for n in notices} == {"events_admin", "clubs_admin"}
        assert all(n.target_url == "admin.html#students" for n in notices)
    duplicate = client.post("/api/auth/register", json={"fullName": "Fresh Student", "studentId": "NIBM777", "password": "ValidPassword123!"}, headers={"X-CSRFToken": csrf(client)})
    assert duplicate.status_code == 409


def test_admin_approval_and_rejection_are_persisted_and_conflict_safe(client, app):
    assert client.post("/api/auth/register", json={"fullName": "Approval Student", "studentId": "NIBM888", "password": "ValidPassword123!"}, headers={"X-CSRFToken": csrf(client)}).status_code == 202
    assert client.post("/api/auth/register", json={"fullName": "Rejected Student", "studentId": "NIBM889", "password": "ValidPassword123!"}, headers={"X-CSRFToken": csrf(client)}).status_code == 202
    with app.app_context():
        approved_id = User.query.filter_by(campus_id="NIBM888").one().id
        rejected_id = User.query.filter_by(campus_id="NIBM889").one().id
    assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
    approved = client.post(f"/api/admin/users/{approved_id}/verify", json={}, headers={"X-CSRFToken": csrf(client)})
    assert approved.status_code == 200 and approved.json["status"] == "approved"
    repeated = client.patch(f"/api/admin/users/{approved_id}/verification", json={"status": "declined", "reason": "No"}, headers={"X-CSRFToken": csrf(client)})
    assert repeated.status_code == 409
    decline = client.patch(f"/api/admin/users/{rejected_id}/verification", json={"status": "declined", "reason": "Unable to verify enrollment."}, headers={"X-CSRFToken": csrf(client)})
    assert decline.status_code == 200 and decline.json["declineReason"] == "Unable to verify enrollment."
    assert client.patch(f"/api/admin/users/{rejected_id}/verification", json={"status": "approved"}, headers={"X-CSRFToken": csrf(client)}).status_code == 409
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM888", "ValidPassword123!").status_code == 200
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    rejected = login(client, "NIBM889", "ValidPassword123!")
    assert rejected.status_code == 403 and "Unable to verify enrollment." in rejected.json["error"]["message"]
    assert client.get("/api/registrations").status_code == 401
    with client.session_transaction() as session:
        session["user_id"] = rejected_id
    blocked_session = client.get("/api/registrations")
    assert blocked_session.status_code == 403 and blocked_session.json["error"]["code"] == "verification_declined"
    assert client.get("/api/auth/me").status_code == 401
    with app.app_context():
        notice = Notification.query.filter_by(user_id=rejected_id, title="Student account declined").one()
        assert "Unable to verify enrollment." in notice.body and notice.target_url == "login.html"


def test_students_cannot_approve_or_decline_accounts(client, app):
    assert client.post("/api/auth/register", json={"fullName": "Pending Student", "studentId": "NIBM992", "password": "ValidPassword123!"}, headers={"X-CSRFToken": csrf(client)}).status_code == 202
    with app.app_context():
        pending_id = User.query.filter_by(campus_id="NIBM992").one().id
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    headers = {"X-CSRFToken": csrf(client)}
    assert client.post(f"/api/admin/users/{pending_id}/verify", json={}, headers=headers).status_code == 403
    assert client.patch(f"/api/admin/users/{pending_id}/verification", json={"status": "declined", "reason": "No"}, headers=headers).status_code == 403
    with app.app_context():
        assert db.session.get(User, pending_id).verification_status == "pending"


def test_mark_all_notifications_read_is_authenticated_scoped_and_persistent(client, app):
    with app.app_context():
        first = User.query.filter_by(campus_id="NIBM001").one()
        second = User.query.filter_by(campus_id="NIBM003").one()
        db.session.add_all([
            Notification(user_id=first.id, title="First notice", body="For first student"),
            Notification(user_id=second.id, title="Second notice", body="For second student"),
        ])
        db.session.commit()
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    response = client.post("/api/notifications/read-all", json={}, headers={"X-CSRFToken": csrf(client)})
    assert response.status_code == 200 and response.json["unreadCount"] == 0
    assert client.get("/api/notifications").json["unreadCount"] == 0
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM003", "SecondPassword1!").status_code == 200
    assert client.get("/api/notifications").json["unreadCount"] > 0
    assert client.post("/api/notifications/read-all", json={}).status_code == 400


def test_sqlite_foreign_keys_enforced_and_cascade_works(app):
    with app.app_context():
        assert db.session.execute(db.text("PRAGMA foreign_keys")).scalar_one() == 1
        student = User.query.filter_by(campus_id="NIBM001").one()
        student_id = student.id
        db.session.add(Notification(user_id=student_id, title="Cascade", body="Must be removed"))
        db.session.commit()
        db.session.delete(student)
        db.session.commit()
        assert Notification.query.filter_by(user_id=student_id).count() == 0


def test_notification_failures_do_not_rollback_primary_actions(client, app):
    def fail_notification_insert(_mapper, _connection, _target):
        raise RuntimeError("simulated notification storage outage")

    sqlalchemy_event.listen(Notification, "before_insert", fail_notification_insert)
    try:
        registered = client.post("/api/auth/register", json={"fullName": "Committed Student", "studentId": "NIBM991", "password": "ValidPassword123!"}, headers={"X-CSRFToken": csrf(client)})
        assert registered.status_code == 202
        assert login(client, "ADMIN001", "AdminPassword1!").status_code == 200
        headers = {"X-CSRFToken": csrf(client)}
        event_response = client.post("/api/events", json={"title": "Committed Event", "startsAt": "2099-11-01T10:00:00+05:30", "venue": "Hall", "capacity": 20, "published": True}, headers=headers)
        assert event_response.status_code == 201
        announcement = client.post("/api/announcements", json={"title": "Committed announcement", "body": "Main content should survive."}, headers={"X-CSRFToken": csrf(client)})
        assert announcement.status_code == 201
        with app.app_context():
            committed_user_id = User.query.filter_by(campus_id="NIBM991").one().id
        approved = client.post(f"/api/admin/users/{committed_user_id}/verify", json={}, headers={"X-CSRFToken": csrf(client)})
        assert approved.status_code == 200
    finally:
        sqlalchemy_event.remove(Notification, "before_insert", fail_notification_insert)
    with app.app_context():
        from backend.campusflow.models import Announcement, Event
        assert User.query.filter_by(campus_id="NIBM991").one().verification_status == "approved"
        assert Event.query.filter_by(title="Committed Event").count() == 1
        assert Announcement.query.filter_by(title="Committed announcement").count() == 1
