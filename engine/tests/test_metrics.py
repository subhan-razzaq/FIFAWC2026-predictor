"""Tests for the scoring-rule metrics against known values."""

from __future__ import annotations

import numpy as np

from validate.metrics import brier_score, log_loss, ranked_probability_score


def test_perfect_forecast_scores_zero():
    probs = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
    outcomes = np.array([0, 2])
    assert ranked_probability_score(probs, outcomes) == 0.0
    assert brier_score(probs, outcomes) == 0.0
    assert log_loss(probs, outcomes) < 1e-9


def test_rps_rewards_nearby_mass():
    # truth is a home win (0). Calling a draw is less wrong than calling away.
    near = np.array([[0.0, 1.0, 0.0]])  # all mass on draw
    far = np.array([[0.0, 0.0, 1.0]])   # all mass on away win
    out = np.array([0])
    assert ranked_probability_score(near, out) < ranked_probability_score(far, out)


def test_rps_known_value():
    # single match, even forecast, home win
    probs = np.array([[1 / 3, 1 / 3, 1 / 3]])
    out = np.array([0])
    # cdf pred = [1/3, 2/3], cdf obs = [1, 1] -> ((1/3-1)^2 + (2/3-1)^2)/2
    expected = ((1 / 3 - 1) ** 2 + (2 / 3 - 1) ** 2) / 2
    assert abs(ranked_probability_score(probs, out) - expected) < 1e-12


def test_uniform_brier_value():
    probs = np.full((10, 3), 1 / 3)
    out = np.zeros(10, dtype=int)
    # (1/3-1)^2 + (1/3)^2 + (1/3)^2 = 4/9 + 1/9 + 1/9 = 6/9 = 0.6667
    assert abs(brier_score(probs, out) - 2 / 3) < 1e-9
