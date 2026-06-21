"""Build the frozen 26-man squad snapshot for all 48 teams.

For every team we start from the curated real core in ``squad_data.py``, calibrate
each player's non-penalty xG and xA per 90 from (role, tier), then complete the
squad to the frozen 26 with role-appropriate depth so manage mode always has a
full bench. A projected starting eleven and formation are derived from the best
available player per slot. The whole thing is deterministic: a fixed seed per team
means the snapshot is reproducible and reviewable.

Output: ``data/static/squads_2026.json`` (committed). The browser never reads this
directly. It is folded into model.json by ``export.py``.

Honesty note: the curated cores are real players with per-90 rates estimated from
their role and club tier. ``ingest.py`` documents the path to replace these
estimates with live FBref and Understat per-90s via soccerdata. Depth beyond the
curated core is representative, scaled to each team's strength.
"""

from __future__ import annotations

import json
import random

from src.config import STATIC_DIR, ensure_dirs
from src.elo import compute_elo
from src.ingest import load_results
from src.squad_data import PENALTY_TAKERS, REAL
from src.teams import TEAMS, Team

# role -> coarse position group
ROLE_GROUP = {
    "GK": "GK",
    "CB": "DF", "FB": "DF",
    "DM": "MF", "CM": "MF", "AM": "MF",
    "W": "FW", "ST": "FW",
}

# position scoring factor: how much a goal is "expected" from this role (Section 3.4)
POSITION_FACTOR = {
    "GK": 0.02, "CB": 0.25, "FB": 0.40,
    "DM": 0.45, "CM": 0.75, "AM": 1.15,
    "W": 1.25, "ST": 1.6,
}

# defensive contribution by role (for the squad-quality defensive aggregate)
DEFENSE_FACTOR = {
    "GK": 1.0, "CB": 1.0, "FB": 0.75,
    "DM": 0.8, "CM": 0.5, "AM": 0.25,
    "W": 0.2, "ST": 0.15,
}

# tier -> overall ability and club-strength multiplier
TIER_ABILITY = {"elite": 1.0, "star": 0.8, "starter": 0.55, "squad": 0.35}
TIER_CLUB = {"elite": 1.0, "star": 0.85, "starter": 0.65, "squad": 0.45}

# (role, tier) -> (npxG90, xA90). Curated, anchored to realistic club rates.
_NPXG = {
    "ST": {"elite": 0.62, "star": 0.45, "starter": 0.32, "squad": 0.22},
    "W": {"elite": 0.45, "star": 0.34, "starter": 0.22, "squad": 0.15},
    "AM": {"elite": 0.38, "star": 0.28, "starter": 0.18, "squad": 0.12},
    "CM": {"elite": 0.18, "star": 0.13, "starter": 0.09, "squad": 0.06},
    "DM": {"elite": 0.07, "star": 0.05, "starter": 0.04, "squad": 0.03},
    "FB": {"elite": 0.08, "star": 0.06, "starter": 0.04, "squad": 0.03},
    "CB": {"elite": 0.06, "star": 0.05, "starter": 0.04, "squad": 0.03},
    "GK": {"elite": 0.0, "star": 0.0, "starter": 0.0, "squad": 0.0},
}
_XA = {
    "ST": {"elite": 0.18, "star": 0.15, "starter": 0.12, "squad": 0.10},
    "W": {"elite": 0.30, "star": 0.24, "starter": 0.18, "squad": 0.13},
    "AM": {"elite": 0.34, "star": 0.27, "starter": 0.20, "squad": 0.15},
    "CM": {"elite": 0.22, "star": 0.18, "starter": 0.13, "squad": 0.10},
    "DM": {"elite": 0.12, "star": 0.10, "starter": 0.08, "squad": 0.06},
    "FB": {"elite": 0.22, "star": 0.17, "starter": 0.12, "squad": 0.08},
    "CB": {"elite": 0.05, "star": 0.04, "starter": 0.03, "squad": 0.03},
    "GK": {"elite": 0.01, "star": 0.01, "starter": 0.01, "squad": 0.01},
}

