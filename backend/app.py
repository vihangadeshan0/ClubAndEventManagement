from pathlib import Path
import os
import sys

# Support both `python backend/app.py` from the repository root and
# `python app.py` while the working directory is backend/.
project_root = str(Path(__file__).resolve().parent.parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.campusflow import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
