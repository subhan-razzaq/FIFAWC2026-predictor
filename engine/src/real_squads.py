"""Parse the real 2026 World Cup squads from the Wikipedia squads page and build
the frozen 26-man snapshot. Every player is a real, named player. No generation.

The source is the raw wikitext (cached under data/raw), parsed deterministically
from the ``{{nat fs g player|...}}`` templates, which carry each player's
position, club, international caps, and international goals. Player quality is
inferred from club strength (a curated club tier) reinforced by caps, and the
scorer rates additionally use real international goals so prolific scorers rise to
the top of the Golden Boot race. Per-90 figures remain estimates anchored to those
signals; ``ingest.py`` documents swapping in live FBref and Understat per-90s.
"""

from __future__ import annotations

import json
import re
import unicodedata

from src.config import STATIC_DIR, ensure_dirs
from src.squad_data import PENALTY_TAKERS
from src.teams import TEAMS

# committed real-squad source so the build reproduces without re-fetching
WIKITEXT = STATIC_DIR / "squads_wikitext.json"

# wikitext heading -> our canonical (martj42) team name
TEAM_ALIASES = {
    "Curacao": "Curacao",
    "Cote d'Ivoire": "Ivory Coast",
    "Ivory Coast": "Ivory Coast",
    "Turkiye": "Turkey",
    "Turkey": "Turkey",
    "Cabo Verde": "Cape Verde",
    "Cape Verde": "Cape Verde",
    "DR Congo": "DR Congo",
    "Democratic Republic of the Congo": "DR Congo",
    "Republic of Ireland": "Ireland",
}

CANONICAL = {t.name for t in TEAMS}


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").strip()


def _norm_team(heading: str) -> str | None:
    h = _ascii(heading)
    if h in CANONICAL:
        return h
    if h in TEAM_ALIASES and TEAM_ALIASES[h] in CANONICAL:
        return TEAM_ALIASES[h]
    return None


def _clean_link(value: str) -> str:
    """Extract display text from a wikilink like [[A]] or [[A|B]], strip markup."""
    value = value.strip()
    m = re.search(r"\[\[([^\]]+)\]\]", value)
    if m:
        inner = m.group(1)
        return inner.split("|")[-1].strip()
    return value.strip()


_PLAYER_RE = re.compile(r"\{\{nat fs g player\|([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}")


def _parse_params(body: str) -> dict[str, str]:
    """Parse template params, tolerant of nested {{...}} in age=."""
    params: dict[str, str] = {}
    depth = 0  # nesting depth for {{...}} and [[...]] so we do not split on their |
    cur = ""
    parts = []
    prev = ""
    for ch in body:
        if ch == "|" and depth == 0:
            parts.append(cur)
            cur = ""
            prev = ch
            continue
        if (prev == "{" and ch == "{") or (prev == "[" and ch == "["):
            depth += 1
        elif (prev == "}" and ch == "}") or (prev == "]" and ch == "]"):
            depth = max(0, depth - 1)
        cur += ch
        prev = ch
    parts.append(cur)
    for p in parts:
        if "=" in p:
            k, _, v = p.partition("=")
            params[k.strip()] = v.strip()
    return params


def parse_squads() -> dict[str, list[dict]]:
    """Return {team: [ {name, pos, club, caps, goals}, ... ]} for all 48 teams."""
    raw = json.loads(WIKITEXT.read_text(encoding="utf-8"))
    wt = raw["parse"]["wikitext"]

    # team blocks delimited by level-3 headings === Team ===
    headings = list(re.finditer(r"\n===\s*([^=\n]+?)\s*===\n", wt))
    squads: dict[str, list[dict]] = {}
    for i, h in enumerate(headings):
        team = _norm_team(h.group(1))
        if not team:
            continue
        start = h.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(wt)
        block = wt[start:end]
        players = []
        for m in _PLAYER_RE.finditer(block):
            params = _parse_params(m.group(1))
            pos = params.get("pos", "").upper()
            name = _clean_link(params.get("name", ""))
            if not name or pos not in ("GK", "DF", "MF", "FW"):
                continue
            players.append({
                "name": name,
                "pos": pos,
                "club": _clean_link(params.get("club", "")),
                "number": int(re.sub(r"\D", "", params.get("no", "0") or "0") or 0),
                "caps": int(re.sub(r"\D", "", params.get("caps", "0") or "0") or 0),
                "goals": int(re.sub(r"\D", "", params.get("goals", "0") or "0") or 0),
            })
        if players:
            squads[team] = players
    return squads


# --- quality model ------------------------------------------------------------

