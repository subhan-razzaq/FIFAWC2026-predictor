"""Data ingestion.

Pulls the real, freely accessible sources, caches every raw pull to
``data/raw`` (gitignored), and exposes clean loaders. The backbone is the
martj42 international-results dataset, which is the public GitHub mirror of the
Kaggle "International football results from 1872 to present" set and needs no
authentication.

Optional richer sources (FBref and Understat via ``soccerdata``, StatsBomb open
data) are wired as opt-in steps. If a source is unreachable or rate-limited the
pipeline still runs end to end on the cached backbone plus the committed 2026
snapshot, so the build is deterministic and offline-capable. Nothing here is ever
called at page load. The browser only ever reads the exported model.json.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import requests

from src.config import RAW_DIR, ensure_dirs

MARTJ42_BASE = "https://raw.githubusercontent.com/martj42/international_results/master"
SOURCES = {
    "results.csv": f"{MARTJ42_BASE}/results.csv",
    "shootouts.csv": f"{MARTJ42_BASE}/shootouts.csv",
    "goalscorers.csv": f"{MARTJ42_BASE}/goalscorers.csv",
}


def _download(url: str, dest: Path, force: bool = False) -> Path:
    """Download ``url`` to ``dest`` unless it is already cached."""
    if dest.exists() and not force:
        return dest
    print(f"  downloading {url}")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    dest.write_bytes(resp.content)
    return dest


def pull_martj42(force: bool = False) -> dict[str, Path]:
    """Download and cache the martj42 results, shootouts, and goalscorers files."""
    ensure_dirs()
    paths: dict[str, Path] = {}
    for name, url in SOURCES.items():
        paths[name] = _download(url, RAW_DIR / name, force=force)
    return paths


# Names that differ between martj42 and our 2026 field. martj42 is the canonical
# spelling we adopt, so this map is intentionally small and only covers historical
# aliases that appear in the results file.
_NAME_FIXES = {
    "Czechia": "Czech Republic",
    "Turkiye": "Turkey",
    "Cabo Verde": "Cape Verde",
    "Korea Republic": "South Korea",
    "IR Iran": "Iran",
    "Curaçao": "Curacao",  # martj42 uses the cedilla spelling; we keep ASCII
}


def load_results(force: bool = False) -> pd.DataFrame:
    """Return cleaned international results.

    Columns: date (datetime), home_team, away_team, home_score, away_score,
    tournament, neutral (bool). Friendlies are kept but later down-weighted by the
    competition weighting in the ratings fit. Matches with missing scores are
    dropped.
    """
    paths = pull_martj42(force=force)
    df = pd.read_csv(paths["results.csv"], parse_dates=["date"])
    df = df.dropna(subset=["home_score", "away_score"]).copy()
    df["home_score"] = df["home_score"].astype(int)
    df["away_score"] = df["away_score"].astype(int)
    for col in ("home_team", "away_team"):
        df[col] = df[col].replace(_NAME_FIXES)
    df["neutral"] = df["neutral"].astype(bool)
    df = df.sort_values("date").reset_index(drop=True)
    return df


def load_goalscorers(force: bool = False) -> pd.DataFrame:
    """Return cleaned international goalscorer events (used for scorer-model sanity
    checks, not for fitting the club-based scoring rates)."""
    paths = pull_martj42(force=force)
    df = pd.read_csv(paths["goalscorers.csv"], parse_dates=["date"])
    for col in ("home_team", "away_team", "team"):
        if col in df.columns:
            df[col] = df[col].replace(_NAME_FIXES)
    return df


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    force = "--force" in argv
    print("ingesting martj42 international results")
    df = load_results(force=force)
    print(f"  results: {len(df):,} matches from {df['date'].min().date()} to {df['date'].max().date()}")
    gs = load_goalscorers(force=force)
    print(f"  goalscorers: {len(gs):,} events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
