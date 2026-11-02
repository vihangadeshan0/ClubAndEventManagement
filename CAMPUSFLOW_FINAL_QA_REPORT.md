# CAMPUSFLOW — FINAL COMPREHENSIVE QA REPORT

**Audit date:** 2026-11-01  
**Scope:** Local CampusFlow project, current SQLite database, existing automated suite, focused isolated probes, source and frontend inspection.  
**Changes during audit:** This report only. No source code or existing database records were changed by the audit. Write tests and the malformed-registration reproduction used isolated in-memory databases.

## 1. Executive Summary

CampusFlow is **partially ready for a local demonstration**, but it is not complete against the supplied QA checklist. The existing test suite passes and the SQLite database is readable and at Alembic head. Main event registration and club membership approval/decline flows have test coverage.

There are two high-priority workflow gaps: student registrations do not notify administrators, and there is no student account rejection endpoint or stored rejection reason. The registration route also accepts malformed non-string values as valid identity fields. A mark-all-notifications-read API is absent. SQLite foreign-key enforcement is disabled on the inspected application connection.

The reported tests are not a complete browser or production audit. No CampusFlow browser window was available for the requested responsive checks, and no MySQL or hosted configuration was tested. Payments were not treated as a missing feature.

## 2. Test Counts and Evidence

| Check set | Total | Passed | Failed | Blocked | Not tested |
|---|---:|---:|---:|---:|---:|
| Existing pytest suite | 25 | 25 | 0 | 0 | 0 |
| Focused QA probes | 10 | 6 | 4 | 0 | 0 |
| Requested viewport checks | 5 | 0 | 0 | 5 | 0 |
| Other requested areas, grouped in Section 13 | 5 | 0 | 0 | 0 | 5 |
| **Counted total** | **45** | **31** | **4** | **5** | **5** |

The five “Not tested” entries are grouped categories, not individual API assertions. Findings from code inspection are not counted as executed test cases.

**Automated-suite evidence:**

```text
.venv-demo\bin\python.exe -m pytest -q
25 passed in 15.89s
```

The pytest fixtures create an in-memory SQLite database. The suite did not write its test records to `instance/campusflow.db`.

**Additional executed checks:**

