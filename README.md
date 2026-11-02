# 🎓 CampusFlow – Campus Event & Club Management System

**CampusFlow** is a web-based campus management platform developed to simplify event organization, student registrations, club management, and campus communication.

The system provides a centralized platform where students can discover campus events, register for activities, explore clubs, and receive important announcements and notifications. Administrators can manage events, oversee student accounts, review club membership requests, and coordinate campus activities through dedicated management interfaces.

Developed as part of an academic Software Engineering project, CampusFlow applies software engineering principles to deliver a structured, maintainable, and user-friendly application.

---

## 🎯 Project Objectives

- Centralize campus event and club information.
- Simplify event discovery and student registration.
- Provide administrators with tools to manage campus activities.
- Maintain accurate event registration and capacity records.
- Improve communication through announcements and notifications.
- Introduce account verification and role-based access control.
- Reduce reliance on manual registration and communication processes.

## ✨ Key Features

### 👨‍🎓 Student Features

- **User Authentication:** Register and securely log in using campus credentials.
- **Account Verification:** New student accounts require administrator approval.
- **Event Discovery:** Browse published campus events and view event details.
- **Event Registration:** Register for available events and manage personal registrations.
- **Club Discovery:** Explore available campus clubs.
- **Club Membership:** Submit membership requests and track their status.
- **Announcements:** View campus-wide and relevant club announcements.
- **Notifications:** Receive updates about important account and campus activities.

### 🛠️ Administrator Features

- **Dashboard:** Access administrative information and management functions.
- **Student Management:** Review, approve, and decline student account verification requests.
- **Event Management:** Create, update, publish, unpublish, and manage campus events.
- **Registration Management:** View event registrations and monitor participant capacity.
- **Club Management:** Create and update campus clubs.
- **Membership Management:** Review and approve or reject club membership requests.
- **Announcements:** Publish campus-wide and club-specific announcements.
- **Notifications:** Receive administrative updates and manage notifications.

### 🔐 Security and Data Integrity

- Password hashing for account security.
- Session-based authentication.
- Role-based authorization.
- CSRF protection for state-changing requests.
- Database constraints to prevent duplicate registrations.
- Transaction-based operations for registration consistency.
- User-specific access to personal registrations and notifications.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| Python | Backend programming |
| Flask | Backend web framework |
| HTML5 | Frontend structure |
| CSS3 | Styling and responsive layouts |
| JavaScript | Frontend interactivity |
| Flask-SQLAlchemy | ORM and database integration |
| SQLite | Local development database |
| Alembic / Flask-Migrate | Database schema migrations |
| Git & GitHub | Version control and collaboration |

The database and deployment configuration may vary depending on the target hosting environment.

## 🏗️ System Architecture

CampusFlow follows a client-server architecture.

- **Frontend:** Provides interfaces for students and administrators.
- **Backend:** Handles authentication, business logic, authorization, and API requests.
- **Database:** Stores user accounts, events, registrations, clubs, memberships, announcements, and notifications.

The frontend communicates with the Flask backend through REST-style JSON API endpoints.

## 👥 Project Team

| Team Member | Role |
|---|---|
| Abhishek | Project Manager (PM) |
| Hilal | Business Analyst (BA) |
| Awushaf | System Analyst (SA) |
| Himath | Developer |
| Shamika | Developer |
| Vihanga | Developer |
| Dileepa | Quality Assurance (QA) |
| Malith | DevOps |
| Dilshan | Stakeholder |
| Dilmith | Stakeholder |
| Yoosuf | System Architecture |
| Moshi | Stakeholder |

## 📂 Project Structure

The repository is organized into backend, frontend, database migration, testing, and documentation components.

```text
ClubAndEventManagement/
│
├── backend/
│   └── campusflow/
│       ├── models.py
│       ├── routes.py
│       └── ...
│
├── migrations/
│   └── versions/
│
├── instance/
│
├── tests/
│
├── app.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

*Note: This is an illustrative overview. Additional files and directories may exist in the repository.*

## 🚀 Getting Started

### Prerequisites

- Python 3.10 or later
- pip
- Git

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
```

### 2. Navigate to the project directory

```bash
cd ClubAndEventManagement
```

### 3. Create a virtual environment

```bash
python -m venv .venv
```

### 4. Activate the virtual environment

**Windows PowerShell:**

```powershell
.\.venv\Scripts\Activate.ps1
```

**Linux / macOS:**

```bash
source .venv/bin/activate
```

### 5. Install dependencies

```bash
python -m pip install -r requirements.txt
```

### 6. Configure environment variables

Create a local `.env` file using `.env.example` as a reference.

Configure the required application settings before starting the application.

**Important:** Never commit actual environment secrets or credentials to GitHub.

### 7. Apply database migrations

```bash
flask db upgrade
```

### 8. Start the application

```bash
python app.py
```

The application should now be accessible through the local development address configured by the application.

## 🧪 Testing

Automated and manual testing are used to verify system functionality and reliability.

Testing covers areas such as:

- User registration and authentication.
- Student account verification.
- Role-based access control.
- Event creation and management.
- Event registration and cancellation.
- Duplicate registration prevention.
- Event capacity validation.
- Club membership requests and approvals.
- Announcement and notification functionality.
- API validation and error handling.

Run the project's automated test suite using the test configuration provided in the repository.

## 📋 Software Engineering Deliverables

The project follows a structured Software Engineering development process.

Relevant deliverables include:

