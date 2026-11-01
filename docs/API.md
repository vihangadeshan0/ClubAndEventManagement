# CampusFlow API

Base URL: same origin, `/api`. Requests and responses use JSON. Cookies are
same-origin, HttpOnly sessions. Obtain a CSRF token from `GET /api/auth/csrf`
and send it as `X-CSRFToken` on every `POST`, `PATCH`, and `DELETE` request.
Errors use `{"error":{"code":"...","message":"..."}}`.

| Method and path | Access | Request | Success | Common errors |
|---|---|---|---|---|
| `GET /auth/csrf` | Public | — | `200 {csrfToken}` | — |
| `POST /auth/register` | Public | `{fullName, studentId, password}` | `202 {message}` (created, awaiting review; both admin roles are notified) | `400`, `409 account_exists`, `422 validation_error` |
| `POST /auth/login` | Public | `{studentId, password}` | `200 {user}` | `400`, `401 invalid_credentials`, `403 verification_required/verification_declined/account_deactivated` |
| `POST /auth/logout` | Session | `{}` | `200 {message}` | `401`, `400 csrf_failed` |
| `GET /auth/me` | Session | — | `200 {user}` | `401` |
| `GET /events` | Public | Optional `q`, `category` query | `200 {events: [...]}` | — |
| `GET /events/<id>` | Public | — | `200 {event}` | `404` |
| `POST /events` | `events_admin`, `clubs_admin` | `{title, description?, category?, startsAt, venue, capacity, published?}` | `201 {event}` | `400`, `403`, `422` |
| `PATCH /events/<id>` | `events_admin`, `clubs_admin` | Any event fields above | `200 {event}` | `403`, `404`, `409 capacity_conflict`, `422` |
| `DELETE /events/<id>` | `events_admin`, `clubs_admin` | — | `204` | `403`, `404`, `409 registrations_exist` |
| `GET /events/<id>/registrations` | `events_admin`, `clubs_admin` | — | `200 {registrations: [{id, campusId, fullName, status}]}` | `403`, `404` |
| `POST /events/<id>/registrations` | Verified student | `{}` | `201 {registration}` | `401`, `403`, `404`, `409 duplicate_registration/event_full` |
| `GET /registrations` | Session | — | `200 {registrations: [{id, eventId, status, event}]}` (own only) | `401` |
| `DELETE /registrations/<id>` | Student owner | — | `200 {message}` | `401`, `404`, `409 cancellation_closed` |
| `GET /clubs` | Student session | — | `200 {clubs: [...]}` (includes own membership state) | `401` |
| `GET /clubs/<id>` | Student session | — | `200 {club}` | `401`, `404` |
| `POST /clubs` | `events_admin`, `clubs_admin` | `{name, description?}` | `201 {club}` | `403`, `409 duplicate_club`, `422` |
| `PATCH /clubs/<id>` | `events_admin`, `clubs_admin` | `{name?, description?}` | `200 {club}` | `403`, `404`, `409 duplicate_club`, `422` |
| `POST /clubs/<id>/memberships` | Verified student | `{}` | `201 {membership}` | `401`, `403 membership_blocked`, `404`, `409 duplicate_membership/already_member` |
| `GET /memberships` | Session | — | `200 {memberships: [...]}` (own only) | `401` |
| `GET /admin/memberships` | Clubs Administrator | — | `200 {memberships: [...]}` (pending requests) | `403` |
| `PATCH /admin/memberships/<id>` | Clubs Administrator | `{status: "approved" or "rejected"}` | `200 {membership}` | `403`, `404`, `422` |
| `GET /admin/users/pending-verification` | `events_admin`, `clubs_admin` | — | `200 {users: [...]}` | `403` |
| `POST /admin/users/<id>/verify` | `events_admin`, `clubs_admin` | `{}` | `200 {message, user}` (approve pending account) | `403`, `404`, `409 verification_already_decided` |
| `PATCH /admin/users/<id>/verification` | `events_admin`, `clubs_admin` | `{status: approved|declined, reason?}` (decline requires 1–250 chars) | `200 {message, user, status, declineReason}` | `403`, `404`, `409 verification_already_decided`, `422` |
| `GET /announcements` | Session (students see campus-wide and approved-club announcements) | — | `200 {announcements: [...]}` | `401` |
| `POST /announcements` | `events_admin`, `clubs_admin` | `{title, body, clubId?}` (`clubId` absent means campus-wide) | `201 {announcement}` | `403`, `422` |
| `GET /notifications` | Session | — | `200 {notifications: [...]}` (own only) | `401` |
| `POST /notifications/<id>/read` | Session owner | `{}` | `200 {message}` | `401`, `404` |
| `POST /notifications/read-all` | Session (only current user's records) | `{}` | `200 {message, updated, unreadCount: 0}` | `400 csrf_failed`, `401` |

Registration requires `fullName` and `studentId` to be strings. Campus IDs are
3–64 ASCII letters/digits with optional internal hyphens; passwords are
8–256 characters. New student accounts have `verification_status=pending`.
Approval and decline are one-time decisions; declined students cannot access
student APIs, and login returns the stored decline reason.

Notification insertion happens after the primary action commits. Failure is
logged and does not roll back registration, approval, events, registrations,
or announcements. Notification rows carry an idempotency key where the event
has a stable identity.

Event `startsAt` accepts an ISO 8601 timestamp. A timestamp without an offset
is interpreted as Asia/Colombo local time. Stored times use UTC. Event list
dates and times are returned in Asia/Colombo. Event creation defaults to
unpublished. The payment model is a provider integration boundary only; there
is no payment endpoint until a provider and verified callbacks are configured.

Example event creation:

```http
POST /api/events
Content-Type: application/json
X-CSRFToken: <token>
```

```json
{
  "title": "Campus Tech Day",
  "description": "Student technology showcase",
  "category": "technology",
  "startsAt": "2026-11-08T09:00:00+05:30",
  "venue": "Main Auditorium",
  "capacity": 120,
  "published": true
}
```
