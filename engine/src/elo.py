"""International Elo, computed from the results history.

We compute Elo ourselves from the martj42 results rather than scraping
eloratings.net, so the prior is fully reproducible and can be evaluated "as of"
any date for an honest backtest. The update rule is the World Football Elo
system used by eloratings.net:

    R' = R + K * G * (W - We)

    We = 1 / (1 + 10 ** (-dr / 400))          expected score
    dr = R_home - R_away + home_field          rating difference
    G  = goal-difference multiplier            (bigger wins move ratings more)
    K  = base weight by match importance

This Elo serves two roles. It is the rating *prior* that anchors teams with few
recent matches in the Dixon-Coles blend, and, paired with a fitted ordered-logit
outcome model, it is the Elo-only *baseline* the full model must beat on RPS.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize

INITIAL_RATING = 1500.0
HOME_FIELD = 100.0  # Elo points added to the non-neutral home side

# Base K by competition importance, matched to the eloratings.net weights.
_TOURNAMENT_K = {
    "FIFA World Cup": 60.0,
    "Confederations Cup": 50.0,
    "UEFA Euro": 50.0,
    "Copa America": 50.0,
    "African Cup of Nations": 50.0,
    "AFC Asian Cup": 50.0,
    "Gold Cup": 50.0,
    "CONCACAF Championship": 50.0,
    "Oceania Nations Cup": 50.0,
    "UEFA Nations League": 40.0,
    "FIFA World Cup qualification": 40.0,
    "UEFA Euro qualification": 40.0,
    "Copa America qualification": 40.0,
    "African Cup of Nations qualification": 40.0,
    "AFC Asian Cup qualification": 40.0,
}
_DEFAULT_TOURNAMENT_K = 30.0
_FRIENDLY_K = 20.0


def _base_k(tournament: str) -> float:
    if tournament == "Friendly":
        return _FRIENDLY_K
    return _TOURNAMENT_K.get(tournament, _DEFAULT_TOURNAMENT_K)


def _goal_multiplier(margin: int) -> float:
    """eloratings.net goal-difference multiplier G."""
    if margin <= 1:
        return 1.0
    if margin == 2:
        return 1.5
    return (11.0 + margin) / 8.0


def compute_elo(df: pd.DataFrame, until: pd.Timestamp | None = None) -> dict[str, float]:
    """Run the Elo updater over the results and return final ratings per team.

    If ``until`` is given, only matches strictly before that date are processed,
    which is what the backtest uses so no future information leaks in.
    """
    if until is not None:
        df = df[df["date"] < until]
    ratings: dict[str, float] = {}

    home = df["home_team"].to_numpy()
    away = df["away_team"].to_numpy()
    hs = df["home_score"].to_numpy()
    as_ = df["away_score"].to_numpy()
    neutral = df["neutral"].to_numpy()
    tour = df["tournament"].to_numpy()

    for i in range(len(df)):
        h, a = home[i], away[i]
        rh = ratings.get(h, INITIAL_RATING)
        ra = ratings.get(a, INITIAL_RATING)

        hf = 0.0 if neutral[i] else HOME_FIELD
        dr = rh - ra + hf
        we = 1.0 / (1.0 + 10.0 ** (-dr / 400.0))

        if hs[i] > as_[i]:
            w = 1.0
        elif hs[i] < as_[i]:
            w = 0.0
        else:
            w = 0.5

        k = _base_k(str(tour[i])) * _goal_multiplier(abs(int(hs[i]) - int(as_[i])))
        delta = k * (w - we)
        ratings[h] = rh + delta
        ratings[a] = ra - delta

    return ratings


# --- Elo-only outcome model (the baseline to beat) ----------------------------
#
# Elo gives an expected score in [0, 1] but not a win/draw/loss split. We fit an
# ordered-logit on the rating difference: a single feature, two cutpoints, with
# the draw band carved out symmetrically. This is the standard, fair way to turn
# Elo into 1X2 probabilities, and it is genuinely "Elo only".


def _ordered_logit_probs(dr: np.ndarray, beta: float, c: float) -> np.ndarray:
    """Return an (n, 3) array of [home_win, draw, away_win] probabilities.

    ``c`` is the half-width of the draw band on the latent scale. The latent
    variable is ``beta * dr``; P(away) below ``-c``, P(home) above ``+c``.
    """
    z = beta * dr
    p_home = 1.0 / (1.0 + np.exp(-(z - c)))
    p_not_away = 1.0 / (1.0 + np.exp(-(z + c)))
    p_away = 1.0 - p_not_away
    p_draw = p_not_away - p_home
    p_draw = np.clip(p_draw, 1e-9, None)
    out = np.stack([p_home, p_draw, p_away], axis=1)
    return out / out.sum(axis=1, keepdims=True)


def fit_elo_outcome_model(dr: np.ndarray, outcome: np.ndarray) -> tuple[float, float]:
    """Fit (beta, c) by maximum likelihood. ``outcome`` is 0 home, 1 draw, 2 away."""

    def nll(params: np.ndarray) -> float:
        beta, c = params
        if c <= 0:
            return 1e12
        p = _ordered_logit_probs(dr, beta, c)
        idx = outcome.astype(int)
        chosen = p[np.arange(len(idx)), idx]
        return float(-np.log(np.clip(chosen, 1e-12, None)).sum())

    res = minimize(nll, x0=np.array([0.005, 0.4]), method="Nelder-Mead",
                   options={"xatol": 1e-6, "fatol": 1e-6, "maxiter": 5000})
    beta, c = res.x
    return float(beta), float(abs(c))


@dataclass
class EloBaseline:
    """Fitted Elo-only 1X2 model, used as the baseline in validation."""

    beta: float
    c: float

    def probs(self, rating_home: float, rating_away: float, home_field: float = 0.0) -> np.ndarray:
        dr = np.array([rating_home - rating_away + home_field])
        return _ordered_logit_probs(dr, self.beta, self.c)[0]
