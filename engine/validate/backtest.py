"""Backtest the goals model against real tournaments and prove it beats the
Elo-only baseline on Ranked Probability Score.

For each tournament we fit the Dixon-Coles model strictly on results before the
opening day, blend in the Elo prior, then forecast every match. The Elo-only
baseline uses the same Elo ratings fed through an ordered-logit 1X2 model fitted
on pre-tournament history. Nothing in the evaluation sees a result before it is
predicted, so the comparison is honest.

Run ``python -m validate.backtest`` for the report, ``--tune`` to sweep the time
decay and blend weight, and ``--check-baseline`` for the CI gate that fails if the
model does not beat Elo-only on RPS.
"""

from __future__ import annotations

import argparse
import json
import sys

import numpy as np
import pandas as pd

from src.config import REPORTS_DIR, ensure_dirs
from src.elo import EloBaseline, compute_elo, elo_match_features, fit_elo_outcome_model
from src.ingest import load_results
from src.ratings import BlendWeights, blend_ratings, fit_dixon_coles, match_lambdas, outcome_probs
from validate.metrics import all_metrics

# tournament name in martj42, opening day, and host (host gets home advantage)
TOURNAMENTS = {
    "WC2018": {"tournament": "FIFA World Cup", "start": "2018-06-14", "end": "2018-07-16"},
    "WC2022": {"tournament": "FIFA World Cup", "start": "2022-11-20", "end": "2022-12-19"},
    "Euro2024": {"tournament": "UEFA Euro", "start": "2024-06-14", "end": "2024-07-15"},
    "Copa2024": {"tournament": "Copa América", "start": "2024-06-20", "end": "2024-07-15"},
}
# the tournaments that gate the build (the spec's required backtest)
GATE = ("WC2018", "WC2022")


def tournament_matches(df: pd.DataFrame, spec: dict) -> pd.DataFrame:
    start = pd.Timestamp(spec["start"])
    end = pd.Timestamp(spec["end"])
    m = df[(df["tournament"] == spec["tournament"]) & (df["date"] >= start) & (df["date"] <= end)]
    return m.reset_index(drop=True)


def _outcomes(m: pd.DataFrame) -> np.ndarray:
    out = np.where(m["home_score"] > m["away_score"], 0,
                   np.where(m["home_score"] < m["away_score"], 2, 1))
    return out.astype(int)


class Prepared:
    """Everything needed to score a tournament for any blend weight."""

    def __init__(self, df: pd.DataFrame, name: str, xi: float, window_years: float):
        spec = TOURNAMENTS[name]
        self.name = name
        self.start = pd.Timestamp(spec["start"])
        self.matches = tournament_matches(df, spec)
        self.outcomes = _outcomes(self.matches)

        # model fit, leak-free
        self.fit = fit_dixon_coles(df, self.start, xi=xi, window_years=window_years)
        self.elo = compute_elo(df, until=self.start)

        # Elo-only baseline: fit the ordered-logit on the prior 10 years of matches
        since = self.start - pd.Timedelta(days=int(10 * 365.25))
        dr, out = elo_match_features(df, until=self.start, since=since)
        beta, c = fit_elo_outcome_model(dr, out)
        self.baseline = EloBaseline(beta=beta, c=c)

    def model_probs(self, weights: BlendWeights) -> np.ndarray:
        teams = sorted(set(self.matches["home_team"]) | set(self.matches["away_team"]))
        atk, deff = blend_ratings(self.fit, self.elo, teams, weights)
        mean_atk = np.mean(list(atk.values())) if atk else 0.0
        mean_def = np.mean(list(deff.values())) if deff else 0.0
        rows = []
        for _, r in self.matches.iterrows():
            h, a = r["home_team"], r["away_team"]
            ah, dh = atk.get(h, mean_atk), deff.get(h, mean_def)
            aa, da = atk.get(a, mean_atk), deff.get(a, mean_def)
            host_home = not bool(r["neutral"])  # recorded home side had home advantage
            lh, la = match_lambdas(ah, dh, aa, da, self.fit.mu, self.fit.gamma, host_home, False)
            rows.append(outcome_probs(lh, la, self.fit.rho))
        return np.array(rows)

    def baseline_probs(self) -> np.ndarray:
        from src.elo import HOME_FIELD
        rows = []
        for _, r in self.matches.iterrows():
            hf = 0.0 if bool(r["neutral"]) else HOME_FIELD
            rh = self.elo.get(r["home_team"], 1500.0)
            ra = self.elo.get(r["away_team"], 1500.0)
            rows.append(self.baseline.probs(rh, ra, hf))
        return np.array(rows)

    def uniform_probs(self) -> np.ndarray:
        return np.full((len(self.matches), 3), 1.0 / 3.0)


