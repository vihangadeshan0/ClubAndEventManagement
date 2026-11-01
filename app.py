"""Convenience entry point: run with `python app.py` from the repository root."""
import os

from backend.app import app


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
