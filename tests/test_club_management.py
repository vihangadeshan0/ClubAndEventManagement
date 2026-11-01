from backend.campusflow.extensions import db
from backend.campusflow.models import Announcement, Club, ClubMembership, Notification


def csrf(client):
    return client.get("/api/auth/csrf").get_json()["csrfToken"]


def login(client, campus_id, password):
    return client.post("/api/auth/login", json={"studentId": campus_id, "password": password},
                       headers={"X-CSRFToken": csrf(client)})


def test_admin_removes_member_without_losing_history_and_student_can_rejoin(app, client):
    with app.app_context():
        club = Club(name="Managed Club", description="A club managed by the admin")
        db.session.add(club)
        db.session.flush()
        membership = ClubMembership(club_id=club.id, user_id=1, status="approved",
                                    declined_count=1, decline_reason="Earlier request reason")
        db.session.add(membership)
        db.session.commit()
        club_id, membership_id = club.id, membership.id

    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    forbidden = client.delete(f"/api/admin/clubs/{club_id}/memberships/{membership_id}",
                              headers={"X-CSRFToken": csrf(client)})
    assert forbidden.status_code == 403
    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200

    members = client.get(f"/api/clubs/{club_id}/members").json["members"]
    assert members == [{"id": 1, "membershipId": membership_id,
                        "fullName": "Test Student", "campusId": "NIBM001"}]
    removed = client.delete(f"/api/admin/clubs/{club_id}/memberships/{membership_id}",
                            headers={"X-CSRFToken": csrf(client)})
    assert removed.status_code == 200
    assert removed.json["membership"]["status"] == "removed"
    assert client.delete(f"/api/admin/clubs/{club_id}/memberships/{membership_id}",
                         headers={"X-CSRFToken": csrf(client)}).status_code == 404
    with app.app_context():
        record = db.session.get(ClubMembership, membership_id)
        assert record.status == "removed"
        assert record.declined_count == 1
        assert record.decline_reason == "Earlier request reason"
        notice = Notification.query.filter_by(user_id=1).one()
        assert "Managed Club" in notice.body
        assert notice.target_url == f"club-details.html?id={club_id}"

    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    clubs = client.get("/api/clubs").json["clubs"]
    assert clubs[0]["membershipStatus"] == "removed" and clubs[0]["canRequest"] is True
    retry = client.post(f"/api/clubs/{club_id}/memberships", json={}, headers={"X-CSRFToken": csrf(client)})
    assert retry.status_code == 201
    assert retry.json["membership"]["declinedCount"] == 1
    with app.app_context():
        record = db.session.get(ClubMembership, membership_id)
        assert record.status == "pending" and record.declined_count == 1


def test_admin_club_update_creates_announcement_and_member_notifications(app, client):
    with app.app_context():
        club = Club(name="Update Club")
        db.session.add(club)
        db.session.flush()
        db.session.add_all([
            ClubMembership(club_id=club.id, user_id=1, status="approved"),
            ClubMembership(club_id=club.id, user_id=2, status="pending"),
        ])
        db.session.commit()
        club_id = club.id

    assert login(client, "CLUBADMIN", "ClubAdminPassword1!").status_code == 200
    sent = client.post("/api/announcements", json={
        "clubId": club_id, "title": "Meeting tonight", "body": "Meet in the student hall at 6.",
    }, headers={"X-CSRFToken": csrf(client)})
    assert sent.status_code == 201
    with app.app_context():
        announcement = db.session.get(Announcement, sent.json["announcement"]["id"])
        assert announcement.club_id == club_id
        assert Notification.query.filter_by(user_id=1, title="Meeting tonight").count() == 1
        assert Notification.query.filter_by(user_id=2, title="Meeting tonight").count() == 0

    client.post("/api/auth/logout", json={}, headers={"X-CSRFToken": csrf(client)})
    assert login(client, "NIBM001", "TestPassword1!").status_code == 200
    student_notices = client.get("/api/notifications").json["notifications"]
    assert any(item["title"] == "Meeting tonight" for item in student_notices)

