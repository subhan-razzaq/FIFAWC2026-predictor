"""Goalscorer model (Section 3.4).

Conditional on a team scoring k goals in a simulated match, each goal is attributed
to a player. A player's open-play scoring weight is

    s_p  proportional to  npxG90_p * minutes_share_p * position_factor_p

Penalties go to the designated taker first, a small mass is reserved for own goals
and unattributed goals, and the rest is a multinomial over the eleven (plus the
rotation bench) using s_p. This module exports, per team, the normalized open-play
distribution and the mixing shares so the browser simulation can attribute goals
without re-deriving anything.
"""

from __future__ import annotations

from src.lineups import expected_minutes

# share of goals that are penalties (designated taker) and own/unattributed.
# Roughly matches the international rate: about one goal in ten is a penalty.
PENALTY_SHARE = 0.10
OWN_GOAL_SHARE = 0.035


def scorer_distribution(squad: list[dict], eleven: list[str]) -> list[dict]:
    """Return the normalized open-play scoring distribution over the squad.

    Starters dominate through their minutes share, but rotation players keep a
    small chance, which is what produces a realistic spread of scorers across a
    long Monte Carlo run.
    """
    minutes = expected_minutes(squad, eleven)
    weights: list[tuple[str, float]] = []
    for p in squad:
        s = p["npxg90"] * minutes[p["name"]] * p["position_factor"]
        weights.append((p["name"], s))

    total = sum(w for _, w in weights)
    if total <= 0:
        # degenerate fallback: uniform over the eleven
        return [{"player": n, "weight": round(1.0 / len(eleven), 4)} for n in eleven]

    dist = [{"player": n, "weight": round(w / total, 5)} for n, w in weights if w > 0]
    dist.sort(key=lambda d: -d["weight"])
    return dist


def team_scorer_model(squad: dict) -> dict:
    """Build the exportable scorer block for one team."""
    eleven = squad["projected_eleven"]
    dist = scorer_distribution(squad["players"], eleven)
    return {
        "open_play": dist,
        "penalty_taker": squad["penalty_taker"],
        "penalty_share": PENALTY_SHARE,
        "own_goal_share": OWN_GOAL_SHARE,
    }


def top_scorers(squad: dict, n: int = 5) -> list[str]:
    """Convenience: the n most likely scorers, for quick display and sanity checks."""
    dist = scorer_distribution(squad["players"], squad["projected_eleven"])
    return [d["player"] for d in dist[:n]]
