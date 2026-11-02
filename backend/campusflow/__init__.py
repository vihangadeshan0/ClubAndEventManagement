import os
from pathlib import Path

import click
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_migrate import Migrate
from flask_wtf.csrf import CSRFError, CSRFProtect

from .extensions import db
from .models import User
from .routes import api

csrf = CSRFProtect()
migrate = Migrate()


def create_app(test_config=None):
    # Find the repository-root .env even when launched from backend/.
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    if not test_config and not os.getenv("SECRET_KEY"):
        raise RuntimeError("Set SECRET_KEY in the environment before starting CampusFlow.")
    app = Flask(__name__, static_folder="../../frontend", static_url_path="")
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY", "test-only-key"),
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///campusflow.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true",
        MAX_CONTENT_LENGTH=1024 * 1024,
        SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True},
        WTF_CSRF_CHECK_DEFAULT=True,
        WTF_CSRF_TIME_LIMIT=None,
    )
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    csrf.init_app(app)
    migrate.init_app(app, db)
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/")
    def home():
        from flask import redirect
        return redirect("/login.html")

    @app.errorhandler(CSRFError)
    def csrf_error(error):
        reason = error.description
        if "token is missing" in reason.lower():
            category = "missing_token"
        elif "match" in reason.lower():
            category = "token_mismatch"
        elif "expired" in reason.lower():
            category = "expired_token"
        else:
            category = "invalid_token"
        app.logger.warning("CSRF validation failed: category=%s", category)
        return jsonify(error={"code": "csrf_failed", "message": "Refresh the page and try again."}), 400

    @app.errorhandler(Exception)
    def unexpected_error(error):
        from werkzeug.exceptions import HTTPException
        if isinstance(error, HTTPException):
            return error
        app.logger.exception("Unhandled application error")
        if request.path.startswith("/api/"):
            db.session.rollback()
            return jsonify(error={"code": "internal_error", "message": "The server could not complete the request."}), 500
        return "Internal Server Error", 500

    @app.cli.command("create-admin")
    @click.option("--campus-id", prompt=True)
    @click.option("--name", prompt="Full name")
    @click.option("--role", type=click.Choice(["events_admin", "clubs_admin"]), default="events_admin", prompt=True)
    @click.password_option()
    def create_admin(campus_id, name, role, password):
        """Create an administrator through a prompted command."""
        if User.query.filter_by(campus_id=campus_id.strip()).first():
            raise click.ClickException("That campus ID already exists.")
        user = User(full_name=name.strip(), campus_id=campus_id.strip(), role=role, verified=True,
                    verification_status="approved")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        click.echo(f"{role.replace('_', ' ').title()} created.")

    return app
