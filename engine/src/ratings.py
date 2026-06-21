"""The goals model: a Dixon-Coles adjusted Poisson, fit by maximum likelihood on
time-weighted international results, then blended with an Elo prior and a
squad-quality prior.

Match model (Section 3.1). Each team i has an attack rating ``atk_i`` and a
defence rating ``def_i``. For a match of home team h against away team a:

    lam_h = exp(mu + atk_h - def_a + gamma * home)     expected goals for h
    lam_a = exp(mu + atk_a - def_h)                     expected goals for a

``mu`` is the league baseline, ``gamma`` is the home/host advantage (added to the
home side only when the venue is not neutral). Goals are Poisson with these means,
with the Dixon-Coles low-score correction ``tau`` coupling the 0-0, 1-0, 0-1, and
1-1 cells so they are not treated as independent:

    P(X=x, Y=y) = tau(x, y, lam_h, lam_a, rho) * Pois(x; lam_h) * Pois(y; lam_a)

Time weighting (Section 3.2). Each historical match enters the log-likelihood with
weight ``w = exp(-xi * age_days) * competition_weight`` so recent and important
matches count for more.

The fit maximises the weighted log-likelihood with an analytic gradient (fast and
exact), under a light ridge and a mean-anchor for identifiability. The MLE ratings
are then blended with the Elo and squad-quality priors in standardized space
(Section 3.3); see :func:`blend_ratings`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.optimize import minimize

# competition weight by tournament family (Section 3.2)
_COMP_WEIGHT = {
    "FIFA World Cup": 1.0,
    "UEFA Euro": 1.0,
    "Copa America": 1.0,
    "African Cup of Nations": 0.95,
    "AFC Asian Cup": 0.95,
    "Gold Cup": 0.9,
    "Confederations Cup": 0.95,
    "UEFA Nations League": 0.9,
    "FIFA World Cup qualification": 0.9,
    "UEFA Euro qualification": 0.85,
    "Copa America qualification": 0.85,
    "African Cup of Nations qualification": 0.8,
    "AFC Asian Cup qualification": 0.8,
    "Friendly": 0.5,
}
_DEFAULT_COMP_WEIGHT = 0.7


def competition_weight(tournament: str) -> float:
    return _COMP_WEIGHT.get(tournament, _DEFAULT_COMP_WEIGHT)


@dataclass
class RatingFit:
    """Result of the Dixon-Coles MLE fit."""

    mu: float
    gamma: float
    rho: float
    teams: list[str]
    atk: dict[str, float]
    deff: dict[str, float]
    n_matches: int
    xi: float
    converged: bool = True
    meta: dict = field(default_factory=dict)


def _prepare(df: pd.DataFrame, as_of: pd.Timestamp, xi: float, window_years: float):
    """Slice the training window and pack arrays for the optimiser."""
    start = as_of - pd.Timedelta(days=int(window_years * 365.25))
    d = df[(df["date"] < as_of) & (df["date"] >= start)].copy()

    teams = sorted(set(d["home_team"]) | set(d["away_team"]))
    idx = {t: i for i, t in enumerate(teams)}
    hi = d["home_team"].map(idx).to_numpy()
    ai = d["away_team"].map(idx).to_numpy()
    x = d["home_score"].to_numpy().astype(np.int64)
    y = d["away_score"].to_numpy().astype(np.int64)
    home = (~d["neutral"].to_numpy()).astype(np.float64)  # gamma applies to non-neutral home

    age_days = (as_of - d["date"]).dt.days.to_numpy().astype(np.float64)
    comp = d["tournament"].map(competition_weight).fillna(_DEFAULT_COMP_WEIGHT).to_numpy()
    w = np.exp(-xi * age_days) * comp

    return teams, idx, hi, ai, x, y, home, w


def _tau_and_grad(x: np.ndarray, y: np.ndarray, lam_h: np.ndarray, lam_a: np.ndarray, rho: float):
    """Dixon-Coles tau and its partials wrt lam_h, lam_a, rho, per match (vectorized).

    Only the four low-score cells are corrected; everywhere else tau = 1.
    """
    tau = np.ones_like(lam_h)
    dt_dh = np.zeros_like(lam_h)
    dt_da = np.zeros_like(lam_h)
    dt_dr = np.zeros_like(lam_h)

    m00 = (x == 0) & (y == 0)
    m01 = (x == 0) & (y == 1)
    m10 = (x == 1) & (y == 0)
    m11 = (x == 1) & (y == 1)

    tau[m00] = 1.0 - lam_h[m00] * lam_a[m00] * rho
    dt_dh[m00] = -lam_a[m00] * rho
    dt_da[m00] = -lam_h[m00] * rho
    dt_dr[m00] = -lam_h[m00] * lam_a[m00]

    tau[m01] = 1.0 + lam_h[m01] * rho
    dt_dh[m01] = rho
    dt_dr[m01] = lam_h[m01]

    tau[m10] = 1.0 + lam_a[m10] * rho
    dt_da[m10] = rho
    dt_dr[m10] = lam_a[m10]

    tau[m11] = 1.0 - rho
    dt_dr[m11] = -1.0

    return tau, dt_dh, dt_da, dt_dr


def _objective(params, n, hi, ai, x, y, home, w, ridge, anchor):
    """Negative weighted log-likelihood plus regularization, with gradient."""
    mu = params[0]
    gamma = params[1]
    rho = params[2]
    atk = params[3 : 3 + n]
    deff = params[3 + n : 3 + 2 * n]

    log_lam_h = mu + atk[hi] - deff[ai] + gamma * home
    log_lam_a = mu + atk[ai] - deff[hi]
    lam_h = np.exp(log_lam_h)
    lam_a = np.exp(log_lam_a)

    tau, dt_dh, dt_da, dt_dr = _tau_and_grad(x, y, lam_h, lam_a, rho)
    tau_safe = np.clip(tau, 1e-9, None)

    # weighted log-likelihood (constant log-factorial terms dropped, they do not
    # affect the optimum)
    ll = w * (np.log(tau_safe) + x * log_lam_h - lam_h + y * log_lam_a - lam_a)
    nll = -ll.sum()

    # d nll / d lam_h and d lam_a (then chain through exp to the log params)
    dll_dlamh = w * (dt_dh / tau_safe + x / lam_h - 1.0)
    dll_dlama = w * (dt_da / tau_safe + y / lam_a - 1.0)
    g_loglamh = -dll_dlamh * lam_h  # negative because we minimise nll
    g_loglama = -dll_dlama * lam_a

    grad = np.zeros_like(params)
    # mu enters both lambdas
    grad[0] = g_loglamh.sum() + g_loglama.sum()
    # gamma enters lam_h only, scaled by home flag
    grad[1] = (g_loglamh * home).sum()
    # rho
    grad[2] = -(w * (dt_dr / tau_safe)).sum()

    g_atk = np.zeros(n)
    g_def = np.zeros(n)
    # atk_h and -def_a affect lam_h; atk_a and -def_h affect lam_a
    np.add.at(g_atk, hi, g_loglamh)
    np.add.at(g_def, ai, -g_loglamh)
    np.add.at(g_atk, ai, g_loglama)
    np.add.at(g_def, hi, -g_loglama)

    # ridge shrinkage and mean anchor for identifiability
    nll += ridge * (atk @ atk + deff @ deff)
    g_atk += 2.0 * ridge * atk
    g_def += 2.0 * ridge * deff

    sa, sd = atk.sum(), deff.sum()
    nll += anchor * (sa * sa + sd * sd)
    g_atk += 2.0 * anchor * sa
    g_def += 2.0 * anchor * sd

    grad[3 : 3 + n] = g_atk
    grad[3 + n : 3 + 2 * n] = g_def
    return nll, grad


def fit_dixon_coles(
    df: pd.DataFrame,
    as_of: pd.Timestamp,
    xi: float = 0.0019,
    window_years: float = 8.0,
    ridge: float = 0.05,
    anchor: float = 1.0,
) -> RatingFit:
    """Fit the Dixon-Coles model on results strictly before ``as_of``.

    ``xi`` is the daily time-decay rate (default half-life ~ 1 year). ``ridge``
    lightly shrinks ratings toward zero so teams with few matches are not extreme.
    """
    teams, idx, hi, ai, x, y, home, w = _prepare(df, as_of, xi, window_years)
    n = len(teams)

    x0 = np.zeros(3 + 2 * n)
    x0[0] = np.log(max(1e-3, (x.mean() + y.mean()) / 2.0))  # mu near mean goals
    x0[1] = 0.2  # home advantage start
    x0[2] = -0.05  # rho start

    res = minimize(
        _objective,
        x0,
        args=(n, hi, ai, x, y, home, w, ridge, anchor),
        jac=True,
        method="L-BFGS-B",
        options={"maxiter": 500, "maxfun": 50000, "ftol": 1e-9, "gtol": 1e-6},
    )

    p = res.x
    atk = {t: float(p[3 + i]) for i, t in enumerate(teams)}
    deff = {t: float(p[3 + n + i]) for i, t in enumerate(teams)}
    return RatingFit(
        mu=float(p[0]),
        gamma=float(p[1]),
        rho=float(p[2]),
        teams=teams,
        atk=atk,
        deff=deff,
        n_matches=len(x),
        xi=xi,
        converged=bool(res.success),
        meta={"nll": float(res.fun), "as_of": str(as_of.date())},
    )


# --- prior blending (Section 3.3) --------------------------------------------


def _zscore(values: dict[str, float], keys: list[str]) -> dict[str, float]:
    arr = np.array([values[k] for k in keys], dtype=float)
    mu, sd = arr.mean(), arr.std()
    sd = sd if sd > 1e-9 else 1.0
    return {k: (values[k] - mu) / sd for k in keys}


@dataclass
class BlendWeights:
    """Weights for the overall-strength and attack/defence-tilt blends.

    The overall weights sum to 1 across the active priors; the tilt is data plus
    optional squad information, since Elo has no attack/defence split.
    """

    w_mle: float = 0.6
    w_elo: float = 0.4
    w_squad: float = 0.0
    w_mle_tilt: float = 0.8
    w_squad_tilt: float = 0.2
    tilt_shrink: float = 0.9


def blend_ratings(
    fit: RatingFit,
    elo: dict[str, float],
    teams: list[str],
    weights: BlendWeights,
    squad_overall: dict[str, float] | None = None,
    squad_tilt: dict[str, float] | None = None,
) -> tuple[dict[str, float], dict[str, float]]:
    """Blend MLE ratings with the Elo prior (and optional squad prior) for the
    given ``teams``. Returns blended (atk, def) on the MLE log-goal scale.

    Strength and tilt are blended in standardized space, then mapped back onto the
    scale and spread that the data produced, so the resulting lambdas stay
    realistic. Elo informs only overall strength; the attack/defence split comes
    from the data and, optionally, the squad shape.
    """
    rated = [t for t in teams if t in fit.atk]
    overall_mle = {t: fit.atk[t] + fit.deff[t] for t in rated}
    tilt_mle = {t: fit.atk[t] - fit.deff[t] for t in rated}

    z_overall = _zscore(overall_mle, rated)
    z_elo = _zscore({t: elo.get(t, np.mean(list(elo.values()))) for t in rated}, rated)
    z_tilt = _zscore(tilt_mle, rated)

    use_squad = squad_overall is not None and weights.w_squad > 0
    if use_squad:
        z_sq_overall = _zscore({t: squad_overall.get(t, 0.0) for t in rated}, rated)
        z_sq_tilt = _zscore({t: (squad_tilt or {}).get(t, 0.0) for t in rated}, rated)

    arr_overall = np.array([overall_mle[t] for t in rated])
    base_mean, base_std = arr_overall.mean(), arr_overall.std()
    arr_tilt = np.array([tilt_mle[t] for t in rated])
    tilt_mean, tilt_std = arr_tilt.mean(), arr_tilt.std()

    atk_out: dict[str, float] = {}
    def_out: dict[str, float] = {}
    for t in rated:
        zo = weights.w_mle * z_overall[t] + weights.w_elo * z_elo[t]
        zt = weights.w_mle_tilt * z_tilt[t]
        if use_squad:
            zo += weights.w_squad * z_sq_overall[t]
            zt += weights.w_squad_tilt * z_sq_tilt[t]
        overall = base_mean + zo * base_std
        tilt = (tilt_mean + zt * tilt_std) * weights.tilt_shrink
        atk_out[t] = (overall + tilt) / 2.0
        def_out[t] = (overall - tilt) / 2.0
    return atk_out, def_out


# --- match probabilities ------------------------------------------------------


def match_lambdas(
    atk_h: float, def_h: float, atk_a: float, def_a: float,
    mu: float, gamma: float, host_home: bool = False, host_away: bool = False,
) -> tuple[float, float]:
    """Expected goals for a match. Host advantage applies only to a host nation
    (neutral venue otherwise, per the 2026 rules)."""
    gh = gamma if host_home else 0.0
    ga = gamma if host_away else 0.0
    lam_h = np.exp(mu + atk_h - def_a + gh)
    lam_a = np.exp(mu + atk_a - def_h + ga)
    return float(lam_h), float(lam_a)


def _dc_tau(x: int, y: int, lam_h: float, lam_a: float, rho: float) -> float:
    if x == 0 and y == 0:
        return 1.0 - lam_h * lam_a * rho
    if x == 0 and y == 1:
        return 1.0 + lam_h * rho
    if x == 1 and y == 0:
        return 1.0 + lam_a * rho
    if x == 1 and y == 1:
        return 1.0 - rho
    return 1.0


def scoreline_matrix(lam_h: float, lam_a: float, rho: float, max_goals: int = 10) -> np.ndarray:
    """Full Dixon-Coles scoreline probability matrix P[x, y]."""
    xs = np.arange(max_goals + 1)
    fact = np.array([math.factorial(int(k)) for k in xs], dtype=float)
    ph = np.exp(-lam_h) * lam_h**xs / fact
    pa = np.exp(-lam_a) * lam_a**xs / fact
    mat = np.outer(ph, pa)
    for x, y in ((0, 0), (0, 1), (1, 0), (1, 1)):
        mat[x, y] *= _dc_tau(x, y, lam_h, lam_a, rho)
    mat /= mat.sum()
    return mat


def outcome_probs(lam_h: float, lam_a: float, rho: float, max_goals: int = 10) -> tuple[float, float, float]:
    """Return (home_win, draw, away_win) from the scoreline matrix."""
    mat = scoreline_matrix(lam_h, lam_a, rho, max_goals)
    home = np.tril(mat, -1).sum()  # x > y
    draw = np.trace(mat)
    away = np.triu(mat, 1).sum()  # y > x
    return float(home), float(draw), float(away)