- Project proposal.
- Software Requirements Specification (SRS).
- Use case diagrams.
- System architecture and design documentation.
- Database design and ER diagrams.
- API documentation.
- Implementation and source code.
- Test plans and test cases.
- Final project documentation.

## 🔮 Future Enhancements

Potential future improvements include:

- Online payment gateway integration.
- QR-code-based event check-in.
- Attendance tracking.
- Email notifications.
- Advanced event analytics and reporting.
- Improved administrative reporting tools.

These enhancements are subject to project scope and future development decisions.

## 🤝 Collaboration

CampusFlow is developed collaboratively using Git and GitHub.

The development process uses version control to manage source code, track changes, coordinate contributions, and maintain project history.

Team members contribute according to their assigned responsibilities.

## 📄 License

This project is developed for educational purposes as part of an academic Software Engineering project.

---

**Developed as an academic Software Engineering project.** 🎓

## CampusFlow backend (Flask + MySQL)

The repository now includes a same-origin Flask API that serves the existing
frontend from `frontend/`. It uses SQLAlchemy, Flask-Migrate, session cookies,
CSRF tokens, and database-backed event, registration, club, membership,
announcement, notification, and payment records. SQLite is the default for
quick local development; MySQL is configured with `DATABASE_URL` for the team
environment. Times are stored in UTC and shown in Asia/Colombo.

### Local setup

1. Install Python 3.10+. SQLite is used for local development, so a separate
   database server or manual database creation is not needed. MySQL 8 is
   supported when you are ready to configure a shared/team database.
2. Create and activate a virtual environment, then run `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and replace the placeholder `SECRET_KEY` with
   a long random value. The example uses SQLite at `instance/campusflow.db`,
   which is created by the migration command below. For MySQL, first create a
   database and restricted account, then set `DATABASE_URL` to
   `mysql+pymysql://user:password@127.0.0.1:3306/campusflow?charset=utf8mb4`.
   Never commit `.env`. Keep `SESSION_COOKIE_SECURE=false` for local HTTP; set
   it to `true` behind HTTPS in production.
4. Apply the committed schema with `flask --app backend.app db upgrade`.
   For future model changes, run `flask --app backend.app db migrate -m
   "describe change"`, review the generated migration, then run `db upgrade`.
5. Start the app with `python app.py` from the repository root, or
   `python app.py` from `backend/`. You can also run
   `flask --app backend.app run --debug`. Visit
   `http://127.0.0.1:5000/login.html`.
6. Create administrator accounts using
   `flask --app backend.app create-admin --role events_admin` or
   `flask --app backend.app create-admin --role clubs_admin`. The CLI prompts
   for the campus ID, name, and password without putting the password in shell
   history.

Student self-registration creates an unverified account. Because a campus ID
alone does not prove identity and no official NIBM identity service is
configured, an administrator must verify the student through an approved
campus process in the **Student approvals** screen before enabling access.
Student login remains blocked until an administrator approves the account.

### Tests

Run `pytest`. Tests use an isolated in-memory SQLite database; they do not touch
the configured development database.

### API summary

See [docs/API.md](docs/API.md) for each endpoint's role, input, success shape,
and expected errors.
The [database design notes](docs/DATABASE.md) cover entities, relationships,
constraints, indexes, timezone handling, and reservation locking.

All state-changing requests require the session CSRF token from `GET
/api/auth/csrf` in the `X-CSRFToken` header. Authentication uses an HttpOnly,
SameSite=Lax session cookie. JSON errors have the shape
`{"error":{"code":"...","message":"..."}}`.

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /api/auth/register` | Public | Create unverified student account |
| `GET /api/admin/users/pending-verification`, `POST /api/admin/users/<id>/verify` | Administrator | Review/verify student accounts after campus identity checks |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Public/session | Session authentication |
| `GET /api/events`, `GET /api/events/<id>` | Public | Published events; supports `q` and `category` |
| `POST /api/events`, `PATCH /api/events/<id>`, `DELETE /api/events/<id>` | Events Administrator | Manage events |
| `GET /api/events/<id>/registrations` | Events Administrator | View attendee names and campus IDs |
| `POST /api/events/<id>/registrations`, `GET /api/registrations`, `DELETE /api/registrations/<id>` | Student | Register, list own registrations, cancel before event start |
| `GET /api/clubs`, `GET /api/clubs/<id>` | Public | Browse clubs |
| `POST /api/clubs/<id>/memberships`, `GET /api/memberships` | Student/session | Request and view own memberships |
| `POST /api/clubs`, `PATCH /api/clubs/<id>`, `GET/PATCH /api/admin/memberships` | Clubs Administrator | Manage clubs and decide requests |
| `GET/POST /api/announcements` | Public / Clubs Administrator | List and publish notices |
| `GET /api/notifications`, `POST /api/notifications/<id>/read` | Session | Read own notifications |

Example event creation (administrator session required):

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

### Security and integration boundaries

Seat checks run inside a transaction and lock the event row on databases that
support row locks; the unique event/user constraint independently prevents
duplicate registrations. Student registration and login are wired to the
existing pages. Payments have a status/reference model only: there is no
provider, checkout endpoint, or client-controlled “paid” state. Club and
notification APIs are available, but the current frontend does not yet have
club-management screens. Student account approval has an administrator screen;
identity verification itself still requires the manual campus check described
above.
**CampusFlow – Connecting Students, Clubs, and Campus Events.** 🎓