- A registration request with `fullName: null` and `studentId: "@@@"` returned `202`; the in-memory database stored `full_name='None'` and `campus_id='@@@'`. **Failed.**
- Repeating a campus ID returned `409 account_exists`. **Passed.**
- Short name/ID/password input returned `422 validation_error`. **Passed.**
- Registering a student with an admin present produced zero admin notifications. **Failed.**
- Route inventory contains no mark-all-read endpoint. **Failed.**
- Student account rejection route/status/reason are absent. **Failed by route/model inspection.**
- SQLite `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no existing violations; Alembic is at `41b7c6d2a903 (head)`. **Passed.**
- 11 HTML pages and 64 local JS/CSS references were checked; no referenced asset was missing. **Passed.**
- `node --check` passed for all 12 frontend JavaScript files; Python `compileall` passed for backend, tests, and migrations. **Passed.**

## 3. Critical Bugs

**None found in the tested local configuration.** Authentication bypass or existing-record corruption was not observed. This is not a penetration test or a production security certification.

## 4. High-Priority Bugs

### HIGH — New student registrations do not notify administrators

- **Test ID:** QA-NOTIF-ADMIN-01
- **Evidence:** A registration request returned `202`; querying the isolated admin’s notification records afterward returned `0`.
- **Steps:** Register a new student; inspect `/api/notifications` as an administrator. No “pending student” notification is created.
- **Expected:** The appropriate administrator receives a persistent approval notification.
- **Actual:** The student row is created as unverified, but the registration route does not create an admin notification.
- **Relevant code:** `backend/campusflow/routes.py`, `register()` (`POST /api/auth/register`, around line 87).
- **Impact:** Admin approval requires polling the Students page. End-to-end workflow A does not meet its notification requirement; workflow B also cannot start as specified.

### HIGH — Student account rejection and rejection reasons are unavailable

- **Test ID:** QA-ACCOUNT-REJECT-01
- **Evidence:** Route inventory contains approval (`POST /api/admin/users/<id>/verify`) but no rejection endpoint. `User` has `verified` and `is_active`, but no student verification status or account decline reason field.
- **Expected:** Admin can decline a student application, persist a reason, and show it to the student.
- **Actual:** Admin can approve but cannot reject through the current API. A declined student cannot receive or see a rejection reason because neither the route nor model supports that workflow.
- **Relevant code:** `backend/campusflow/routes.py`, `verify_student()`; `backend/campusflow/models.py`, `User`.
- **Impact:** Workflow B is unavailable; account-rejection tests are blocked by missing functionality.

## 5. Medium-Priority Bugs

### MEDIUM — Registration accepts malformed identity values

- **Test ID:** QA-REG-01
- **Reproduction:** Send `POST /api/auth/register` with JSON `{"fullName":null,"studentId":"@@@","password":"ValidPassword123!"}` and a valid CSRF token.
- **Expected:** Reject non-string values and campus IDs that do not match the institution’s accepted format.
- **Actual:** Returns `202`; `str(None)` becomes the stored name `"None"`, and `"@@@"` passes the current length-only campus-ID check.
- **Relevant code:** `backend/campusflow/routes.py`, `register()` (around lines 87–100).
- **Data impact:** Reproduced only in the in-memory QA database. No malformed account was added to the project database by this audit.

### MEDIUM — No mark-all-notifications-read operation

- **Test ID:** QA-NOTIF-ALL-01
- **Evidence:** The route map has only `POST /api/notifications/<id>/read`; there is no read-all endpoint or corresponding frontend action.
- **Expected:** Students and administrators can mark all notifications as read.
- **Actual:** Only individual read state is supported.
- **Relevant code:** `backend/campusflow/routes.py`, `mark_notification_read()`; `frontend/js/notifications.js`; `frontend/js/admin.js`.

### MEDIUM — SQLite foreign-key enforcement is disabled

- **Evidence:** On the configured application engine, `PRAGMA foreign_keys` returned `0`. Existing `PRAGMA foreign_key_check` returned no orphan rows, but that check does not enable enforcement for future writes.
- **Expected:** SQLite should enforce declared references and cascade behavior for database operations.
- **Actual:** The current connection will not enforce those constraints. Application routes manually prevent some destructive operations, but the database itself will not reject orphan-producing writes.
- **Relevant code:** `backend/campusflow/__init__.py` SQLite engine setup; foreign keys in `backend/campusflow/models.py`.
- **Impact:** Data integrity risk for direct SQL writes or future routes that rely on database constraints.

### MEDIUM — Admin roles are not separated by operation

- **Evidence:** Many event, club, student, membership, and announcement routes use `@require_user("events_admin", "clubs_admin")`. Both admin roles receive access to those operations in the backend and dashboard.
- **Expected:** Depends on the intended permission matrix. Existing docs describe some operations as belonging to one administrator type.
- **Actual:** Both roles broadly manage events, clubs, student accounts, and memberships. Students are denied these operations by the role decorator (verified by tests).
- **Relevant code:** `backend/campusflow/routes.py`, admin route decorators; `frontend/js/admin.js`, role navigation.
- **Impact:** If separate event/club privileges are required, least-privilege boundaries are not enforced. This may be intentional for the demo; confirm before treating it as an access-control defect.

### MEDIUM — Some notifications share the primary-action transaction

- **Evidence:** Event creation/publication, event registration/cancellation, student approval, and announcement creation add notification rows before committing the primary action.
- **Expected:** A notification persistence failure should not undo a successful primary action.
- **Actual:** A database failure while inserting one of those notifications can roll back the associated event, registration, cancellation, approval, or announcement transaction.
- **Relevant code:** `backend/campusflow/routes.py`, `create_event()`, `update_event()`, `register_event()`, `cancel_registration()`, `verify_student()`, and `create_announcement()`.
- **Coverage:** Failure injection was not performed; this is based on transaction inspection. Membership decline/removal notifications do use a post-commit helper.

### MEDIUM — Admin approval can generate duplicate student notifications

- **Evidence:** `verify_student()` sets `verified=True` and inserts an “Account verified” notification on every call; it does not reject or make a repeated approval idempotent.
- **Impact:** Repeated API calls or concurrent approval clicks can create duplicate notifications.
- **Relevant code:** `backend/campusflow/routes.py`, `verify_student()`.
- **Coverage:** Verified by code inspection; repeated approval was not executed as a separate test.

## 6. Low-Priority and Documentation Findings

- `docs/API.md` and `docs/DATABASE.md` are stale. They omit current profile/password, notification, student-management, membership-decline, membership-removal, and notification idempotency fields/endpoints. Some access descriptions do not match route decorators.
- Notification links are available for some membership notices, but event-registration and announcement notifications do not set a target URL. They cannot navigate to a relevant event or announcement from the student notification list.
- The student notification summary interpolates `unreadCount` without a fallback (`frontend/js/notifications.js`). The current API always includes the field, so this was not reproduced with the current response; a missing field would display `undefined unread`.
- `GET /admin.html` serves a static shell to an unauthenticated client (the existing test confirms HTTP 200). The admin JavaScript checks `/api/auth/me` and redirects, and admin data APIs require an admin role. No protected data was seen in the static shell. Server-side page-level authentication is not implemented.

## 7. Backend and API Findings

- The Flask application exposes 40+ API routes. Route inventory and decorators were inspected; the pytest suite exercises authentication, student/admin APIs, events, clubs, memberships, announcements, and notifications, but does not exhaustively validate every payload/error branch.
- API errors generally use JSON `{error: {code, message}}`. Global CSRF handling was exercised: missing and stale CSRF tokens return JSON `csrf_failed` errors.
- Event listing and detail routes filter to published events. Event creation/editing validates required title, location, date, category, and capacity. Tests verify unpublished visibility, publication, duplicate event registration, and capacity rejection.
- Event registration uses a unique `(event_id, user_id)` constraint and `with_for_update()`. SQLite does not provide the same row-locking behavior as MySQL, and simultaneous registration/load tests were not run.
- Club membership requests and decisions are covered by tests for duplicate pending requests, approval, first/second decline, retry protection, per-club blocking, admin notifications, privacy, and member removal.
- Admin student search is implemented as prefix search over name/campus ID. Tests verify the search endpoint returns results.
- There is no mark-all-read route, account rejection route, or email password-recovery flow in the route inventory.

## 8. Frontend and Backend Integration

Code inspection shows these pages call real API endpoints rather than shipping event/club demo arrays:

- Login/register: `frontend/js/login.js` → `/api/auth/*`.
- Student dashboard: `frontend/js/dashboard.js` → events, registrations, profile/session, announcements, memberships, notifications.
- Events/details/registrations: `events.js`, `event-details.js`, `registrations.js` → `/api/events*`, `/api/registrations*`.
- Clubs/My Clubs: `clubs.js`, `my-clubs.js` → `/api/clubs*`, `/api/memberships`.
- Notifications/profile: `notifications.js`, `profile.js` → `/api/notifications*`, `/api/auth/profile`, `/api/auth/password`.
- Admin: `admin.js` → `/api/admin/*`, event, club, membership, announcement, and notification endpoints.

The 11 HTML pages reference 64 local JS/CSS assets; all referenced assets exist. This is a static integration check, not proof that every workflow works in a real browser.

## 9. Database Findings

- **Configured database:** SQLite, resolved by Flask to `instance/campusflow.db`.
- **Alembic revision:** `41b7c6d2a903 (head)`.
- **Integrity:** `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no existing violations.
- **Tables:** `user`, `event`, `event_registration`, `club`, `club_membership`, `announcement`, `notification`, `payment`, and `alembic_version`.
- **Read-only snapshot counts:** 3 users, 2 events, 2 event registrations, 1 club, 0 club memberships, 1 announcement, and 9 notifications. Counts can change with user activity; no test data was added by this audit.
- **Constraints:** Unique campus IDs, unique event/user registrations, unique club/user memberships, and a unique nullable notification idempotency key are present.
- **Known issue:** SQLite foreign-key enforcement is off for the inspected engine connection (`PRAGMA foreign_keys=0`). No MySQL connection or MySQL migration was tested; the application was configured for SQLite.

## 10. Security Findings

- Passwords are hashed via Werkzeug; user serialization does not include password hashes. Existing tests cover password change and admin reset without returning hashes.
- Login, logout, session persistence, deactivated/unverified student restrictions, CSRF rejection, student data isolation, and student-to-admin API denial have test coverage.
- Admin data APIs use role decorators. Club membership and notification reads filter to the current user; notification ownership is enforced on individual mark-read.
- ORM filters are used for user/event/club queries; SQL injection resistance is supported by code inspection. A dedicated injection payload test was not run.
- `SESSION_COOKIE_HTTPONLY=True` and `SameSite=Lax`. `SESSION_COOKIE_SECURE` defaults to true unless environment configuration overrides it; `.env.example` sets it false for local HTTP. Production deployment must use HTTPS and a secure cookie setting.
- `.env` and `instance/` are ignored by Git. The secret values themselves were not read or included in this report; no full Git-history secret scan was performed.
- Static `/admin.html` availability is not equivalent to API authorization bypass: admin APIs are protected. A browser-level unauthenticated redirect test was not performed.

## 11. End-to-End Workflow Results

| Workflow | Result | Evidence / limitation |
|---|---|---|
| A. Student registers → admin notified → approved → student notified → logs in | **FAIL** | Registration, approval, student approval notice, and login are covered by tests; isolated registration probe found no admin notification. |
| B. Student registers → admin notified → declined with reason | **FAIL / unavailable** | No account-rejection route, student rejection status, or rejection-reason field exists. |
| C. Student requests club → admin notified → approved → student sees member status | **PASS** | Existing workflow and membership tests verify these API/database steps. |
| D. Student requests club → admin declines → student sees reason notification | **PASS** | Decline tests verify reason, persistent notification, retry count, and block after second decline. |
| E. Admin publishes event → student sees/registers → admin checks registration | **PARTIALLY VERIFIED** | Creation/publication, student visibility, registration/capacity, and admin attendee API are covered across tests; not exercised together in a browser. |
| F. Admin publishes announcement → student sees it and receives notification | **PASS at API level** | Club announcement test verifies approved recipients receive notifications; no browser click-through test. |
| G. Student reads one notification → count updates → refresh persists | **PASS for individual read** | Tests verify individual read and unread count after reload. Mark-all is missing. |
| H. Student attempts admin operation | **PASS for API authorization** | Student receives `403` on protected admin actions. Static admin HTML itself returns `200` and redirects client-side. |

## 12. UI and Responsiveness

- Static asset resolution passed: 11 HTML pages and 64 local JS/CSS references, zero missing files.
- JavaScript syntax passed for all 12 frontend scripts. Python compilation passed for backend, tests, and migrations.
- Responsive CSS breakpoints are present, but the exact required viewports **360×640, 390×844, 768×1024, 1366×768, and 1920×1080 were blocked**. The available Chrome windows were not on CampusFlow, and Playwright/Selenium were not installed. No claim is made about overflow, modal fit, visual contrast, or browser console errors at those sizes.
- Mobile menu, tables, forms, and notification links were inspected in code only; not manually exercised in a browser during this audit.

## 13. Not Tested / Blocked

- Visual/browser testing at all five requested viewport sizes, including overflow and console errors: **blocked**.
- Full end-to-end registration/approval/rejection in a browser: rejection flow does not exist; no isolated browser session was available.
- Production MySQL connection, migration, backup/restore, hosting configuration, and multiple workers: **not tested**; current configuration is local SQLite.
- Concurrent event registrations and simultaneous membership decisions: **not tested**. SQLite locking behavior differs from a database with row-level locking.
- Notification database-failure injection, database disconnect recovery, load/performance testing, and app restart recovery: **not tested**.
- Every API endpoint’s invalid-body, missing-ID, and unexpected database-error branch: **not exhaustively tested**; existing suite covers representative cases only.
- Service worker/browser cache behavior and full live browser workflow: **not tested**.

The five counted “Not tested” groups are: (1) production MySQL/hosting/backup configuration, (2) concurrent registration/membership and load behavior, (3) database failure injection/disconnect/restart recovery, (4) exhaustive invalid-body/resource-ID/error-path coverage for all APIs, and (5) live browser console and full browser workflow checks. The five viewport checks are counted separately as blocked.

## 14. Recommended Fixes in Priority Order

1. Add strict type and institution-format validation for registration fields; reject nulls and non-string identity fields before coercion.
2. Add the student rejection workflow and reason persistence, then notify the student and show the reason during login.
3. Notify the responsible administrator after a new student registration; keep notification persistence independent of the account-creation transaction.
4. Add a server-authorized mark-all-read operation and admin/student UI action.
5. Enable SQLite foreign keys on every connection, then re-run integrity and migration checks.
6. Confirm the intended admin role matrix and enforce only the permissions approved for each role.
7. Make student approval and notification generation idempotent; separate notifications from primary action commits where required.
8. Add event/announcement notification navigation targets and update `docs/API.md` and `docs/DATABASE.md` to match the actual schema/routes.
9. Run the blocked browser, viewport, concurrency, and target-host tests before claiming production readiness.

## 15. Final Readiness Assessment

**Local demonstration:** Reasonable for tested student login, event registration, club membership approval/decline, announcements, and individual notifications. Keep the demonstration on the inspected SQLite database and avoid relying on student-account rejection or mark-all notifications.

**Final submission/hosted readiness:** **Not yet demonstrated.** The missing account-rejection workflow, missing admin registration notifications, weak registration identity validation, SQLite foreign-key setting, untested responsive layouts, and untested hosted database/concurrency behavior should be resolved or explicitly accepted before claiming complete readiness.

### Commands used

```powershell
.\.venv-demo\bin\python.exe -m pytest -q
.\.venv-demo\bin\python.exe -m flask --app backend.app db current
node --check <each file in frontend/js>
.\.venv-demo\bin\python.exe -m compileall -q backend tests migrations
```

For a local run after the audit:

```powershell
.\.venv-demo\bin\python.exe -m flask --app backend.app run --host 127.0.0.1 --port 5000
```
