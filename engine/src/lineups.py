"""Lineup model (Section 3.5) and the squad-quality aggregate (Section 3.3).

The projected eleven for each team comes from ``real_squads`` (best available per
slot in a 4-3-3). Here we turn an eleven into expected minutes shares and roll a
squad up into an attacking and a defensive strength. The squad-quality aggregate
is what makes manage mode meaningful: changing the eleven changes these numbers,
which shift the team's attack and defence ratings for its matches.
"""

from __future__ import annotations

# expected share of match minutes by depth role
STARTER_MINUTES = 0.88
ROTATION_MINUTES = 0.30  # the strongest few players off the bench
BENCH_MINUTES = 0.08


def expected_minutes(squad: list[dict], eleven: list[str]) -> dict[str, float]:
    """Assign each player an expected minutes share for one match.

    Starters play most of the match. The best handful of non-starters get a
    meaningful rotation share, the rest a small cameo share. Used to weight the
    scorer model so bench players can still score but starters dominate.
    """
    starters = set(eleven)
    bench = [p for p in squad if p["name"] not in starters]
    bench.sort(key=lambda p: -p["ability"])
    rotation = {p["name"] for p in bench[:5]}

    out: dict[str, float] = {}
    for p in squad:
        if p["name"] in starters:
            out[p["name"]] = STARTER_MINUTES
        elif p["name"] in rotation:
            out[p["name"]] = ROTATION_MINUTES
        else:
            out[p["name"]] = BENCH_MINUTES
    return out


def squad_quality(squad: list[dict], eleven: list[str]) -> tuple[float, float]:
    """Aggregate an eleven into (attack_strength, defence_strength).

    Attack rewards goal threat and creation weighted by club level. Defence rewards
    defensive roles and overall ability across the spine and back line. Both are on
    arbitrary positive scales; they are standardized across teams before they enter
    the ratings blend, so only the relative ordering and spread matter.
    """
    minutes = expected_minutes(squad, eleven)
    starters = [p for p in squad if p["name"] in set(eleven)]

    attack = 0.0
    defence = 0.0
    for p in starters:
        m = minutes[p["name"]]
        # attacking contribution: non-penalty xG and creation, upweighted by role
        attack += (p["npxg90"] * p["position_factor"] + 0.4 * p["xa90"]) * p["club_strength"] * m
        # defensive contribution: defensive roles and ability across the side
        defence += p["defense_factor"] * (0.6 + 0.4 * p["ability"]) * p["club_strength"] * m

    return round(attack, 4), round(defence, 4)
