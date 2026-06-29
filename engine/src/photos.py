"""Resolve a head-and-shoulders photo for every real squad player.

Each player on the Wikipedia squad pages links to their own article, and the
MediaWiki ``pageimages`` API hands back that article's lead image as a Wikimedia
Commons thumbnail. Because we look the player up by the exact article their squad
entry links to, there is no name-disambiguation guesswork: the photo always
belongs to the right footballer.

The resolved title -> URL map is written to ``data/static/player_photos.json`` and
committed, so the model build stays reproducible and never touches the network.
The images themselves stay on the Wikimedia CDN and load lazily in the browser,
with a clean fallback avatar for the minority of players who have no free photo.

Run it when the squads change::

    python -m src.photos          # fill in players missing from the cache
    python -m src.photos --all     # re-resolve every player from scratch

Photos are Creative Commons or public domain via Wikimedia Commons; the app
credits Wikimedia Commons for player imagery.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from src.config import STATIC_DIR
from src.real_squads import PHOTOS_FILE, parse_squads

API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "WeltmeisterDev/1.0 (World Cup 2026 portfolio project)"
THUMB_PX = 256
BATCH = 50  # MediaWiki accepts up to 50 titles per query


def _titles_from_squads() -> list[str]:
    """Every distinct Wikipedia article title across all 48 squads."""
    seen: dict[str, None] = {}
    for players in parse_squads().values():
        for p in players:
            title = p.get("wiki")
            if title:
                seen.setdefault(title, None)
    return list(seen)


def _get_json(url: str, attempts: int = 6) -> dict:
    """GET with polite backoff. Wikimedia returns 429 if we ask too fast, so we
    wait and retry rather than dropping the batch."""
    delay = 2.0
    for attempt in range(attempts):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < attempts - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise RuntimeError("unreachable")


def _fetch_batch(titles: list[str]) -> dict[str, str]:
    """Map each requested title to its lead-image thumbnail URL (missing titles
    are simply absent from the result)."""
    params = {
        "action": "query",
        "format": "json",
        "prop": "pageimages",
        "piprop": "thumbnail",
        "pithumbsize": str(THUMB_PX),
        "redirects": "1",
        "maxlag": "5",
        "titles": "|".join(titles),
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    data = _get_json(url)

    query = data.get("query", {})
    # follow the title rewrites MediaWiki applies, so we can map the URL back to
    # the title the squad page actually used
    rewrite: dict[str, str] = {}
    for entry in query.get("normalized", []):
        rewrite[entry["from"]] = entry["to"]
    for entry in query.get("redirects", []):
        rewrite[entry["from"]] = entry["to"]

    thumb_by_title = {
        page["title"]: page["thumbnail"]["source"]
        for page in query.get("pages", {}).values()
        if "thumbnail" in page
    }

    out: dict[str, str] = {}
    for requested in titles:
        resolved = rewrite.get(requested, requested)
        resolved = rewrite.get(resolved, resolved)  # normalize, then redirect
        url = thumb_by_title.get(resolved)
        if url:
            out[requested] = url
    return out


def resolve(refresh_all: bool = False) -> dict[str, str]:
    cache: dict[str, str] = {}
    if PHOTOS_FILE.exists() and not refresh_all:
        cache = json.loads(PHOTOS_FILE.read_text(encoding="utf-8"))

    titles = _titles_from_squads()
    todo = titles if refresh_all else [t for t in titles if t not in cache]
    print(f"{len(titles)} players linked, {len(todo)} to resolve")

    for i in range(0, len(todo), BATCH):
        batch = todo[i : i + BATCH]
        try:
            found = _fetch_batch(batch)
        except Exception as exc:  # network hiccup: keep what we have, report it
            print(f"  batch {i // BATCH + 1} failed: {exc}")
            continue
        cache.update(found)
        print(f"  batch {i // BATCH + 1}: +{len(found)} photos")
        time.sleep(1.0)

    # keep only titles still present in the squads, sorted for a stable diff
    keep = set(titles)
    cache = {k: cache[k] for k in sorted(cache) if k in keep}
    return cache


def main() -> int:
    refresh_all = "--all" in sys.argv
    cache = resolve(refresh_all=refresh_all)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    PHOTOS_FILE.write_text(json.dumps(cache, indent=2, ensure_ascii=True), encoding="utf-8")
    total = len(_titles_from_squads())
    print(f"wrote {PHOTOS_FILE}: {len(cache)}/{total} players have a photo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
