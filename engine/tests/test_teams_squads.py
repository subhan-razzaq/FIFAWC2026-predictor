"""Tests for the 2026 field, the frozen squads, and the scorer model."""

from __future__ import annotations

import json

from src.config import STATIC_DIR
from src.lineups import expected_minutes, squad_quality
from src.scorers import scorer_distribution, team_scorer_model
from src.teams import GROUPS, TEAMS, group_fixtures, sanity_check, teams_by_group


def test_field_is_well_formed():
    sanity_check()  # raises if not 48 teams / 12 groups of 4 / valid pots
    assert len(TEAMS) == 48
    assert len(GROUPS) == 12


def test_group_fixtures_round_robin():
    fx = group_fixtures()
    assert len(fx) == 72
    for g in GROUPS:
        gfx = [m for m in fx if m["group"] == g]
        assert len(gfx) == 6  # 4 teams round robin
        names = {t.name for t in teams_by_group(g)}
        for m in gfx:
            assert m["home"] in names and m["away"] in names


def _load_squads():
    return json.loads((STATIC_DIR / "squads_2026.json").read_text(encoding="utf-8"))


def test_every_squad_has_26_and_an_eleven():
    squads = _load_squads()
    assert len(squads) == 48
    for name, s in squads.items():
        assert len(s["players"]) == 26, name
        assert len(s["projected_eleven"]) == 11, name
        names = {p["name"] for p in s["players"]}
        assert set(s["projected_eleven"]).issubset(names), name
        assert s["captain"] in names and s["penalty_taker"] in names


def test_scorer_distribution_normalized():
    squads = _load_squads()
    for name, s in squads.items():
        dist = scorer_distribution(s["players"], s["projected_eleven"])
        total = sum(d["weight"] for d in dist)
        assert abs(total - 1.0) < 1e-3, (name, total)


def test_scorer_block_structure():
    squads = _load_squads()
    block = team_scorer_model(squads["Brazil"])
    assert 0 < block["penalty_share"] < 0.3
    assert block["open_play"][0]["weight"] >= block["open_play"][-1]["weight"]


def test_squad_quality_responds_to_eleven():
    squads = _load_squads()
    s = squads["France"]
    base_atk, base_def = squad_quality(s["players"], s["projected_eleven"])
    # swap the projected eleven for a weaker one (drop best attacker)
    weaker = [n for n in s["projected_eleven"]][:-1] + [
        p["name"] for p in s["players"] if p["name"] not in s["projected_eleven"]
    ][:1]
    w_atk, _ = squad_quality(s["players"], weaker)
    assert base_atk != w_atk  # changing the eleven changes the aggregate


def test_expected_minutes_starters_play_more():
    squads = _load_squads()
    s = squads["Spain"]
    mins = expected_minutes(s["players"], s["projected_eleven"])
    starter = mins[s["projected_eleven"][0]]
    bench_vals = [mins[p["name"]] for p in s["players"] if p["name"] not in s["projected_eleven"]]
    assert starter > max(bench_vals)
