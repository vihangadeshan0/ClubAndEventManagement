from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    campus_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(24), nullable=False, default="student", index=True)
    verified = db.Column(db.Boolean, nullable=False, default=False)
    verification_status = db.Column(db.String(16), nullable=False, default="pending", server_default="pending", index=True)
    verification_decline_reason = db.Column(db.String(250))
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true(), index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def public(self):
        return {"id": self.id, "campusId": self.campus_id, "fullName": self.full_name, "role": self.role}


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    category = db.Column(db.String(40), nullable=False, default="other")
    starts_at = db.Column(db.DateTime(timezone=True), nullable=False)
    location = db.Column(db.String(160), nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    published = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    registrations = db.relationship("EventRegistration", back_populates="event", cascade="all, delete-orphan")

    def public(self):
        registered = sum(r.status == "active" for r in self.registrations)
        start = self.starts_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        local_start = start.astimezone(ZoneInfo("Asia/Colombo"))
        return {"id": str(self.id), "title": self.title, "description": self.description,
                "category": self.category, "date": local_start.strftime("%Y-%m-%d"),
                "time": local_start.strftime("%I:%M %p").lstrip("0"), "startsAt": start.isoformat(),
                "venue": self.location, "capacity": self.capacity,
                "availableSeats": max(0, self.capacity - registered), "published": self.published}


class EventRegistration(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="active")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (db.UniqueConstraint("event_id", "user_id", name="uq_registration_event_user"),
                      db.Index("ix_registration_event_status", "event_id", "status"))
    event = db.relationship("Event", back_populates="registrations")


class Club(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class ClubMembership(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    club_id = db.Column(db.Integer, db.ForeignKey("club.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")
    declined_count = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    decline_reason = db.Column(db.String(250))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (db.UniqueConstraint("club_id", "user_id", name="uq_membership_club_user"),)


class Announcement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    club_id = db.Column(db.Integer, db.ForeignKey("club.id", ondelete="CASCADE"), nullable=True)
    title = db.Column(db.String(160), nullable=False)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    title = db.Column(db.String(160), nullable=False)
    body = db.Column(db.String(500), nullable=False)
    target_url = db.Column(db.String(300))
    idempotency_key = db.Column(db.String(220))
    read_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (db.Index("uq_notification_idempotency_key", "idempotency_key", unique=True),)


class Payment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    registration_id = db.Column(db.Integer, db.ForeignKey("event_registration.id", ondelete="CASCADE"), nullable=False, unique=True)
    provider = db.Column(db.String(60))
    transaction_reference = db.Column(db.String(160), unique=True)
    status = db.Column(db.String(20), nullable=False, default="pending")
    amount_minor = db.Column(db.Integer, nullable=False, default=0)
    currency = db.Column(db.String(3), nullable=False, default="LKR")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