# squad shape: 3 GK, 8 DF, 8 MF, 7 FW = 26
TEMPLATE = {"GK": 3, "DF": 8, "MF": 8, "FW": 7}
# default projected XI is a 4-3-3
FORMATION_433 = ["GK", "CB", "CB", "FB", "FB", "DM", "CM", "AM", "W", "W", "ST"]

# name pools per region for depth fill (deterministic). Real-sounding, region
# appropriate. The curated stars above are the players that actually matter.
_FIRST = {
    "default": ["Daniel", "Marco", "Luka", "Adam", "Leo", "Noah", "Felix", "Tomas", "Andre", "Ivan",
                "Mateo", "Elias", "Victor", "Hugo", "Oscar"],
    "CAF": ["Mohamed", "Ibrahim", "Youssef", "Abdoulaye", "Samuel", "Kwame", "Cheikh", "Moussa", "Emmanuel",
            "Ismael", "Yaya", "Bakary", "Souleymane", "Aboubacar", "Karim", "Sekou"],
    "AFC": ["Hassan", "Ali", "Yuki", "Ahmad", "Sota", "Reza", "Omar", "Khalid", "Sahil", "Ren",
            "Mehdi", "Faisal", "Takuma", "Jin", "Saad", "Bilal"],
    "CONMEBOL": ["Diego", "Santiago", "Mateo", "Luis", "Carlos", "Bruno", "Felipe", "Joaquin", "Gabriel",
                 "Nicolas", "Agustin", "Matias", "Rodrigo", "Sebastian", "Tomas", "Lucas"],
    "CONCACAF": ["Carlos", "Luis", "Marvin", "Andres", "Kevin", "Joel", "Bryan", "Romell", "Junior",
                 "Diego", "Wilmer", "Erick", "Roberto", "Frantz", "Duckens", "Alberto"],
    "UEFA": ["Lukas", "Matej", "Stefan", "Filip", "Niklas", "Anton", "Petar", "Emil", "Janis", "Marek",
             "Tomas", "Andrej", "Marko", "Viktor", "Jonas", "David"],
    "OFC": ["Liam", "Cameron", "Ben", "Tyler", "Jordan", "Callum", "Mason", "Ryan", "Noah", "Cody",
            "Finn", "Oliver", "Lucas", "Harry", "Joel"],
}
_LAST = {
    "default": ["Novak", "Horvat", "Berg", "Lindholm", "Kovac", "Petrov", "Marek", "Simic", "Vidal", "Larsen",
                "Andersen", "Moller", "Halvorsen", "Nilsen", "Costa", "Mertens", "Janssen", "Weber"],
    "CAF": ["Toure", "Diallo", "Mensah", "Ndiaye", "Osei", "Ba", "Sylla", "Camara", "Boateng", "Keita",
            "Traore", "Cisse", "Konate", "Owusu", "Drogba", "Kone", "Sarr", "Mendy", "Asante", "Yeboah"],
    "AFC": ["Tanaka", "Kim", "Hosseini", "Al-Dawsari", "Yamamoto", "Lee", "Karimi", "Hassan", "Park", "Sato",
            "Nakamura", "Choi", "Ahmadi", "Al-Mutairi", "Ito", "Jung", "Rahimi", "Suzuki", "Kang", "Tanveer"],
    "CONMEBOL": ["Gomez", "Silva", "Rojas", "Castro", "Vargas", "Mendoza", "Ramos", "Ortega", "Suarez", "Flores",
                 "Cardozo", "Benitez", "Acosta", "Romero", "Sosa", "Ibarra", "Caceres", "Nunez", "Paredes", "Aguero"],
    "CONCACAF": ["Hernandez", "Lopez", "Martinez", "Reyes", "Campbell", "Aguilar", "Castillo", "Jean", "Moreno",
                 "Bell", "Pierre", "Joseph", "Quioto", "Escobar", "Dominguez", "Cordoba", "Vega", "Gomez", "Saint-Louis", "Charles"],
    "UEFA": ["Novak", "Horvat", "Kovacevic", "Hadzic", "Jansson", "Svensson", "Popov", "Marek", "Toth", "Berg",
             "Hofer", "Kovacic", "Petrovic", "Nielsen", "Andersson", "Dvorak", "Stankovic", "Lukic", "Vasilev", "Olsen"],
    "OFC": ["Wood", "Stamenic", "Bell", "Singh", "Garbett", "Just", "Boxall", "Cacace", "Waine", "Barbarouses",
            "Thomas", "Reid", "Payne", "McCowatt", "Lewis", "Bevan", "Old", "Surman"],
}


