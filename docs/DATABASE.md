# CampusFlow database design

The schema is defined in `backend/campusflow/models.py`; the first Alembic
revision is in `migrations/versions/1002260ad7bd_initial_schema.py`.
The current remediation revision is `5d8ac42e7f10`, after
`41b7c6d2a903_membership_decline_tracking.py`.

## Tables and relationships

- `user`: campus ID (unique/indexed), full name, password hash, role, legacy
  `verified` flag, `verification_status` (`pending`, `approved`, `declined`),
  optional `verification_decline_reason`, `is_active`, and creation timestamp.
  Roles are `student`, `events_admin`, and `clubs_admin`. The migration
  backfills approved from `verified=true` and pending from `false`, without
  changing existing user rows or IDs. New account decisions are one-time
  pending-state transitions; `verified` remains for compatibility.
- `event`: title, description, category, UTC start time, location, positive
  capacity (validated as positive by the API), published flag, creation
  timestamp. Published events are visible through the public API.
- `event_registration`: foreign keys to one event and one user, status and
  creation timestamp. `(event_id, user_id)` is unique, with an additional
  `(event_id, status)` index for seat counts. Cancelled registrations remain
  as history and can be reactivated without creating duplicates.
- `club`: unique name, description, creation timestamp.
- `club_membership`: foreign keys to a club and user, pending/approved/rejected
  status and creation timestamp. `(club_id, user_id)` is unique.
- `announcement`: optional club foreign key (null means campus-wide), title,
  body and creation timestamp.
- `notification`: foreign key to its recipient, title, body, optional target
  URL, unique nullable idempotency key, optional read timestamp, and creation
  timestamp. Reads are scoped to the signed-in user's ID; mark-all-read only
  updates that user's unread rows.
- `payment`: one-to-one foreign key to an event registration, provider,
  unique provider transaction reference, status, amount in minor currency units,
  currency and timestamp. No card data is stored.

Foreign keys use cascading deletion for dependent rows. For SQLite, the
SQLAlchemy engine enables `PRAGMA foreign_keys=ON` on every DBAPI connection;
the setting is connection-local. Event deletion is
blocked by the API while active registrations exist; administrators should
unpublish an event when its history must remain. All timestamps are stored in
UTC. Naive event timestamps from the API are interpreted as Asia/Colombo local
time, then converted to UTC for storage.

## Concurrency and privacy

Registration creation opens a database transaction, locks the event row with
`SELECT ... FOR UPDATE` on databases that support row locking, checks active
seats, and inserts the registration before commit. The unique event/user key
separately protects against duplicate reservations. SQLite is the configured
local demonstration database; its write-locking behavior differs from
databases with row-level locking.

Authentication responses serialize only the user's ID, campus ID, name, and
role; password hashes and decline reasons are not included in that serializer.
Student registration and membership lists are scoped to the current session.
Admin operations permit both `events_admin` and `clubs_admin` unless the API
documentation identifies a narrower permission.

Notification inserts run after the associated account, event, registration,
approval, or announcement transaction has committed. Failures are logged and
do not roll back that primary action. Stable notification identities use the
unique idempotency key to prevent repeated inserts.
