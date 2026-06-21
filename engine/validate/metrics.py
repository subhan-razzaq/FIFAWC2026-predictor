"""Proper scoring rules for 1X2 (home win / draw / away win) forecasts.

Conventions. Probability vectors are ordered [home_win, draw, away_win]. Outcomes
are 0 home win, 1 draw, 2 away win. All three metrics are negatively oriented:
lower is better.
"""

from __future__ import annotations

import numpy as np


def _onehot(outcomes: np.ndarray) -> np.ndarray:
    o = np.zeros((len(outcomes), 3))
    o[np.arange(len(outcomes)), outcomes] = 1.0
    return o


def ranked_probability_score(probs: np.ndarray, outcomes: np.ndarray) -> float:
    """Mean Ranked Probability Score, the standard metric for football forecasts.

    RPS rewards forecasts that put probability mass *near* the true ordered
    outcome, so calling a draw when the truth is a home win is penalised less than
    calling an away win. For r ordered categories,

        RPS = 1/(r-1) * sum_{i=1}^{r-1} ( CDF_pred_i - CDF_obs_i )^2
    """
    obs = _onehot(outcomes)
    cdf_p = np.cumsum(probs, axis=1)
    cdf_o = np.cumsum(obs, axis=1)
    # only the first r-1 cumulative terms matter (the last is 1 for both)
    sq = (cdf_p[:, :-1] - cdf_o[:, :-1]) ** 2
    return float(sq.sum(axis=1).mean() / (probs.shape[1] - 1))


def brier_score(probs: np.ndarray, outcomes: np.ndarray) -> float:
    """Mean multi-class Brier score: average squared error across the 3 classes."""
    obs = _onehot(outcomes)
    return float(((probs - obs) ** 2).sum(axis=1).mean())


def log_loss(probs: np.ndarray, outcomes: np.ndarray) -> float:
    """Mean negative log-likelihood of the realised outcomes."""
    p = np.clip(probs[np.arange(len(outcomes)), outcomes], 1e-15, 1.0)
    return float(-np.log(p).mean())


def all_metrics(probs: np.ndarray, outcomes: np.ndarray) -> dict[str, float]:
    return {
        "rps": ranked_probability_score(probs, outcomes),
        "brier": brier_score(probs, outcomes),
        "log_loss": log_loss(probs, outcomes),
        "n": int(len(outcomes)),
    }