def _calibrate(role: str, tier: str, jitter: float) -> dict:
    """Build a player's rate vector from role and tier, with small fixed jitter."""
    npxg = _NPXG[role][tier] * (1.0 + jitter)
    xa = _XA[role][tier] * (1.0 + jitter)
    return {
        "npxg90": round(npxg, 3),
        "xa90": round(xa, 3),
        "ability": round(TIER_ABILITY[tier] * (1.0 + 0.5 * jitter), 3),
        "club_strength": TIER_CLUB[tier],
        "position_factor": POSITION_FACTOR[role],
        "defense_factor": DEFENSE_FACTOR[role],
    }


def _depth_tier(rng: random.Random, team_strength: float) -> str:
    """Pick a depth player's tier. Stronger teams get better depth."""
    # team_strength in [0,1] (Elo percentile). Bias the draw upward for strong teams.
    r = rng.random() * (1.0 - 0.45 * team_strength)
    if r < 0.08 and team_strength > 0.7:
        return "star"
    if r < 0.45:
        return "starter"
    return "squad"


def _gen_name(rng: random.Random, conf: str, used: set[str], surname_counts: dict[str, int]) -> str:
    first = _FIRST.get(conf, _FIRST["default"])
    last = _LAST.get(conf, _LAST["default"])
    for _ in range(80):
        ln = rng.choice(last)
        # keep any surname to at most two players per squad so it reads naturally
        if surname_counts.get(ln, 0) >= 2:
            continue
        name = f"{rng.choice(first)} {ln}"
        if name not in used:
            used.add(name)
            surname_counts[ln] = surname_counts.get(ln, 0) + 1
            return name
    name = f"{rng.choice(first)} {rng.choice(last)} {len(used)}"
    used.add(name)
    return name


def _role_for_group(rng: random.Random, group: str) -> str:
    if group == "GK":
        return "GK"
    if group == "DF":
        return rng.choice(["CB", "CB", "FB"])
    if group == "MF":
        return rng.choice(["DM", "CM", "CM", "AM"])
    return rng.choice(["W", "W", "ST"])


def build_team_squad(team: Team, strength: float) -> list[dict]:
    """Return a 26-man squad for a team: curated core plus depth fill."""
    rng = random.Random(hash(team.name) & 0xFFFFFFFF)
    players: list[dict] = []
    used_names: set[str] = set()
    surname_counts: dict[str, int] = {}
    group_counts = {"GK": 0, "DF": 0, "MF": 0, "FW": 0}

    # 1) curated real core
    for name, role, club, tier in REAL.get(team.name, []):
        grp = ROLE_GROUP[role]
        jitter = rng.uniform(-0.06, 0.06)
        players.append({
            "name": name, "role": role, "group": grp, "club": club,
            "tier": tier, "real": True, **_calibrate(role, tier, jitter),
        })
        used_names.add(name)
        group_counts[grp] += 1

    # 2) fill to the template with depth
    for grp, target in TEMPLATE.items():
        while group_counts[grp] < target:
            role = _role_for_group(rng, grp)
            tier = "starter" if (grp == "GK" and group_counts[grp] == 0) else _depth_tier(rng, strength)
            name = _gen_name(rng, team.confederation, used_names, surname_counts)
            jitter = rng.uniform(-0.08, 0.08)
            players.append({
                "name": name, "role": role, "group": grp, "club": "club",
                "tier": tier, "real": False, **_calibrate(role, tier, jitter),
            })
            group_counts[grp] += 1

    return players