def run(xi: float = 0.0019, w_elo: float = 0.4, window_years: float = 8.0,
        names: tuple[str, ...] = GATE) -> dict:
    """Run the backtest and return a structured report."""
    df = load_results()
    weights = BlendWeights(w_mle=1.0 - w_elo, w_elo=w_elo)

    per_tournament = {}
    pooled = {"model": [], "elo": [], "uniform": [], "outcomes": []}
    for name in names:
        prep = Prepared(df, name, xi, window_years)
        mp = prep.model_probs(weights)
        bp = prep.baseline_probs()
        up = prep.uniform_probs()
        per_tournament[name] = {
            "model": all_metrics(mp, prep.outcomes),
            "elo_only": all_metrics(bp, prep.outcomes),
            "uniform": all_metrics(up, prep.outcomes),
        }
        pooled["model"].append(mp)
        pooled["elo"].append(bp)
        pooled["uniform"].append(up)
        pooled["outcomes"].append(prep.outcomes)

    out = np.concatenate(pooled["outcomes"])
    combined = {
        "model": all_metrics(np.vstack(pooled["model"]), out),
        "elo_only": all_metrics(np.vstack(pooled["elo"]), out),
        "uniform": all_metrics(np.vstack(pooled["uniform"]), out),
    }
    return {
        "hyperparameters": {"xi": xi, "w_elo": w_elo, "window_years": window_years},
        "tournaments": list(names),
        "per_tournament": per_tournament,
        "combined": combined,
        "beats_elo_on_rps": combined["model"]["rps"] < combined["elo_only"]["rps"],
    }


def tune() -> dict:
    """Small grid over time decay and blend weight, scored on the gate tournaments."""
    df = load_results()
    best = None
    grid = []
    for xi in (0.0012, 0.0019, 0.0026, 0.0034):
        preps = {n: Prepared(df, n, xi, 8.0) for n in GATE}
        out = np.concatenate([preps[n].outcomes for n in GATE])
        for w_elo in (0.2, 0.3, 0.4, 0.5, 0.6):
            weights = BlendWeights(w_mle=1.0 - w_elo, w_elo=w_elo)
            mp = np.vstack([preps[n].model_probs(weights) for n in GATE])
            rps = all_metrics(mp, out)["rps"]
            grid.append({"xi": xi, "w_elo": w_elo, "rps": rps})
            if best is None or rps < best["rps"]:
                best = {"xi": xi, "w_elo": w_elo, "rps": rps}
    return {"best": best, "grid": grid}


def _print_report(report: dict) -> None:
    print(f"\nBacktest (xi={report['hyperparameters']['xi']}, "
          f"w_elo={report['hyperparameters']['w_elo']})")
    print(f"{'tournament':<12}{'model RPS':>11}{'elo RPS':>10}{'model LL':>11}{'elo LL':>10}{'n':>5}")
    for name, m in report["per_tournament"].items():
        print(f"{name:<12}{m['model']['rps']:>11.4f}{m['elo_only']['rps']:>10.4f}"
              f"{m['model']['log_loss']:>11.4f}{m['elo_only']['log_loss']:>10.4f}{m['model']['n']:>5}")
    c = report["combined"]
    print(f"{'COMBINED':<12}{c['model']['rps']:>11.4f}{c['elo_only']['rps']:>10.4f}"
          f"{c['model']['log_loss']:>11.4f}{c['elo_only']['log_loss']:>10.4f}{c['model']['n']:>5}")
    delta = (c["elo_only"]["rps"] - c["model"]["rps"]) / c["elo_only"]["rps"] * 100
    verdict = "PASS" if report["beats_elo_on_rps"] else "FAIL"
    print(f"\nmodel beats Elo-only on RPS by {delta:.2f}%  [{verdict}]")
    print(f"uniform baseline RPS = {c['uniform']['rps']:.4f}, brier = {c['uniform']['brier']:.4f}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tune", action="store_true", help="grid search xi and w_elo")
    ap.add_argument("--check-baseline", action="store_true", help="CI gate: fail if model loses to Elo on RPS")
    ap.add_argument("--xi", type=float, default=0.0019)
    ap.add_argument("--w-elo", type=float, default=0.4)
    ap.add_argument("--save", action="store_true", help="write reports/validation.json")
    args = ap.parse_args(argv)

    if args.tune:
        res = tune()
        print("best:", res["best"])
        for row in sorted(res["grid"], key=lambda r: r["rps"])[:6]:
            print(f"  xi={row['xi']:.4f} w_elo={row['w_elo']:.2f} rps={row['rps']:.4f}")
        return 0

    report = run(xi=args.xi, w_elo=args.w_elo)
    _print_report(report)

    if args.save:
        ensure_dirs()
        (REPORTS_DIR / "validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nwrote {REPORTS_DIR / 'validation.json'}")

    if args.check_baseline and not report["beats_elo_on_rps"]:
        print("FAIL: model did not beat the Elo-only baseline on RPS", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
