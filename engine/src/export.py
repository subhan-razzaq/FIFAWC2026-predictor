"""Assemble ``web/public/data/model.json``: the single artifact the browser
simulation consumes.

This wires the whole offline pipeline together. It fits the Dixon-Coles model as
of the snapshot date, blends in the Elo and squad-quality priors, attaches the
projected lineups and the scorer model, lays out the 72 group fixtures, and folds
in the validation summary so the methodology page can render the numbers without
recomputing anything. It also exports the blend constants and each team's fixed
prior components so manage mode can recompute a team's ratings live from a custom
eleven, entirely in the browser.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from src.config import (
    MODEL_JSON,
    SNAPSHOT_DATE,
    STATIC_DIR,
    ensure_dirs,
)
from src.elo import compute_elo
from src.ingest import load_results
from src.lineups import squad_quality
from src.ratings import BlendWeights, blend_ratings, fit_dixon_coles
from src.scorers import team_scorer_model
from src.teams import TEAMS, group_fixtures, sanity_check
from src.config import HOSTS

# tuned on the WC2018/WC2022 backtest (see validate/backtest.py --tune)
MODEL_XI = 0.0012
WINDOW_YEARS = 8.0
W_ELO = 0.30
W_SQUAD = 0.15          # modest: the validated DC+Elo core stays dominant
W_SQUAD_TILT = 0.30
TILT_SHRINK = 0.9

SOURCES = [
    "martj42 international results (1872 to present), via GitHub",
    "World Football Elo, computed from the results history",
    "Curated frozen 26-man squads with club-anchored per-90 estimates",
]


def _z(values: list[float]) -> tuple[np.ndarray, float, float]:
    arr = np.asarray(values, dtype=float)
    mean, std = arr.mean(), arr.std()
    std = std if std > 1e-9 else 1.0
    return (arr - mean) / std, float(mean), float(std)


def build_model(validation: dict | None = None) -> dict:
    sanity_check()
    ensure_dirs()
    df = load_results()
    as_of = pd.Timestamp(SNAPSHOT_DATE)

    fit = fit_dixon_coles(df, as_of, xi=MODEL_XI, window_years=WINDOW_YEARS)
    elo = compute_elo(df, until=as_of)
    squads = json.loads((STATIC_DIR / "squads_2026.json").read_text(encoding="utf-8"))

    names = [t.name for t in TEAMS]

    # default-eleven ratings via the standard blend (Elo + squad priors)
    sq_attack = {t: squad_quality(squads[t]["players"], squads[t]["projected_eleven"])[0] for t in names}
    sq_defence = {t: squad_quality(squads[t]["players"], squads[t]["projected_eleven"])[1] for t in names}

    # standardized squad components
    za, a_mean, a_std = _z([sq_attack[t] for t in names])
    zd, d_mean, d_std = _z([sq_defence[t] for t in names])
    squad_overall = {t: float(za[i] + zd[i]) for i, t in enumerate(names)}
    squad_tilt = {t: float(za[i] - zd[i]) for i, t in enumerate(names)}
    # the blend standardizes these once more; export their spread so the browser
    # manage-mode recompute reproduces the engine exactly
    sq_overall_std = float(np.std(list(squad_overall.values()))) or 1.0
    sq_tilt_std = float(np.std(list(squad_tilt.values()))) or 1.0

    weights = BlendWeights(
        w_mle=1.0 - W_ELO - W_SQUAD,
        w_elo=W_ELO,
        w_squad=W_SQUAD,
        w_mle_tilt=1.0 - W_SQUAD_TILT,
        w_squad_tilt=W_SQUAD_TILT,
        tilt_shrink=TILT_SHRINK,
    )
    atk, deff = blend_ratings(fit, elo, names, weights, squad_overall, squad_tilt)

    # fixed prior components per team, so manage mode can recompute live in the
    # browser when the squad-quality numbers change with a custom eleven
    overall_mle = {t: fit.atk[t] + fit.deff[t] for t in names if t in fit.atk}
    tilt_mle = {t: fit.atk[t] - fit.deff[t] for t in names if t in fit.atk}
    zom, base_mean, base_std = _z([overall_mle[t] for t in names])
    ztm, tilt_mean, tilt_std = _z([tilt_mle[t] for t in names])
    elo_vals = [elo.get(t, np.mean(list(elo.values()))) for t in names]
    zelo, _, _ = _z(elo_vals)

    teams_block = []
    for i, t in enumerate(TEAMS):
        n = t.name
        teams_block.append({
            "name": n,
            "group": t.group,
            "pot": t.pot,
            "confederation": t.confederation,
            "fifa_rank": t.fifa_rank,
            "host": t.host,
            "elo": round(elo.get(n, 1500.0), 1),
            "atk": round(atk[n], 4),
            "def": round(deff[n], 4),
            "rating": round(atk[n] + deff[n], 4),
            # fixed components for the manage-mode live re-blend
            "prior": {
                "z_overall_mle": round(float(zom[i]), 4),
                "z_elo": round(float(zelo[i]), 4),
                "z_tilt_mle": round(float(ztm[i]), 4),
            },
        })

    scorers_block = {t.name: team_scorer_model(squads[t.name]) for t in TEAMS}

    model = {
        "meta": {
            "name": "WELTMEISTER",
            "snapshot_date": SNAPSHOT_DATE,
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": "Dixon-Coles adjusted Poisson, MLE with time decay, blended with an Elo prior and a squad-quality prior",
            "global": {
                "mu": round(fit.mu, 5),
                "gamma_host": round(fit.gamma, 5),
                "rho": round(fit.rho, 5),
            },
            "hosts": list(HOSTS),
            "hyperparameters": {
                "xi": MODEL_XI,
                "window_years": WINDOW_YEARS,
                "w_mle": weights.w_mle,
                "w_elo": weights.w_elo,
                "w_squad": weights.w_squad,
                "w_squad_tilt": weights.w_squad_tilt,
                "tilt_shrink": weights.tilt_shrink,
            },
            # constants for the manage-mode live re-blend in the browser
            "blend": {
                "base_mean": round(base_mean, 5),
                "base_std": round(base_std, 5),
                "tilt_mean": round(tilt_mean, 5),
                "tilt_std": round(tilt_std, 5),
                "squad_attack_mean": round(a_mean, 5),
                "squad_attack_std": round(a_std, 5),
                "squad_def_mean": round(d_mean, 5),
                "squad_def_std": round(d_std, 5),
                "squad_overall_std": round(sq_overall_std, 5),
                "squad_tilt_std": round(sq_tilt_std, 5),
            },
            "format": {"n_teams": 48, "n_groups": 12, "group_size": 4, "matches": 104},
            "sources": SOURCES,
            "n_fit_matches": fit.n_matches,
            "n_fit_teams": len(fit.teams),
        },
        "validation": validation or {},
        "teams": teams_block,
        "fixtures": group_fixtures(),
        "squads": squads,
        "scorers": scorers_block,
    }
    return model


def main() -> int:
    # fresh validation summary (DC+Elo backtest, the part that can be validated)
    from validate.backtest import run as backtest_run
    from validate.calibration import calibration_curve, gather_predictions

    report = backtest_run(xi=MODEL_XI, w_elo=W_ELO)
    probs, outs = gather_predictions(xi=MODEL_XI, w_elo=W_ELO)
    curve = calibration_curve(probs, outs, n_bins=10)
    validation = {
        "combined": report["combined"],
        "per_tournament": report["per_tournament"],
        "beats_elo_on_rps": report["beats_elo_on_rps"],
        "calibration": curve,
        "hyperparameters": report["hyperparameters"],
    }

    model = build_model(validation)
    MODEL_JSON.write_text(json.dumps(model, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
    size_kb = MODEL_JSON.stat().st_size / 1024
    print(f"wrote {MODEL_JSON} ({size_kb:.0f} KB)")
    print(f"  teams={len(model['teams'])} fixtures={len(model['fixtures'])} "
          f"squads={len(model['squads'])}")
    c = validation["combined"]
    print(f"  validation: model RPS={c['model']['rps']:.4f} vs Elo RPS={c['elo_only']['rps']:.4f} "
          f"(beats Elo: {validation['beats_elo_on_rps']}), ECE={curve['ece']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
