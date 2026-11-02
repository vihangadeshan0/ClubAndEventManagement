# 🎟️ Event Management System

A Python-based software engineering project designed to simplify the management of campus events. The system aims to provide a centralized platform where students can discover events and register for them, while event organizers can create, manage, and monitor registrations.

## 📌 Project Overview

Managing campus events manually can be time-consuming and make it difficult to track registrations, monitor participant capacity, and communicate event information.

The **Event Management System** aims to address these challenges by providing a simple, user-friendly web application for organizing and participating in campus events.

This project is developed as part of an academic Software Engineering (SE) project, following a structured software development process.

## 🎯 Objectives

- Provide a centralized platform for campus events.
- Allow students to browse and register for events.
- Enable organizers to create, update, and cancel events.
- Track registrations and event capacity.
- Prevent duplicate registrations and registrations for full events.
- Apply software engineering principles throughout development.

## ✨ Planned Features

- **User Authentication** — Secure login and account access.
- **Event Discovery** — Browse available campus events and view event details.
- **Event Management** — Allow authorized organizers to create, edit, and cancel events.
- **Event Registration** — Allow students to register for and cancel their registrations.
- **Capacity Management** — Track available seats and prevent overbooking.
- **Registration Validation** — Prevent duplicate registrations.
- **Organizer Dashboard** — View event information and participant registrations.

*Note: These are proposed features. Their implementation status will be updated as development progresses.*

## 🛠️ Proposed Technology Stack

| Technology | Purpose |
|---|---|
| Python | Backend development |
| Flask | Web application framework |
| HTML5 | Page structure |
| CSS3 | Styling and responsive design |
| JavaScript | Client-side interactivity |
| SQLite | Database |
| Flask-SQLAlchemy | Database integration |
| Git & GitHub | Version control and collaboration |

The technology stack may be refined during requirements analysis and system design.

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
| Moshi | Stakeholder |

## 📂 Project Structure

The repository structure will evolve as the system is designed and implemented.

```text
Event-Management-System/
├── docs/              # Project documentation
├── src/               # Application source code
├── tests/             # Test cases
├── screenshots/       # Application screenshots
├── README.md          # Project overview
└── requirements.txt   # Python dependencies
```

## 🚀 Getting Started

### Prerequisites

- Python 3.10 or later
- pip
- Git

### Installation

1. Clone the repository:

   ```bash
   git clone <YOUR_REPOSITORY_URL>
   ```

2. Navigate to the project directory:

   ```bash
   cd Event-Management-System
   ```

3. Create a virtual environment:

   ```bash
   python -m venv venv
   ```

4. Activate the virtual environment.

   **Windows:**

   ```bash
   venv\Scripts\activate
   ```

   **Linux/macOS:**

   ```bash
   source venv/bin/activate
   ```

5. Install dependencies after the project requirements have been configured:

   ```bash
   pip install -r requirements.txt
   ```

6. Run the application using the instructions provided once the application entry point has been established.

> Setup instructions will be finalized when the initial application implementation is available.

## 🧪 Testing

Testing will be conducted to verify that the system meets its functional and non-functional requirements.

Planned test areas include:

- User authentication and authorization
- Event creation, editing, and cancellation
- Event registration and cancellation
- Duplicate registration prevention
- Event capacity validation
- Input validation and error handling
- Usability and responsive design

## 📋 Software Engineering Deliverables

The project may include the following deliverables as development progresses:

- Project proposal
- Requirements specification
- Use case diagrams
- System analysis and design diagrams
- Database design
- Implementation
- Test plan and test cases
- Final project documentation

## 🔮 Future Enhancements

Potential future improvements include:

- Event search and filtering
- Event categories
- Email notifications
- Attendance tracking
- QR-code-based event check-in
- Event analytics and reporting

These enhancements are not part of the initial implementation scope unless approved by the team.

## 🤝 Collaboration

This project is developed collaboratively using Git and GitHub. Team members contribute according to their assigned responsibilities, with changes tracked through version control.

## 📄 License

This project is developed for educational purposes as part of an academic Software Engineering project. A formal license can be added if required.

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