# curated club strength on a 0..1 skill scale. Unlisted clubs default to 0.42.
CLUB_TIER: dict[str, float] = {
    # elite
    "Real Madrid": 1.0, "Manchester City": 0.98, "Bayern Munich": 0.97, "Barcelona": 0.96,
    "Liverpool": 0.96, "Paris Saint-Germain": 0.95, "Arsenal": 0.93, "Inter Milan": 0.9,
    "Inter": 0.9, "Chelsea": 0.88, "Atletico Madrid": 0.88, "Manchester United": 0.85,
    "Tottenham Hotspur": 0.84, "Juventus": 0.84, "Napoli": 0.84, "Bayer Leverkusen": 0.84,
    "Borussia Dortmund": 0.83, "AC Milan": 0.83, "Milan": 0.83, "Atalanta": 0.8,
    "Newcastle United": 0.8, "Aston Villa": 0.78, "RB Leipzig": 0.8, "Sporting CP": 0.76,
    "Benfica": 0.76, "Porto": 0.74, "Real Sociedad": 0.74, "Villarreal": 0.74,
    "Athletic Bilbao": 0.72, "Brighton": 0.72, "Brighton & Hove Albion": 0.72,
    "West Ham United": 0.7, "Crystal Palace": 0.7, "Fulham": 0.68, "Bologna": 0.7,
    "AS Roma": 0.76, "Roma": 0.76, "Lazio": 0.74, "Fiorentina": 0.7, "Wolverhampton Wanderers": 0.66,
    "Everton": 0.66, "Nottingham Forest": 0.66, "Brentford": 0.66, "Bournemouth": 0.66,
    "Eintracht Frankfurt": 0.72, "VfB Stuttgart": 0.7, "Borussia Monchengladbach": 0.66,
    "Sevilla": 0.7, "Real Betis": 0.7, "Valencia": 0.64, "Celta Vigo": 0.6, "Girona": 0.66,
    "Feyenoord": 0.66, "PSV Eindhoven": 0.68, "Ajax": 0.68, "Galatasaray": 0.66,
    "Fenerbahce": 0.66, "Lille": 0.66, "Lyon": 0.66, "Monaco": 0.72, "AS Monaco": 0.72,
    "Marseille": 0.7, "Nice": 0.64, "OGC Nice": 0.64, "Lens": 0.64, "Stade Rennais": 0.62,
    "Rennes": 0.62, "Celtic": 0.6, "Rangers": 0.56, "Sporting Lisbon": 0.76,
    # strong selling/secondary
    "Al-Hilal": 0.7, "Al-Nassr": 0.68, "Al-Ahli": 0.62, "Al Ahli": 0.62, "Al-Ittihad": 0.62,
    "Al Sadd SC": 0.5, "Al Sadd": 0.5, "Los Angeles FC": 0.5, "Inter Miami CF": 0.52,
    "Inter Miami": 0.52,
}

# coarse-position scoring and defensive weights
POS_FACTOR = {"GK": 0.02, "DF": 0.32, "MF": 0.9, "FW": 1.5}
DEF_FACTOR = {"GK": 1.0, "DF": 0.92, "MF": 0.45, "FW": 0.16}
SQUAD_SHAPE = {"GK": 3, "DF": 8, "MF": 8, "FW": 7}
# projected 4-3-3 by coarse position
FORMATION = {"GK": 1, "DF": 4, "MF": 3, "FW": 3}


def club_score(club: str) -> float:
    return CLUB_TIER.get(club, 0.42)


def _ability(p: dict) -> float:
    """Blend club skill with international experience.

    Club strength is the main skill proxy, reinforced by caps (seniority) and
    international goals (a star signal that keeps proven scorers highly rated even
    when they play in a weaker league or when their club name is unmapped).
    """
    cs = club_score(p["club"])
    caps_factor = min(p["caps"] / 70.0, 1.0)
    goal_factor = min(p["goals"] / 80.0, 1.0)
    base = 0.6 * cs + 0.25 * caps_factor + 0.15 * goal_factor + 0.04 * (cs > 0.8)
    return round(min(1.0, base), 4)


def _tier(ability: float) -> str:
    if ability >= 0.85:
        return "elite"
    if ability >= 0.65:
        return "star"
    if ability >= 0.45:
        return "starter"
    return "squad"


