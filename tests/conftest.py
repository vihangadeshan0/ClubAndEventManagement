import pytest

from backend.campusflow import create_app
from backend.campusflow.extensions import db
from backend.campusflow.models import User


@pytest.fixture
def app():
    app = create_app({
        "TESTING": True,
        "SECRET_KEY": "pytest-secret",
        "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "WTF_CSRF_ENABLED": True,
        "SESSION_COOKIE_SECURE": False,
    })
    with app.app_context():
        db.create_all()
        student = User(campus_id="NIBM001", full_name="Test Student", role="student", verified=True, verification_status="approved")
        student.set_password("TestPassword1!")
        second_student = User(campus_id="NIBM003", full_name="Second Student", role="student", verified=True, verification_status="approved")
        second_student.set_password("SecondPassword1!")
        admin = User(campus_id="ADMIN001", full_name="Test Admin", role="events_admin", verified=True, verification_status="approved")
        admin.set_password("AdminPassword1!")
        clubs_admin = User(campus_id="CLUBADMIN", full_name="Club Admin", role="clubs_admin", verified=True, verification_status="approved")
        clubs_admin.set_password("ClubAdminPassword1!")
        db.session.add_all([student, second_student, admin, clubs_admin])
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()
