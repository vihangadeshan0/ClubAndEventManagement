from datetime import datetime, timezone
from functools import wraps
import re
from zoneinfo import ZoneInfo

from flask import Blueprint, current_app, jsonify, request, session
from sqlalchemy import func

from .extensions import db
from .models import (Announcement, Club, ClubMembership, Event, EventRegistration,
                     Notification, User)

api = Blueprint("api", __name__)


def response_error(message, status, code):
    return jsonify(error={"code": code, "message": message}), status


def current_user():
    user_id = session.get("user_id")
    return db.session.get(User, user_id) if user_id else None


def require_user(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = current_user()
            if not user:
                return response_error("Sign in to continue.", 401, "unauthorized")
            if user.role == "student" and user.verification_status == "declined":
                session.pop("user_id", None)
                return response_error(f"Your student account was declined. Reason: {user.verification_decline_reason or 'No reason provided.'}", 403, "verification_declined")
            if user.role == "student" and not user.verified:
                session.pop("user_id", None)
                return response_error("Your account is awaiting student identity verification.", 403, "verification_required")
            if user.role == "student" and not user.is_active:
                session.pop("user_id", None)
                return response_error("Your student account is deactivated. Contact an administrator.", 403, "account_deactivated")
            if roles and user.role not in roles:
                return response_error("You do not have permission to do that.", 403, "forbidden")
            return view(*args, **kwargs)
        return wrapped
    return decorator


def body_object():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def persist_notification_after_commit(user_id, title, body, *, target_url=None, idempotency_key, event_type):
    """Persist a notification independently from the already-committed primary action."""
    try:
        if Notification.query.filter_by(idempotency_key=idempotency_key).first():
            return
        db.session.add(Notification(user_id=user_id, title=title, body=body,
                                    target_url=target_url, idempotency_key=idempotency_key))
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Post-commit notification persistence failed: event_type=%s", event_type)


def persist_admin_notifications_after_commit(role, title, body, *, target_url, idempotency_prefix):
    try:
        admins = User.query.filter_by(role=role, verified=True, is_active=True).all()
        for admin in admins:
            persist_notification_after_commit(
                admin.id, title, body, target_url=target_url,
                idempotency_key=f"{idempotency_prefix}:admin:{admin.id}", event_type="admin_" + role,
            )
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Post-commit admin notification routing failed: role=%s", role)


def membership_state(membership):
    declined_count = membership.declined_count if membership else 0
    status = membership.status if membership else None
    return {
        "membershipStatus": status,
        "declinedCount": declined_count,
        "canRequest": status not in ("pending", "approved") and declined_count < 2,
        "declineReason": membership.decline_reason if membership else None,
    }


@api.get("/auth/csrf")
def csrf_token():
    from flask_wtf.csrf import generate_csrf
    return jsonify(csrfToken=generate_csrf())


@api.post("/auth/register")
def register():
    data = body_object()
    if not data:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    name, campus_id, password = (data.get(k) for k in ("fullName", "studentId", "password"))
    if not all(isinstance(value, str) for value in (name, campus_id, password)):
        return response_error("Full name, campus ID, and password must be strings.", 422, "validation_error")
    name, campus_id = name.strip(), campus_id.strip()
    if (len(name) < 2 or len(name) > 120 or any(ord(ch) < 32 for ch in name)
            or not re.fullmatch(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*", campus_id)
            or len(campus_id) < 3 or len(campus_id) > 64 or len(password) < 8 or len(password) > 256):
        return response_error("Provide a valid name, campus ID (letters/numbers with optional internal hyphens), and a password of 8–256 characters.", 422, "validation_error")
    if User.query.filter_by(campus_id=campus_id).first():
        return response_error("An account with that campus ID already exists.", 409, "account_exists")
    user = User(full_name=name, campus_id=campus_id, role="student", verified=False, verification_status="pending")
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    for role in ("events_admin", "clubs_admin"):
        persist_admin_notifications_after_commit(
            role, "Student registration awaiting review",
            f"{name} ({campus_id}) submitted a student account registration.",
            target_url="admin.html#students", idempotency_prefix=f"student-registration:{user.id}",
        )
    return jsonify(message="Account created and awaiting student identity verification by an administrator."), 202


@api.post("/auth/login")
def login():
    data = body_object()
    if not data:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    student_id, password = data.get("studentId"), data.get("password")
    if not isinstance(student_id, str) or not isinstance(password, str):
        return response_error("Campus ID and password must be strings.", 422, "validation_error")
    user = User.query.filter_by(campus_id=student_id.strip()).first()
    if not user or not user.check_password(password):
        return response_error("Campus ID or password is incorrect.", 401, "invalid_credentials")
    if user.role == "student" and user.verification_status == "declined":
        return response_error(f"Your student account was declined. Reason: {user.verification_decline_reason or 'No reason provided.'}", 403, "verification_declined")
    if user.role == "student" and (not user.verified or user.verification_status != "approved"):
        return response_error("Your account is awaiting student identity verification.", 403, "verification_required")
    if user.role == "student" and not user.is_active:
        return response_error("Your student account is deactivated. Contact an administrator.", 403, "account_deactivated")
    session["user_id"] = user.id
    return jsonify(user=user.public())


@api.post("/auth/logout")
@require_user()
def logout():
    session.pop("user_id", None)
    return jsonify(message="Signed out.")


@api.get("/auth/me")
@require_user()
def me():
    return jsonify(user=current_user().public())


@api.patch("/auth/profile")
@require_user("student")
def update_profile():
    data = body_object()
    if data is None:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    name = str(data.get("fullName", "")).strip()
    if len(name) < 2 or len(name) > 120:
        return response_error("Name must be between 2 and 120 characters.", 422, "validation_error")
    user = current_user()
    user.full_name = name
    db.session.commit()
    return jsonify(user=user.public())


@api.post("/auth/password")
@require_user()
def change_password():
    data = body_object()
    if data is None:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    current_password = data.get("currentPassword")
    new_password = data.get("newPassword")
    if not isinstance(current_password, str) or not isinstance(new_password, str):
        return response_error("Current and new passwords are required.", 422, "validation_error")
    user = current_user()
    if not user.check_password(current_password):
        return response_error("Current password is incorrect.", 401, "invalid_credentials")
    if len(new_password) < 8 or len(new_password) > 256:
        return response_error("New password must be between 8 and 256 characters.", 422, "validation_error")
    user.set_password(new_password)
    db.session.commit()
    return jsonify(message="Password changed successfully.")


@api.get("/events")
def list_events():
    query = Event.query.filter_by(published=True)
    search = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    if search:
        pattern = f"%{search[:100]}%"
        query = query.filter(db.or_(Event.title.ilike(pattern), Event.description.ilike(pattern), Event.location.ilike(pattern)))
    if category:
        query = query.filter_by(category=category)
    return jsonify(events=[event.public() for event in query.order_by(Event.starts_at).all()])


@api.get("/events/<int:event_id>")
def event_detail(event_id):
    event = Event.query.filter_by(id=event_id, published=True).first()
    if not event:
        return response_error("Event not found.", 404, "not_found")
    return jsonify(event=event.public())


def parse_event(data):
    title = str(data.get("title", "")).strip()
    location = str(data.get("venue", data.get("location", ""))).strip()
    description = str(data.get("description", "")).strip()
    category = str(data.get("category", "other")).strip().lower()
    raw_date = str(data.get("startsAt", data.get("date", ""))).strip()
    if len(title) < 2 or len(title) > 160 or not location or len(location) > 160:
        raise ValueError("Title and location are required.")
    if len(description) > 100_000 or not category or len(category) > 40:
        raise ValueError("Description or category is too long or invalid.")
    capacity = data.get("capacity")
    if not isinstance(capacity, int) or isinstance(capacity, bool) or capacity < 1:
        raise ValueError("Capacity must be a positive whole number.")
    try:
        starts_at = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        if starts_at.tzinfo is None:
            starts_at = starts_at.replace(tzinfo=ZoneInfo("Asia/Colombo"))
        starts_at = starts_at.astimezone(timezone.utc)
    except ValueError:
        raise ValueError("Provide a valid ISO 8601 date or date-time.")
    return title, description, category, starts_at, location, capacity


@api.post("/events")
@require_user("events_admin", "clubs_admin")
def create_event():
    data = body_object()
    if data is None:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    if "published" in data and not isinstance(data["published"], bool):
        return response_error("Published must be true or false.", 422, "validation_error")
    try:
        title, description, category, starts_at, location, capacity = parse_event(data)
    except ValueError as exc:
        return response_error(str(exc), 422, "validation_error")
    event = Event(title=title, description=description, category=category, starts_at=starts_at,
                  location=location, capacity=capacity, published=bool(data.get("published", False)))
    db.session.add(event)
    recipients = [u.id for u in User.query.filter_by(role="student", verified=True, is_active=True).all()] if event.published else []
    db.session.commit()
    for user_id in recipients:
        persist_notification_after_commit(
            user_id, "New campus event", f"{event.title} is now open for registration.",
            target_url=f"event-details.html?id={event.id}",
            idempotency_key=f"event-published:{event.id}:user:{user_id}", event_type="event_published",
        )
    return jsonify(event=event.public()), 201


@api.patch("/events/<int:event_id>")
@require_user("events_admin", "clubs_admin")
def update_event(event_id):
    event = db.session.get(Event, event_id)
    data = body_object()
    if not event:
        return response_error("Event not found.", 404, "not_found")
    if not data:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    if "published" in data and not isinstance(data["published"], bool):
        return response_error("Published must be true or false.", 422, "validation_error")
    merged = {"title": data.get("title", event.title), "description": data.get("description", event.description),
              "category": data.get("category", event.category), "startsAt": data.get("startsAt", event.starts_at.replace(tzinfo=timezone.utc).isoformat()),
              "venue": data.get("venue", event.location), "capacity": data.get("capacity", event.capacity)}
    try:
        title, description, category, starts_at, location, capacity = parse_event(merged)
    except ValueError as exc:
        return response_error(str(exc), 422, "validation_error")
    active = EventRegistration.query.filter_by(event_id=event.id, status="active").count()
    if capacity < active:
        return response_error("Capacity cannot be lower than the number of active registrations.", 409, "capacity_conflict")
    event.title, event.description, event.category = title, description, category
    event.starts_at, event.location, event.capacity = starts_at, location, capacity
    just_published = "published" in data and bool(data["published"]) and not event.published
    if "published" in data:
        event.published = bool(data["published"])
    recipients = [u.id for u in User.query.filter_by(role="student", verified=True, is_active=True).all()] if just_published else []
    db.session.commit()
    for user_id in recipients:
        persist_notification_after_commit(
            user_id, "New campus event", f"{event.title} is now open for registration.",
            target_url=f"event-details.html?id={event.id}",
            idempotency_key=f"event-published:{event.id}:user:{user_id}", event_type="event_published",
        )
    return jsonify(event=event.public())


@api.delete("/events/<int:event_id>")
@require_user("events_admin", "clubs_admin")
def delete_event(event_id):
    event = db.session.get(Event, event_id)
    if not event:
        return response_error("Event not found.", 404, "not_found")
    if EventRegistration.query.filter_by(event_id=event_id).count():
        return response_error("Events with registration history cannot be deleted; unpublish it instead.", 409, "registrations_exist")
    db.session.delete(event)
    db.session.commit()
    return "", 204


@api.get("/events/<int:event_id>/registrations")
@require_user("events_admin", "clubs_admin")
def event_registrations(event_id):
    if not db.session.get(Event, event_id):
        return response_error("Event not found.", 404, "not_found")
    rows = EventRegistration.query.filter_by(event_id=event_id, status="active").all()
    return jsonify(registrations=[{"id": r.id, "campusId": db.session.get(User, r.user_id).campus_id,
                                   "fullName": db.session.get(User, r.user_id).full_name, "status": r.status} for r in rows])


@api.post("/events/<int:event_id>/registrations")
@require_user("student")
def register_event(event_id):
    user = current_user()
    try:
        event = Event.query.filter_by(id=event_id, published=True).with_for_update().first()
        if not event:
            return response_error("Event not found.", 404, "not_found")
        prior = EventRegistration.query.filter_by(event_id=event_id, user_id=user.id).first()
        if prior and prior.status == "active":
            return response_error("You are already registered for this event.", 409, "duplicate_registration")
        count = EventRegistration.query.filter_by(event_id=event_id, status="active").count()
        if count >= event.capacity:
            return response_error("This event is full.", 409, "event_full")
        if prior:
            prior.status = "active"
            prior.created_at = datetime.now(timezone.utc)
            registration = prior
        else:
            registration = EventRegistration(event_id=event_id, user_id=user.id)
            db.session.add(registration)
        db.session.commit()
        persist_notification_after_commit(
            user.id, "Registration confirmed", f"You are registered for {event.title}.",
            target_url=f"event-details.html?id={event.id}",
            idempotency_key=f"event-registration:{registration.id}:{user.id}:{registration.created_at.isoformat()}",
            event_type="event_registration",
        )
        return jsonify(registration={"id": registration.id, "eventId": str(event.id), "status": registration.status}), 201
    except Exception:
        db.session.rollback()
        raise


@api.get("/registrations")
@require_user()
def my_registrations():
    query = EventRegistration.query.filter_by(user_id=current_user().id)
    if request.args.get("history", "").lower() not in ("1", "true"):
        query = query.filter_by(status="active")
    rows = query.order_by(EventRegistration.created_at.desc()).all()
    return jsonify(registrations=[{"id": r.id, "eventId": str(r.event_id), "status": r.status,
                                   "registeredAt": r.created_at.isoformat(), "event": r.event.public()} for r in rows])


@api.delete("/registrations/<int:registration_id>")
@require_user("student")
def cancel_registration(registration_id):
    row = EventRegistration.query.filter_by(id=registration_id, user_id=current_user().id, status="active").first()
    if not row:
        return response_error("Active registration not found.", 404, "not_found")
    start = row.event.starts_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if start <= datetime.now(timezone.utc):
        return response_error("Registrations can only be cancelled before the event begins.", 409, "cancellation_closed")
    row.status = "cancelled"
    user_id, event_id, title, registration_cycle = current_user().id, row.event.id, row.event.title, row.created_at.isoformat()
    db.session.commit()
    persist_notification_after_commit(
        user_id, "Registration cancelled", f"Your registration for {title} was cancelled.",
        target_url=f"event-details.html?id={event_id}",
        idempotency_key=f"event-registration-cancelled:{row.id}:{registration_cycle}",
        event_type="event_registration_cancelled",
    )
    return jsonify(message="Registration cancelled.")


@api.get("/clubs")
@require_user("student")
def list_clubs():
    user_id = current_user().id
    memberships = {m.club_id: m for m in ClubMembership.query.filter_by(user_id=user_id).all()}
    clubs = Club.query.order_by(Club.name).all()
    return jsonify(clubs=[{"id": c.id, "name": c.name, "description": c.description,
                           **membership_state(memberships.get(c.id)),
                           "memberCount": ClubMembership.query.filter_by(club_id=c.id, status="approved").count()}
                          for c in clubs])


@api.post("/admin/users/<int:user_id>/verify")
@require_user("events_admin", "clubs_admin")
def verify_student(user_id):
    return decide_student_verification(user_id, "approved", "")


@api.patch("/admin/users/<int:user_id>/verification")
@require_user("events_admin", "clubs_admin")
def decide_student_verification(user_id, status=None, reason=None):
    data = body_object() if status is None else None
    if data is not None:
        status, reason = data.get("status"), data.get("reason", "")
    if status not in ("approved", "declined"):
        return response_error("Choose approved or declined.", 422, "validation_error")
    if status == "declined" and (not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > 250):
        return response_error("A decline reason of 1–250 characters is required.", 422, "validation_error")
    if status == "approved":
        reason = None
    user = db.session.get(User, user_id)
    if not user or user.role != "student":
        return response_error("Student account not found.", 404, "not_found")
    if user.verification_status != "pending" or user.verified:
        return response_error("This student account has already been decided.", 409, "verification_already_decided")
    changed = (User.query.filter_by(id=user_id, role="student", verification_status="pending", verified=False)
               .update({"verification_status": status, "verification_decline_reason": reason,
                        "verified": status == "approved"}, synchronize_session=False))
    if changed != 1:
        db.session.rollback()
        return response_error("This student account has already been decided.", 409, "verification_already_decided")
    db.session.commit()
    user = db.session.get(User, user_id)
    if status == "approved":
        title = "Account verified"
        body = "Your student account is verified. You can now sign in."
    else:
        title = "Student account declined"
        body = f"Your student account registration was declined. Reason: {reason}"
    persist_notification_after_commit(
        user.id, title, body, target_url="login.html",
        idempotency_key=f"student-verification:{user.id}:{status}",
        event_type=f"student_verification_{status}",
    )
    return jsonify(message=f"Student account {status}.", user=user.public(), status=status,
                   declineReason=user.verification_decline_reason)


@api.get("/admin/users/pending-verification")
@require_user("events_admin", "clubs_admin")
def pending_student_verification():
    users = User.query.filter_by(role="student", verification_status="pending").order_by(User.created_at).all()
    return jsonify(users=[{"id": u.id, "campusId": u.campus_id, "fullName": u.full_name,
                          "createdAt": u.created_at.isoformat()} for u in users])


@api.get("/admin/overview")
@require_user("events_admin", "clubs_admin")
def admin_overview():
    now = datetime.now(timezone.utc)
    return jsonify(overview={"students": User.query.filter_by(role="student").count(),
                             "pendingStudents": User.query.filter_by(role="student", verification_status="pending").count(),
                             "events": Event.query.count(),
                             "upcomingEvents": Event.query.filter(Event.starts_at >= now).count(),
                             "clubs": Club.query.count(),
                             "registrations": EventRegistration.query.filter_by(status="active").count()})


@api.get("/admin/students")
@require_user("events_admin", "clubs_admin")
def admin_students():
    query = User.query.filter_by(role="student")
    status, search = request.args.get("status", "all"), request.args.get("q", "").strip()[:100]
    if status in ("pending", "approved", "declined"):
        query = query.filter_by(verification_status=status)
    elif status != "all":
        return response_error("Status must be all, pending, approved, or declined.", 422, "validation_error")
    if search:
        pattern = f"%{search}%"
        query = query.filter(db.or_(User.full_name.ilike(pattern), User.campus_id.ilike(pattern)))
    return jsonify(students=[{"id": u.id, "campusId": u.campus_id, "fullName": u.full_name,
                             "verified": u.verified, "verificationStatus": u.verification_status,
                             "declineReason": u.verification_decline_reason,
                             "isActive": u.is_active, "createdAt": u.created_at.isoformat()}
                            for u in query.order_by(User.full_name).all()])


@api.get("/admin/students/<int:user_id>")
@require_user("events_admin", "clubs_admin")
def admin_student_detail(user_id):
    user = db.session.get(User, user_id)
    if not user or user.role != "student":
        return response_error("Student account not found.", 404, "not_found")
    return jsonify(student={"id": user.id, "campusId": user.campus_id, "fullName": user.full_name,
                            "verified": user.verified, "verificationStatus": user.verification_status,
                            "declineReason": user.verification_decline_reason, "isActive": user.is_active,
                            "createdAt": user.created_at.isoformat()})


@api.patch("/admin/students/<int:user_id>")
@require_user("events_admin", "clubs_admin")
def update_admin_student(user_id):
    user, data = db.session.get(User, user_id), body_object()
    if not user or user.role != "student":
        return response_error("Student account not found.", 404, "not_found")
    if data is None:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    name = str(data.get("fullName", user.full_name)).strip()
    campus_id = str(data.get("campusId", user.campus_id)).strip()
    if len(name) < 2 or len(name) > 120 or len(campus_id) < 3 or len(campus_id) > 64:
        return response_error("Provide a valid name and campus ID.", 422, "validation_error")
    duplicate = User.query.filter(User.campus_id == campus_id, User.id != user.id).first()
    if duplicate:
        return response_error("That campus ID is already in use.", 409, "account_exists")
    user.full_name, user.campus_id = name, campus_id
    db.session.commit()
    return jsonify(student={"id": user.id, "campusId": user.campus_id, "fullName": user.full_name,
                            "verified": user.verified, "isActive": user.is_active})


@api.patch("/admin/students/<int:user_id>/status")
@require_user("events_admin", "clubs_admin")
def set_admin_student_status(user_id):
    user, data = db.session.get(User, user_id), body_object()
    if not user or user.role != "student":
        return response_error("Student account not found.", 404, "not_found")
    if data is None or not isinstance(data.get("isActive"), bool):
        return response_error("isActive must be true or false.", 422, "validation_error")
    user.is_active = data["isActive"]
    db.session.commit()
    return jsonify(student={"id": user.id, "isActive": user.is_active, "verified": user.verified})


@api.post("/admin/students/<int:user_id>/password")
@require_user("events_admin", "clubs_admin")
def reset_admin_student_password(user_id):
    user, data = db.session.get(User, user_id), body_object()
    if not user or user.role != "student":
        return response_error("Student account not found.", 404, "not_found")
    password = data.get("newPassword") if data else None
    if not isinstance(password, str) or len(password) < 8 or len(password) > 256:
        return response_error("New password must be between 8 and 256 characters.", 422, "validation_error")
    user.set_password(password)
    db.session.commit()
    return jsonify(message="Student password was reset.")


@api.get("/admin/events")
@require_user("events_admin", "clubs_admin")
def admin_events():
    events = Event.query.order_by(Event.starts_at).all()
    result = []
    for event in events:
        starts_at = event.starts_at
        if starts_at.tzinfo is None:
            starts_at = starts_at.replace(tzinfo=timezone.utc)
        result.append({**event.public(), "startsAt": starts_at.isoformat(),
                       "registrations": EventRegistration.query.filter_by(event_id=event.id, status="active").count()})
    return jsonify(events=result)


@api.get("/clubs/<int:club_id>")
@require_user("student")
def club_detail(club_id):
    club = db.session.get(Club, club_id)
    if not club:
        return response_error("Club not found.", 404, "not_found")
    membership = ClubMembership.query.filter_by(club_id=club_id, user_id=current_user().id).first()
    return jsonify(club={"id": club.id, "name": club.name, "description": club.description,
                         **membership_state(membership),
                         "memberCount": ClubMembership.query.filter_by(club_id=club_id, status="approved").count()})


@api.post("/clubs")
@require_user("events_admin", "clubs_admin")
def create_club():
    data = body_object() or {}
    name, description = str(data.get("name", "")).strip(), str(data.get("description", "")).strip()
    if not name or len(name) > 120:
        return response_error("Club name is required and must be at most 120 characters.", 422, "validation_error")
    if Club.query.filter(func.lower(Club.name) == name.lower()).first():
        return response_error("A club with that name already exists.", 409, "duplicate_club")
    club = Club(name=name, description=description)
    db.session.add(club)
    db.session.commit()
    return jsonify(club={"id": club.id, "name": club.name, "description": club.description}), 201


@api.patch("/clubs/<int:club_id>")
@require_user("events_admin", "clubs_admin")
def update_club(club_id):
    club, data = db.session.get(Club, club_id), body_object()
    if not club:
        return response_error("Club not found.", 404, "not_found")
    if not data:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    if "name" in data:
        name = str(data["name"]).strip()
        if not name or len(name) > 120:
            return response_error("Club name is required and must be at most 120 characters.", 422, "validation_error")
        existing = Club.query.filter(func.lower(Club.name) == name.lower(), Club.id != club_id).first()
        if existing:
            return response_error("A club with that name already exists.", 409, "duplicate_club")
        club.name = name
    if "description" in data:
        club.description = str(data["description"]).strip()
    db.session.commit()
    return jsonify(club={"id": club.id, "name": club.name, "description": club.description})


@api.get("/admin/clubs")
@require_user("events_admin", "clubs_admin")
def admin_clubs():
    clubs = Club.query.order_by(Club.name).all()
    return jsonify(clubs=[{"id": c.id, "name": c.name, "description": c.description,
                           "members": ClubMembership.query.filter_by(club_id=c.id, status="approved").count(),
                           "pending": ClubMembership.query.filter_by(club_id=c.id, status="pending").count()} for c in clubs])


@api.get("/clubs/<int:club_id>/members")
@require_user("events_admin", "clubs_admin")
def club_members(club_id):
    club = db.session.get(Club, club_id)
    if not club:
        return response_error("Club not found.", 404, "not_found")
    memberships = ClubMembership.query.filter_by(club_id=club_id, status="approved").all()
    members = []
    for membership in memberships:
        user = db.session.get(User, membership.user_id)
        if user and user.role == "student":
            members.append({"id": user.id, "membershipId": membership.id,
                            "fullName": user.full_name, "campusId": user.campus_id})
    return jsonify(club={"id": club.id, "name": club.name}, members=members)


@api.delete("/admin/clubs/<int:club_id>/memberships/<int:membership_id>")
@require_user("events_admin", "clubs_admin")
def remove_club_member(club_id, membership_id):
    club = db.session.get(Club, club_id)
    if not club:
        return response_error("Club not found.", 404, "not_found")
    membership = ClubMembership.query.filter_by(
        id=membership_id, club_id=club_id, status="approved",
    ).first()
    if not membership:
        return response_error("Approved club member not found.", 404, "not_found")
    student = db.session.get(User, membership.user_id)
    if not student or student.role != "student":
        return response_error("Student account not found.", 404, "not_found")

    changed = (ClubMembership.query.filter_by(id=membership_id, club_id=club_id, status="approved")
               .update({"status": "removed"}, synchronize_session=False))
    if changed != 1:
        db.session.rollback()
        return response_error("This member has already been removed.", 409, "member_already_removed")
    request_key = membership.created_at.isoformat()
    db.session.commit()
    persist_notification_after_commit(
        student.id, "Club membership updated",
        f"Your membership in {club.name} was removed by a club administrator.",
        target_url=f"club-details.html?id={club.id}",
        idempotency_key=f"club-membership-removed:{membership.id}:{request_key}",
        event_type="club_member_removed",
    )
    return jsonify(message="Club member removed.", membership={
        "id": membership.id, "status": "removed", "declinedCount": membership.declined_count,
    })


@api.delete("/clubs/<int:club_id>")
@require_user("events_admin", "clubs_admin")
def delete_club(club_id):
    club = db.session.get(Club, club_id)
    if not club:
        return response_error("Club not found.", 404, "not_found")
    if ClubMembership.query.filter_by(club_id=club_id).count() or Announcement.query.filter_by(club_id=club_id).count():
        return response_error("Clubs with membership requests or announcements cannot be deleted.", 409, "club_in_use")
    db.session.delete(club)
    db.session.commit()
    return "", 204


@api.post("/clubs/<int:club_id>/memberships")
@require_user("student")
def join_club(club_id):
    if not db.session.get(Club, club_id):
        return response_error("Club not found.", 404, "not_found")
    user_id = current_user().id
    membership = ClubMembership.query.filter_by(club_id=club_id, user_id=user_id).first()
    if membership:
        if membership.status == "approved":
            return response_error("You are already a member of this club.", 409, "already_member")
        if membership.status == "pending":
            return response_error("A membership request is already pending for this club.", 409, "duplicate_membership")
        if membership.declined_count >= 2:
            return response_error(
                f"You cannot request to join this club again. Your requests were declined {membership.declined_count} times.",
                403, "membership_blocked",
            )
        if membership.status not in ("declined", "rejected", "removed"):
            return response_error("A membership record already exists for this club.", 409, "membership_exists")
        if membership.status in ("declined", "rejected"):
            membership.declined_count = max(1, membership.declined_count)
        membership.status = "pending"
        membership.created_at = datetime.now(timezone.utc)
    else:
        membership = ClubMembership(club_id=club_id, user_id=user_id, status="pending", declined_count=0)
        db.session.add(membership)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        existing = ClubMembership.query.filter_by(club_id=club_id, user_id=user_id).first()
        if existing and existing.status == "pending":
            return response_error("A membership request is already pending for this club.", 409, "duplicate_membership")
        raise
    persist_admin_notifications_after_commit(
        "clubs_admin", "New club membership request",
        f"{current_user().full_name} requested to join {db.session.get(Club, club_id).name}.",
        target_url="admin.html#memberships",
        idempotency_prefix=f"club-membership-request:{membership.id}:{membership.created_at.isoformat()}",
    )
    return jsonify(membership={"id": membership.id, "clubId": club_id, "status": membership.status,
                               "declinedCount": membership.declined_count,
                               "canRequest": membership_state(membership)["canRequest"],
                               "declineReason": membership.decline_reason}), 201


@api.delete("/memberships/<int:membership_id>")
@require_user("student")
def cancel_membership_request(membership_id):
    membership = ClubMembership.query.filter_by(id=membership_id, user_id=current_user().id, status="pending").first()
    if not membership:
        return response_error("Pending membership request not found.", 404, "not_found")
    db.session.delete(membership)
    db.session.commit()
    return jsonify(message="Membership request cancelled.")


@api.get("/memberships")
@require_user()
def my_memberships():
    rows = ClubMembership.query.filter_by(user_id=current_user().id).order_by(ClubMembership.created_at.desc()).all()
    result = []
    for membership in rows:
        club = db.session.get(Club, membership.club_id)
        if not club:
            continue
        announcements = (Announcement.query.filter_by(club_id=club.id).order_by(Announcement.created_at.desc()).limit(20).all()
                         if membership.status == "approved" else [])
        result.append({"id": membership.id, "clubId": club.id, "status": membership.status,
                       "declinedCount": membership.declined_count,
                       "canRequest": membership_state(membership)["canRequest"],
                       "declineReason": membership.decline_reason,
                       "createdAt": membership.created_at.isoformat(),
                       "club": {"id": club.id, "name": club.name, "description": club.description},
                       "announcements": [{"id": a.id, "title": a.title, "body": a.body,
                                          "createdAt": a.created_at.isoformat()} for a in announcements]})
    return jsonify(memberships=result)


@api.get("/admin/memberships")
@require_user("events_admin", "clubs_admin")
def pending_memberships():
    rows = ClubMembership.query.filter_by(status="pending").all()
    return jsonify(memberships=[{"id": m.id, "clubId": m.club_id, "club": db.session.get(Club, m.club_id).name,
                                "campusId": db.session.get(User, m.user_id).campus_id,
                                "fullName": db.session.get(User, m.user_id).full_name,
                                "createdAt": m.created_at.isoformat()} for m in rows])


@api.patch("/admin/memberships/<int:membership_id>")
@require_user("events_admin", "clubs_admin")
def decide_membership(membership_id):
    membership, data = db.session.get(ClubMembership, membership_id), body_object()
    if not membership:
        return response_error("Membership request not found.", 404, "not_found")
    if data is None:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    decision = data.get("status")
    if decision == "rejected":
        decision = "declined"
    reason = data.get("reason", data.get("declineReason", ""))
    if decision not in ("approved", "declined"):
        return response_error("Choose approved or declined for a pending request.", 422, "validation_error")
    if decision == "declined" and (not isinstance(reason, str) or len(reason.strip()) > 250):
        return response_error("Decline reason must be at most 250 characters.", 422, "validation_error")

    club = db.session.get(Club, membership.club_id)
    student_id = membership.user_id
    update_values = {"status": decision}
    if decision == "declined":
        update_values.update({"declined_count": ClubMembership.declined_count + 1,
                              "decline_reason": reason.strip() or None})
    changed = (ClubMembership.query.filter_by(id=membership_id, status="pending")
               .update(update_values, synchronize_session=False))
    if changed != 1:
        db.session.rollback()
        return response_error("This membership request has already been decided.", 409, "request_already_decided")
    db.session.commit()
    membership = db.session.get(ClubMembership, membership_id)
    decline_text = membership.decline_reason or "No reason provided"
    if decision == "declined":
        if membership.declined_count >= 2:
            outcome = "Your request was declined for the second time. You can no longer request to join this club."
        else:
            outcome = "You can submit one more request."
        body = f"Your request to join {club.name} was declined. Reason: {decline_text}. {outcome}"
        persist_notification_after_commit(
            student_id, "Club membership declined", body,
            target_url=f"club-details.html?id={club.id}",
            idempotency_key=f"club-membership-declined:{membership.id}:{membership.declined_count}",
            event_type="club_membership_declined",
        )
    else:
        persist_notification_after_commit(
            student_id, "Club membership approved", f"Your request to join {club.name} was approved.",
            target_url=f"club-details.html?id={club.id}",
            idempotency_key=f"club-membership-approved:{membership.id}",
            event_type="club_membership_approved",
        )
    return jsonify(membership={"id": membership.id, "status": membership.status,
                               "declinedCount": membership.declined_count,
                               "canRequest": membership_state(membership)["canRequest"],
                               "declineReason": membership.decline_reason})


@api.get("/announcements")
@require_user()
def list_announcements():
    user = current_user()
    query = Announcement.query
    if user.role == "student":
        club_ids = db.session.query(ClubMembership.club_id).filter_by(user_id=user.id, status="approved")
        query = query.filter(db.or_(Announcement.club_id.is_(None), Announcement.club_id.in_(club_ids)))
    rows = query.order_by(Announcement.created_at.desc()).limit(100).all()
    return jsonify(announcements=[{"id": a.id, "clubId": a.club_id, "title": a.title, "body": a.body,
                                   "createdAt": a.created_at.isoformat()} for a in rows])


@api.post("/announcements")
@require_user("events_admin", "clubs_admin")
def create_announcement():
    data = body_object() or {}
    title, body = str(data.get("title", "")).strip(), str(data.get("body", "")).strip()
    club_id = data.get("clubId")
    if (not title or not body or len(title) > 160 or len(body) > 500
            or (club_id is not None and (not isinstance(club_id, int) or isinstance(club_id, bool) or not db.session.get(Club, club_id)))):
        return response_error("Provide a title, body, and valid club.", 422, "validation_error")
    announcement = Announcement(club_id=club_id, title=title, body=body)
    db.session.add(announcement)
    if club_id is None:
        recipients = User.query.filter_by(role="student", verified=True).all()
    else:
        recipients = [db.session.get(User, m.user_id) for m in ClubMembership.query.filter_by(club_id=club_id, status="approved").all()]
    recipient_ids = [user.id for user in recipients if user]
    db.session.commit()
    for user_id in recipient_ids:
        persist_notification_after_commit(
            user_id, title, body, target_url="dashboard.html",
            idempotency_key=f"announcement:{announcement.id}:user:{user_id}", event_type="announcement_created",
        )
    return jsonify(announcement={"id": announcement.id, "title": title, "body": body}), 201


@api.patch("/announcements/<int:announcement_id>")
@require_user("events_admin", "clubs_admin")
def update_announcement(announcement_id):
    announcement, data = db.session.get(Announcement, announcement_id), body_object()
    if not announcement:
        return response_error("Announcement not found.", 404, "not_found")
    if data is None:
        return response_error("A JSON request body is required.", 400, "invalid_request")
    title = str(data.get("title", announcement.title)).strip()
    body = str(data.get("body", announcement.body)).strip()
    if not title or len(title) > 160 or not body or len(body) > 500:
        return response_error("Provide a title (max 160 characters) and body (max 500 characters).", 422, "validation_error")
    announcement.title, announcement.body = title, body
    db.session.commit()
    return jsonify(announcement={"id": announcement.id, "title": title, "body": body})


@api.delete("/announcements/<int:announcement_id>")
@require_user("events_admin", "clubs_admin")
def delete_announcement(announcement_id):
    announcement = db.session.get(Announcement, announcement_id)
    if not announcement:
        return response_error("Announcement not found.", 404, "not_found")
    db.session.delete(announcement)
    db.session.commit()
    return "", 204


@api.get("/notifications")
@require_user()
def list_notifications():
    rows = Notification.query.filter_by(user_id=current_user().id).order_by(Notification.created_at.desc()).limit(100)
    items = list(rows)
    return jsonify(notifications=[{"id": n.id, "title": n.title, "body": n.body,
                                  "targetUrl": n.target_url, "read": n.read_at is not None,
                                  "createdAt": n.created_at.isoformat()} for n in items],
                   unreadCount=Notification.query.filter_by(user_id=current_user().id, read_at=None).count())


@api.post("/notifications/<int:notification_id>/read")
@require_user()
def mark_notification_read(notification_id):
    row = Notification.query.filter_by(id=notification_id, user_id=current_user().id).first()
    if not row:
        return response_error("Notification not found.", 404, "not_found")
    row.read_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(message="Notification marked as read.")


@api.post("/notifications/read-all")
@require_user()
def mark_all_notifications_read():
    changed = (Notification.query.filter_by(user_id=current_user().id, read_at=None)
               .update({"read_at": datetime.now(timezone.utc)}, synchronize_session=False))
    db.session.commit()
    return jsonify(message="All notifications marked as read.", updated=changed, unreadCount=0)
