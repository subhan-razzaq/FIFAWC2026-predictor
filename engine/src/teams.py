"""The 2026 World Cup field: 48 teams, the official 12-group final draw, pots,
confederations, and approximate FIFA ranking.

The draw is the real one made on 5 December 2025 in Washington, D.C. Team names
use the martj42 international-results canonical spelling so the ratings fit lines
up with the historical data without a second name-mapping pass. FIFA ranks are
approximate June-2026 values and are used only as the final group tie-breaker and
for display, so small inaccuracies do not affect the model.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations


@dataclass(frozen=True)
class Team:
    name: str          # martj42 canonical name, the join key for results data
    group: str         # "A" .. "L"
    pot: int           # seeding pot 1..4 from the official draw
    confederation: str
    fifa_rank: int     # approximate June 2026
    host: bool = False


# Final draw, 5 December 2025. Order within a group is the official draw position.
# Hosts are fixed: Mexico A1, Canada B1, United States D1.
TEAMS: list[Team] = [
    # Group A
    Team("Mexico", "A", 1, "CONCACAF", 13, host=True),
    Team("South Africa", "A", 3, "CAF", 58),
    Team("South Korea", "A", 2, "AFC", 23),
    Team("Czech Republic", "A", 4, "UEFA", 43),
    # Group B
    Team("Canada", "B", 1, "CONCACAF", 30, host=True),
    Team("Bosnia and Herzegovina", "B", 4, "UEFA", 74),
    Team("Qatar", "B", 3, "AFC", 52),
    Team("Switzerland", "B", 2, "UEFA", 20),
    # Group C
    Team("Brazil", "C", 1, "CONMEBOL", 5),
    Team("Morocco", "C", 2, "CAF", 12),
    Team("Haiti", "C", 4, "CONCACAF", 83),
    Team("Scotland", "C", 3, "UEFA", 44),
    # Group D
    Team("United States", "D", 1, "CONCACAF", 16, host=True),
    Team("Paraguay", "D", 3, "CONMEBOL", 40),
    Team("Australia", "D", 2, "AFC", 26),
    Team("Turkey", "D", 4, "UEFA", 27),
    # Group E
    Team("Germany", "E", 1, "UEFA", 9),
    Team("Curacao", "E", 4, "CONCACAF", 82),
    Team("Ivory Coast", "E", 3, "CAF", 41),
    Team("Ecuador", "E", 2, "CONMEBOL", 24),
    # Group F
    Team("Netherlands", "F", 1, "UEFA", 7),
    Team("Japan", "F", 2, "AFC", 17),
    Team("Sweden", "F", 4, "UEFA", 38),
    Team("Tunisia", "F", 3, "CAF", 49),
    # Group G
    Team("Belgium", "G", 1, "UEFA", 8),
    Team("Egypt", "G", 3, "CAF", 33),
    Team("Iran", "G", 2, "AFC", 21),
    Team("New Zealand", "G", 4, "OFC", 86),
    # Group H
    Team("Spain", "H", 1, "UEFA", 2),
    Team("Cape Verde", "H", 4, "CAF", 70),
    Team("Saudi Arabia", "H", 3, "AFC", 59),
    Team("Uruguay", "H", 2, "CONMEBOL", 15),
    # Group I
    Team("France", "I", 1, "UEFA", 3),
    Team("Senegal", "I", 2, "CAF", 19),
    Team("Iraq", "I", 4, "AFC", 58),
    Team("Norway", "I", 3, "UEFA", 28),
    # Group J
    Team("Argentina", "J", 1, "CONMEBOL", 1),
    Team("Algeria", "J", 3, "CAF", 37),
    Team("Austria", "J", 2, "UEFA", 22),
    Team("Jordan", "J", 4, "AFC", 62),
    # Group K
    Team("Portugal", "K", 1, "UEFA", 6),
    Team("DR Congo", "K", 4, "CAF", 55),
    Team("Uzbekistan", "K", 3, "AFC", 54),
    Team("Colombia", "K", 2, "CONMEBOL", 14),
    # Group L
    Team("England", "L", 1, "UEFA", 4),
    Team("Croatia", "L", 2, "UEFA", 10),
    Team("Ghana", "L", 4, "CAF", 73),
    Team("Panama", "L", 3, "CONCACAF", 32),
]

GROUPS = sorted({t.group for t in TEAMS})


def teams_by_group(group: str) -> list[Team]:
    return [t for t in TEAMS if t.group == group]


def team_by_name(name: str) -> Team:
    for t in TEAMS:
        if t.name == name:
            return t
    raise KeyError(name)


def group_fixtures() -> list[dict]:
    """Generate the 72 group-stage matches as a round robin per group.

    Each group of four produces six matches. Matchday ordering follows the
    standard 1v2/3v4, 1v3/2v4, 1v4/2v3 pattern used by FIFA. Host advantage is
    flagged when a host nation plays, since hosts play their group games in their
    own country.
    """
    fixtures: list[dict] = []
    match_id = 0
    # standard round-robin matchday schedule by within-group seed index 0..3
    schedule = [
        (1, (0, 1), (2, 3)),
        (2, (0, 2), (3, 1)),
        (3, (3, 0), (1, 2)),
    ]
    for g in GROUPS:
        gteams = teams_by_group(g)
        # order by pot so index 0 is the seeded (pot 1) team
        gteams = sorted(gteams, key=lambda t: t.pot)
        for matchday, pair_a, pair_b in schedule:
            for (i, j) in (pair_a, pair_b):
                home, away = gteams[i], gteams[j]
                fixtures.append(
                    {
                        "id": f"G{match_id:02d}",
                        "stage": "group",
                        "group": g,
                        "matchday": matchday,
                        "home": home.name,
                        "away": away.name,
                        # host advantage applies to the host nation in its own country
                        "host_home": home.host,
                        "host_away": away.host,
                    }
                )
                match_id += 1
    return fixtures


def sanity_check() -> None:
    """Assert the field is well formed: 48 teams, 12 groups of 4, valid pots."""
    assert len(TEAMS) == 48, f"expected 48 teams, got {len(TEAMS)}"
    assert len(GROUPS) == 12, f"expected 12 groups, got {len(GROUPS)}"
    for g in GROUPS:
        gt = teams_by_group(g)
        assert len(gt) == 4, f"group {g} has {len(gt)} teams"
        assert sorted(t.pot for t in gt) == [1, 2, 3, 4], f"group {g} pots {[t.pot for t in gt]}"
    hosts = [t.name for t in TEAMS if t.host]
    assert set(hosts) == {"Mexico", "Canada", "United States"}, hosts
    # each pot has exactly 12 teams
    for p in (1, 2, 3, 4):
        assert sum(1 for t in TEAMS if t.pot == p) == 12, f"pot {p} size wrong"
    # 72 group fixtures, every intra-group pair once
    fx = group_fixtures()
    assert len(fx) == 72, f"expected 72 fixtures, got {len(fx)}"
    for g in GROUPS:
        pairs = {
            frozenset((m["home"], m["away"]))
            for m in fx
            if m["group"] == g
        }
        expected = {frozenset(c) for c in combinations([t.name for t in teams_by_group(g)], 2)}
        assert pairs == expected, f"group {g} fixtures incomplete"


if __name__ == "__main__":
    sanity_check()
    print("teams.py sanity check passed: 48 teams, 12 groups, 72 fixtures")
