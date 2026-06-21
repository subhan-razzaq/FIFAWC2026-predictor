"""Filesystem paths and shared constants for the engine.

Everything is anchored off the engine package directory so scripts can be run
from anywhere. Raw pulls live under ``data/raw`` (gitignored) and never ship.
"""

from __future__ import annotations

from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = ENGINE_DIR.parent

DATA_DIR = ENGINE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
# Committed, hand-curated 2026 inputs (frozen snapshot).
STATIC_DIR = DATA_DIR / "static"
REPORTS_DIR = ENGINE_DIR / "reports"

# The browser consumes this artifact. It is committed as a data file.
WEB_DATA_DIR = REPO_DIR / "web" / "public" / "data"
MODEL_JSON = WEB_DATA_DIR / "model.json"

# The three host nations get a home-advantage term. Everyone else is neutral.
HOSTS = ("Mexico", "Canada", "United States")

# Tournament shape, fixed by the 2026 format.
N_TEAMS = 48
N_GROUPS = 12
GROUP_SIZE = 4

# Snapshot date for the frozen squads and ratings. Surfaced in model.json.
SNAPSHOT_DATE = "2026-06-01"


def ensure_dirs() -> None:
    """Create the local data and report directories if they do not exist."""
    for d in (RAW_DIR, PROCESSED_DIR, STATIC_DIR, REPORTS_DIR, WEB_DATA_DIR):
        d.mkdir(parents=True, exist_ok=True)