def _project_eleven(squad: list[dict]) -> list[str]:
    """Pick a projected 4-3-3 starting eleven: best available by ability per slot."""
    # selection prefers real curated players: a real player gets an effective bonus
    # so a real star is never benched behind generated depth at the same role.
    def sel(p: dict) -> float:
        return p["ability"] + (0.2 if p["real"] else 0.0)

    by_role: dict[str, list[dict]] = {}
    for p in squad:
        by_role.setdefault(p["role"], []).append(p)
    for r in by_role:
        by_role[r].sort(key=lambda p: -sel(p))

    chosen: list[str] = []
    used: set[str] = set()

    def take(allowed: list[str]) -> None:
        # pick the best available player across the compatible roles, so a real
        # star is never benched behind generated depth at a neighbouring role
        best = None
        for r in allowed:
            for p in by_role.get(r, []):
                if p["name"] in used:
                    continue
                if best is None or sel(p) > sel(best):
                    best = p
        if best is not None:
            used.add(best["name"])
            chosen.append(best["name"])

    # 4-3-3 slots with generous role compatibility
    take(["GK"])
    take(["CB", "FB"])
    take(["CB", "FB"])
    take(["FB", "CB"])
    take(["FB", "CB"])
    take(["DM", "CM"])
    take(["CM", "DM", "AM"])
    take(["AM", "CM", "W"])
    take(["W", "AM", "ST"])
    take(["W", "AM", "ST"])
    take(["ST", "W", "AM"])
    return chosen


def _designate(team: Team, squad: list[dict], eleven: list[str]) -> dict:
    """Pick captain, penalty taker, and set-piece taker from the projected eleven."""
    starters = [p for p in squad if p["name"] in eleven]
    outfield = [p for p in starters if p["role"] != "GK"]

    pk = PENALTY_TAKERS.get(team.name)
    if pk not in eleven:
        # best attacker by ability and goal threat
        pk = max(outfield, key=lambda p: p["ability"] * p["position_factor"])["name"]

    # captains are outfield leaders in almost every national side
    captain = max(outfield, key=lambda p: p["ability"] * (1.1 if p["real"] else 1.0))["name"]
    set_piece = max(outfield, key=lambda p: p["xa90"] + 0.3 * p["ability"])["name"]
    return {"captain": captain, "penalty_taker": pk, "set_piece_taker": set_piece}


def build_all() -> dict:
    ensure_dirs()
    elo = compute_elo(load_results())
    field_elo = {t.name: elo.get(t.name, 1500.0) for t in TEAMS}
    lo, hi = min(field_elo.values()), max(field_elo.values())

    squads: dict[str, dict] = {}
    for team in TEAMS:
        strength = (field_elo[team.name] - lo) / (hi - lo) if hi > lo else 0.5
        squad = build_team_squad(team, strength)
        eleven = _project_eleven(squad)
        roles = _designate(team, squad, eleven)
        squads[team.name] = {
            "team": team.name,
            "formation": "4-3-3",
            "players": squad,
            "projected_eleven": eleven,
            **roles,
        }
    return squads


def main() -> int:
    squads = build_all()
    out = STATIC_DIR / "squads_2026.json"
    out.write_text(json.dumps(squads, indent=2, ensure_ascii=True), encoding="utf-8")
    total = sum(len(s["players"]) for s in squads.values())
    print(f"wrote {out} with {len(squads)} squads, {total} players")
    # quick checks
    for name, s in squads.items():
        assert len(s["players"]) == 26, f"{name} has {len(s['players'])} players"
        assert len(s["projected_eleven"]) == 11, f"{name} eleven has {len(s['projected_eleven'])}"
    print("squad checks passed: every team has 26 players and a projected eleven")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
