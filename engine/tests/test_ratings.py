"""Tests for the Dixon-Coles fit: analytic gradient correctness, optimum sanity,
and the scoreline/outcome machinery."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.ratings import (
    _objective,
    fit_dixon_coles,
    outcome_probs,
    scoreline_matrix,
)


def _toy_arrays(seed: int = 0):
    rng = np.random.default_rng(seed)
    n = 6
    m = 200
    hi = rng.integers(0, n, m)
    ai = rng.integers(0, n, m)
    mask = hi != ai
    hi, ai = hi[mask], ai[mask]
    x = rng.poisson(1.4, len(hi)).astype(np.int64)
    y = rng.poisson(1.1, len(hi)).astype(np.int64)
    home = (rng.random(len(hi)) > 0.3).astype(float)
    w = np.exp(-0.01 * rng.random(len(hi)))
    return n, hi, ai, x, y, home, w


def test_analytic_gradient_matches_finite_difference():
    n, hi, ai, x, y, home, w = _toy_arrays()
    rng = np.random.default_rng(1)
    params = np.concatenate([[0.1, 0.25, -0.06], rng.normal(0, 0.2, 2 * n)])
    ridge, anchor = 0.05, 1.0

    f0, g = _objective(params, n, hi, ai, x, y, home, w, ridge, anchor)
    eps = 1e-6
    num = np.zeros_like(params)
    for i in range(len(params)):
        p2 = params.copy()
        p2[i] += eps
        f2, _ = _objective(p2, n, hi, ai, x, y, home, w, ridge, anchor)
        num[i] = (f2 - f0) / eps

    # analytic and numerical gradients should agree closely
    assert np.allclose(g, num, atol=1e-3, rtol=1e-3), np.max(np.abs(g - num))


def test_fit_recovers_stronger_team():
    # team A beats team B repeatedly; A should end with higher overall rating
    dates = pd.date_range("2023-01-01", periods=40, freq="7D")
    rows = []
    for d in dates:
        rows.append({"date": d, "home_team": "A", "away_team": "B",
                     "home_score": 3, "away_score": 0, "tournament": "Friendly", "neutral": True})
        rows.append({"date": d, "home_team": "B", "away_team": "C",
                     "home_score": 1, "away_score": 1, "tournament": "Friendly", "neutral": True})
        rows.append({"date": d, "home_team": "A", "away_team": "C",
                     "home_score": 2, "away_score": 0, "tournament": "Friendly", "neutral": True})
    df = pd.DataFrame(rows)
    fit = fit_dixon_coles(df, pd.Timestamp("2024-01-01"), xi=0.001, window_years=5)
    overall = {t: fit.atk[t] + fit.deff[t] for t in fit.teams}
    assert overall["A"] > overall["B"] > overall["C"] - 0.5


def test_scoreline_matrix_normalized():
    mat = scoreline_matrix(1.6, 1.1, -0.08, max_goals=12)
    assert abs(mat.sum() - 1.0) < 1e-9
    h, d, a = outcome_probs(1.6, 1.1, -0.08)
    assert abs(h + d + a - 1.0) < 1e-9
    assert h > a  # stronger expected goals at home


def test_outcome_probs_symmetry():
    h1, d1, a1 = outcome_probs(1.3, 1.3, -0.05)
    assert abs(h1 - a1) < 1e-6  # equal lambdas give symmetric win probs
