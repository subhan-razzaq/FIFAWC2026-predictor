"""Calibration of the forecast probabilities.

A forecast is calibrated when events it calls at p actually happen about p of the
time. We pool every predicted probability from the gate tournaments across the
three outcome classes, treat each as a binary prediction (did that outcome
happen), bin by predicted probability, and compare the mean predicted probability
to the observed frequency in each bin. The reliability bins and the Expected
Calibration Error are exported so the methodology page can draw the curve, and a
PNG is written to ``reports`` for local inspection.
"""

from __future__ import annotations

import json

import numpy as np

from src.config import REPORTS_DIR, ensure_dirs
from src.ingest import load_results
from src.ratings import BlendWeights
from validate.backtest import GATE, Prepared


def calibration_curve(probs: np.ndarray, outcomes: np.ndarray, n_bins: int = 10) -> dict:
    """Pool the 3 class probabilities into one reliability diagram."""
    p = probs.reshape(-1)
    obs = np.zeros_like(probs)
    obs[np.arange(len(outcomes)), outcomes] = 1.0
    y = obs.reshape(-1)

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    bins = []
    ece = 0.0
    n = len(p)
    for i in range(n_bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (p >= lo) & (p < hi) if i < n_bins - 1 else (p >= lo) & (p <= hi)
        count = int(mask.sum())
        if count == 0:
            bins.append({"bin": [round(lo, 2), round(hi, 2)], "mean_pred": None,
                         "obs_freq": None, "count": 0})
            continue
        mean_pred = float(p[mask].mean())
        obs_freq = float(y[mask].mean())
        bins.append({"bin": [round(lo, 2), round(hi, 2)], "mean_pred": mean_pred,
                     "obs_freq": obs_freq, "count": count})
        ece += count / n * abs(mean_pred - obs_freq)

    return {"bins": bins, "ece": ece, "n_predictions": n}


def gather_predictions(xi: float = 0.0012, w_elo: float = 0.30) -> tuple[np.ndarray, np.ndarray]:
    df = load_results()
    weights = BlendWeights(w_mle=1.0 - w_elo, w_elo=w_elo)
    probs, outs = [], []
    for name in GATE:
        prep = Prepared(df, name, xi, 8.0)
        probs.append(prep.model_probs(weights))
        outs.append(prep.outcomes)
    return np.vstack(probs), np.concatenate(outs)


def plot(curve: dict, path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    xs = [b["mean_pred"] for b in curve["bins"] if b["mean_pred"] is not None]
    ys = [b["obs_freq"] for b in curve["bins"] if b["mean_pred"] is not None]
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], color="#8A8F98", linestyle="--", linewidth=1, label="perfect")
    ax.plot(xs, ys, marker="o", color="#C8A24B", linewidth=2, label="model")
    ax.set_xlabel("predicted probability")
    ax.set_ylabel("observed frequency")
    ax.set_title(f"Calibration (ECE = {curve['ece']:.3f})")
    ax.legend()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def main() -> int:
    ensure_dirs()
    probs, outs = gather_predictions()
    curve = calibration_curve(probs, outs, n_bins=10)
    (REPORTS_DIR / "calibration.json").write_text(json.dumps(curve, indent=2), encoding="utf-8")
    plot(curve, REPORTS_DIR / "calibration.png")
    print(f"calibration ECE = {curve['ece']:.4f} over {curve['n_predictions']} predictions")
    print(f"wrote {REPORTS_DIR / 'calibration.json'} and calibration.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
