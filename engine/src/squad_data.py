"""Designated penalty takers per team.

The squads themselves are real players parsed from the official 2026 squad lists
in ``real_squads.py``. This module only carries the one piece of judgement the
source data does not encode: who takes the penalties. If a designated taker is in
the projected eleven they are used, otherwise the model falls back to the team's
most likely scorer.
"""

from __future__ import annotations

PENALTY_TAKERS: dict[str, str] = {
    "Argentina": "Lionel Messi",
    "France": "Kylian Mbappe",
    "England": "Harry Kane",
    "Spain": "Mikel Oyarzabal",
    "Portugal": "Cristiano Ronaldo",
    "Brazil": "Vinicius Junior",
    "Netherlands": "Memphis Depay",
    "Belgium": "Kevin De Bruyne",
    "Germany": "Kai Havertz",
    "Norway": "Erling Haaland",
    "Egypt": "Mohamed Salah",
    "Croatia": "Luka Modric",
    "Uruguay": "Federico Valverde",
    "Colombia": "James Rodriguez",
    "Mexico": "Raul Jimenez",
    "United States": "Christian Pulisic",
    "Canada": "Jonathan David",
    "Morocco": "Achraf Hakimi",
    "Japan": "Takefusa Kubo",
    "South Korea": "Son Heung-min",
    "Senegal": "Sadio Mane",
    "Switzerland": "Granit Xhaka",
}
