"""Match every real squad player to their EA Sports FC 26 overall rating.

The OVRs the app shows should line up with what a player of football expects, so
we pull the public FC 26 ratings dataset (18k+ players, sourced from the EA ratings
site) and resolve each of our squad players to their rating. Matching is scoped by
nationality first, since within one national team names are essentially unique, then
by name with a few fall-backs for nicknames and full legal names.

The result is a slim, committed map of ``{team: {player: overall}}`` written to
``data/static/ea_fc26_overalls.json``. real_squads.py reads it to set each player's
ability, so the build stays reproducible and never needs the network.

Run it when the squads change or a new ratings dataset drops::

    python -m src.ea_ratings
"""

from __future__ import annotations

import gzip
import json
import re
import unicodedata
import urllib.request

from src.config import STATIC_DIR
from src.real_squads import parse_squads

DATASET = "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.json.gz"
OUT = STATIC_DIR / "ea_fc26_overalls.json"

# our team name -> the nationality label the dataset uses, where they differ
NAT_ALIAS = {
    "South Korea": "Korea Republic",
    "Ivory Coast": "Côte d'Ivoire",
    "Turkey": "Türkiye",
    "DR Congo": "Congo DR",
    "Cape Verde": "Cabo Verde",
    "United States": "United States",
}


def _asc(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()


def _tokens(s: str) -> list[str]:
    # split on anything that is not a letter or digit, so hyphens and dots in names
    # like "Al-Dawsari" or "N'Golo" do not hide a surname behind punctuation
    return [t for t in re.split(r"[^a-z0-9]+", _asc(s)) if t]


def _squish(s: str) -> str:
    return "".join(_tokens(s))


def _fetch_dataset() -> list[dict]:
    req = urllib.request.Request(DATASET, headers={"User-Agent": "WeltmeisterDev/1.0 (portfolio)"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(gzip.decompress(resp.read()))


def _index_by_nationality(players: list[dict]) -> dict[str, list[dict]]:
    by_nat: dict[str, list[dict]] = {}
    for p in players:
        rec = {
            "overall": int(p["overall"]),
            "age": int(p["age"]) if p.get("age") else None,
            "long": _asc(p["long_name"]),
            "short": _asc(p["short_name"]),
            "long_tokens": set(_tokens(p["long_name"])),
            "short_tokens": _tokens(p["short_name"]),
            "squish_long": _squish(p["long_name"]),
            "squish_short": _squish(p["short_name"]),
            "club": _asc(p.get("club_name") or ""),
        }
        by_nat.setdefault(_asc(p["nationality_name"]), []).append(rec)
    return by_nat


def _score(name: str, rec: dict) -> int:
    """How well our player name matches one dataset record (higher is better)."""
    our_tokens = _tokens(name)
    if not our_tokens:
        return 0
    our_squish = "".join(our_tokens)
    if our_squish in (rec["squish_long"], rec["squish_short"]):
        return 100
    # single-token names (Vitinha, Raphinha, Rodri) usually live in short_name
    if len(our_tokens) == 1 and our_tokens[0] in rec["long_tokens"]:
        return 90
    our_last, our_first = our_tokens[-1], our_tokens[0]
    rec_tokens = sorted(rec["long_tokens"])
    rec_last = rec["short_tokens"][-1] if rec["short_tokens"] else (rec["long"].split()[-1] if rec["long"] else "")
    rec_first = rec["long"].split()[0] if rec["long"] else ""
    if our_last == rec_last and our_first[:1] == rec_first[:1]:
        return 85
    # short_name is "F. Lastname": match initial and surname
    if len(rec["short_tokens"]) >= 2 and rec["short_tokens"][-1] == our_last and rec["short_tokens"][0][:1] == our_first[:1]:
        return 80
    overlap = len(set(our_tokens) & rec["long_tokens"])
    if overlap >= 2:
        return 60 + overlap
    if our_last == rec_last and len(our_last) >= 4:
        return 55
    if our_last in rec_tokens and len(our_last) >= 4:
        return 50
    return 0


def _best(name: str, club: str, candidates: list[dict]) -> dict | None:
    best_score = 0
    best: dict | None = None
    for rec in candidates:
        s = _score(name, rec)
        if s == 0:
            continue
        # a matching club breaks ties between same-named players
        if _asc(club) and rec["club"] == _asc(club):
            s += 3
        if s > best_score or (s == best_score and best and rec["overall"] > best["overall"]):
            best_score, best = s, rec
    return best if best and best_score >= 55 else None


def resolve() -> dict[str, dict[str, dict]]:
    players = _fetch_dataset()
    by_nat = _index_by_nationality(players)
    by_long: dict[str, list[dict]] = {}
    for recs in by_nat.values():
        for rec in recs:
            by_long.setdefault(rec["long"], []).append(rec)

    squads = parse_squads()
    out: dict[str, dict[str, dict]] = {}
    hits = total = 0
    thin_teams: list[str] = []
    for team, roster in squads.items():
        nat = _asc(NAT_ALIAS.get(team, team))
        candidates = by_nat.get(nat, [])
        team_map: dict[str, dict] = {}
        for p in roster:
            total += 1
            name, club = p["name"], p.get("club", "")
            rec = _best(name, club, candidates) if candidates else None
            if rec is None:  # fall back to a name-only match across the whole set
                rec = _best(name, club, by_long.get(_asc(name), []))
            if rec is not None:
                entry = {"ovr": rec["overall"]}
                if rec.get("age"):
                    entry["age"] = rec["age"]
                team_map[_asc(name)] = entry
                hits += 1
        out[team] = team_map
        if len(team_map) < len(roster) - 3:
            thin_teams.append(f"{_asc(team)}: {len(team_map)}/{len(roster)} (nat='{nat}'{'' if candidates else ', NO NATIONALITY MATCH'})")

    print(f"matched {hits}/{total} players to EA FC 26 overalls")
    if thin_teams:
        print("  teams with low coverage (likely a nationality-label gap):")
        for t in thin_teams:
            print(f"    {t}")
    return out


def main() -> int:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    out = resolve()
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=True, sort_keys=True), encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