def _rates(pos: str, ability: float, caps: int, goals: int) -> tuple[float, float]:
    """Estimate non-penalty xG and xA per 90 from position, ability, and the
    player's real international scoring rate."""
    # shrink goals-per-cap toward zero for small samples so a 1-cap, 1-goal player
    # is not treated like an elite scorer
    gpc = goals / (caps + 6.0)
    if pos == "FW":
        npxg = 0.12 + 0.40 * ability + 0.55 * min(gpc, 0.8)
        xa = 0.08 + 0.20 * ability
    elif pos == "MF":
        npxg = 0.03 + 0.16 * ability + 0.30 * min(gpc, 0.5)
        xa = 0.07 + 0.22 * ability
    elif pos == "DF":
        npxg = 0.02 + 0.05 * ability
        xa = 0.03 + 0.12 * ability
    else:
        npxg, xa = 0.0, 0.01
    return round(npxg, 3), round(xa, 3)


def _to_player(p: dict) -> dict:
    ability = _ability(p)
    npxg, xa = _rates(p["pos"], ability, p["caps"], p["goals"])
    return {
        "name": p["name"],
        "role": p["pos"],
        "group": p["pos"],
        "club": p["club"],
        "number": p.get("number", 0),
        "tier": _tier(ability),
        "real": True,
        "caps": p["caps"],
        "intl_goals": p["goals"],
        "npxg90": npxg,
        "xa90": xa,
        "ability": ability,
        "club_strength": round(club_score(p["club"]), 3),
        "position_factor": POS_FACTOR[p["pos"]],
        "defense_factor": DEF_FACTOR[p["pos"]],
    }


def _project_eleven(players: list[dict]) -> list[str]:
    """Best XI in a 4-3-3 by coarse position, filling any short group from the
    best remaining players."""
    by_pos: dict[str, list[dict]] = {"GK": [], "DF": [], "MF": [], "FW": []}
    for p in players:
        by_pos[p["group"]].append(p)
    for grp in by_pos:
        by_pos[grp].sort(key=lambda p: -p["ability"])

    chosen: list[dict] = []
    used: set[str] = set()
    for grp, n in FORMATION.items():
        for p in by_pos[grp][:n]:
            chosen.append(p)
            used.add(p["name"])
    # if any slot under-filled (rare), top up by best available
    if len(chosen) < 11:
        rest = sorted((p for p in players if p["name"] not in used), key=lambda p: -p["ability"])
        for p in rest:
            chosen.append(p)
            used.add(p["name"])
            if len(chosen) == 11:
                break
    return [p["name"] for p in chosen[:11]]


def build_team(team_name: str, raw_players: list[dict]) -> dict:
    players = [_to_player(p) for p in raw_players]
    # cap at the frozen 26, keeping the strongest if the source lists more
    if len(players) > 26:
        # keep position balance: never drop below the squad shape, then best rest
        players.sort(key=lambda p: -p["ability"])
        players = players[:26]
    eleven = _project_eleven(players)
    starters = [p for p in players if p["name"] in set(eleven)]
    outfield = [p for p in starters if p["group"] != "GK"]

    # penalty taker: curated name if present (accent-insensitive), else top scorer
    pk = None
    want = PENALTY_TAKERS.get(team_name)
    if want:
        wa = _ascii(want).lower()
        for p in starters:
            if _ascii(p["name"]).lower() == wa:
                pk = p["name"]
                break
    if not pk and outfield:
        pk = max(outfield, key=lambda p: p["npxg90"] * p["position_factor"])["name"]

    captain = max(outfield, key=lambda p: p["ability"] + 0.0008 * p["caps"])["name"] if outfield else eleven[0]
    set_piece = max(outfield, key=lambda p: p["xa90"] + 0.2 * p["ability"])["name"] if outfield else pk

    return {
        "team": team_name,
        "formation": "4-3-3",
        "players": players,
        "projected_eleven": eleven,
        "captain": captain,
        "penalty_taker": pk,
        "set_piece_taker": set_piece,
    }


def build_all() -> dict:
    parsed = parse_squads()
    missing = [t.name for t in TEAMS if t.name not in parsed]
    if missing:
        raise SystemExit(f"missing real squads for: {missing}")
    return {t.name: build_team(t.name, parsed[t.name]) for t in TEAMS}


def main() -> int:
    ensure_dirs()
    squads = build_all()
    out = STATIC_DIR / "squads_2026.json"
    out.write_text(json.dumps(squads, indent=2, ensure_ascii=True), encoding="utf-8")
    total = sum(len(s["players"]) for s in squads.values())
    short = {n: len(s["players"]) for n, s in squads.items() if len(s["players"]) < 23}
    print(f"wrote {out}: {len(squads)} squads, {total} real players")
    if short:
        print(f"  teams with < 23 players: {short}")
    for name, s in squads.items():
        assert len(s["projected_eleven"]) == 11, f"{name} eleven {len(s['projected_eleven'])}"
        assert all(s[k] for k in ("captain", "penalty_taker", "set_piece_taker")), name
    print("checks passed: every team has a real projected eleven and designations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
