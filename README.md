<div align="center">

<img src="assets/weltmeister.svg" alt="WELTMEISTER" width="620" />

### A calibrated prediction engine and tournament simulator for the 2026 World Cup

Predict every match. Simulate the whole tournament tens of thousands of times. Take over a squad and change how it ends.

[**Live site →**](https://weltmeister-nine.vercel.app)

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?logo=vercel&logoColor=white)

**Built by Subhan Razzaq and Youssef Khafagy**

</div>

---

## What it is

A real statistical model, not a toy. It does four things.

- **Predicts every match** with a most likely scoreline and a full win, draw, loss and scoreline distribution.
- **Predicts who scores**, attributing goals to real players in each team's projected eleven.
- **Simulates the tournament** thousands of times with a seeded Monte Carlo engine to produce title odds, per round survival odds, and a Golden Boot race.
- **Manage mode.** You take control of one team, set the lineup, formation and shape, and re run the tournament to see how far the team goes.

Everything is fit on real data, calibrated against past tournaments, and reproducible from a seed.

## The model

Each match is a **Dixon-Coles adjusted Poisson**. Every team carries an attack rating and a defence rating. The expected goals for the home side are `exp(mu + atk_home - def_away + host)`, and likewise for the away side, with the Dixon-Coles low score correction coupling the 0-0, 1-0, 0-1 and 1-1 cells so they are not treated as independent.

The ratings are fit by maximum likelihood on real international results going back to 1872, with an exponential time decay so recent and important matches count for more. Because national teams play few matches, the maximum likelihood fit is blended with two priors:

- an **Elo rating** computed in repo from the same results, which anchors teams with little recent form,
- a **squad-quality** estimate aggregated from the official 26 player squads, which is what makes manage mode meaningful.

The fit uses an analytic gradient, so it is fast and exact rather than relying on finite differences.

## Does it actually work

The engine ships its own validation. It is backtested on the 2018 and 2022 World Cups, fitting only on matches before each tournament and forecasting every game, then scored against an Elo only baseline and a uniform baseline. Lower is better on all three metrics.

| Model         |    RPS |  Brier | Log-loss |
| ------------- | -----: | -----: | -------: |
| **WELTMEISTER** | **0.2091** | **0.5901** | **1.0068** |
| Elo only      | 0.2140 | 0.5972 |   1.0131 |
| Uniform       | 0.2413 | 0.6667 |   1.0986 |

The model beats the Elo only baseline on Ranked Probability Score by **2.3 percent** across the two tournaments, and on all three metrics combined. It is well calibrated, with an expected calibration error of **0.040**, so when it says 30 percent the event happens about 30 percent of the time. The full breakdown and the reliability diagram live on the methodology page.

## The simulation

One tournament plays all 72 group matches, builds the twelve tables with the official 2026 tie breakers, selects the eight best third placed teams, assembles the real Round of 32 bracket, and plays the knockouts with extra time and a penalty shootout. The Monte Carlo layer repeats this tens of thousands of times from a seed.

The engine is pure TypeScript with a deterministic seeded generator and no dependencies in the hot loop. It runs in a Web Worker, so the interface never blocks and manage mode re sims feel instant. The same seed and the same model always produce the same bracket, which is why brackets are shareable and verifiable.

## Manage mode

Pick any of the 48 squads, arrange the eleven on a formation pitch, choose the formation, the captain and the penalty taker, and trade attack for defence with a tactical slider. The chosen eleven recomputes the team's squad-quality aggregate through the same standardized blend the engine uses, which shifts its ratings, then the tournament re runs and shows how far the team goes against the default squad baseline.

## Architecture

The heavy model fitting happens offline in Python and exports one compact data artifact. The simulation that consumes it runs in the browser, so the whole site deploys static with no backend.

```
weltmeister/
  engine/                 Python offline model
    src/ingest.py         pull and clean the data sources
    src/elo.py            World Football Elo, computed from results
    src/ratings.py        Dixon-Coles MLE with priors and analytic gradient
    src/real_squads.py    parse the official 2026 squads
    src/scorers.py        player goal share model
    src/export.py         write model.json
    validate/             backtest, metrics, calibration
  sim/                    runtime Monte Carlo, shared
    src/poisson.ts        Dixon-Coles scoreline sampling
    src/group.ts          group tables and 2026 tie breakers
    src/bracket.ts        R32 build, knockouts, extra time, penalties
    src/montecarlo.ts     N run aggregation
    src/worker.ts         Web Worker entry
  web/                    React app
    src/features/         predictions, bracket, scorers, manage, methodology
    public/data/model.json
```

## Tech stack

- **Engine** Python with numpy, pandas and scipy for the fit, the backtest and the calibration.
- **Simulation** dependency free TypeScript, a seeded Monte Carlo core in a Web Worker.
- **Web** React 18, Vite, TypeScript strict, Zustand for state, Framer Motion for the broadcast bracket reveal.
- **Deploy** Vercel, static.

## Run it locally

Requires Node 20+, pnpm, and Python 3.12 with uv.

```bash
# install the workspace
pnpm install

# run the app
pnpm dev

# run the simulation tests
pnpm --filter @weltmeister/sim test
```

Regenerate the model artifact from the engine when needed:

```bash
cd engine
uv venv && uv pip install numpy pandas scipy requests matplotlib pytest ruff
.venv/bin/python -m src.export                       # writes web/public/data/model.json
.venv/bin/python -m validate.backtest --save         # the validation report
```

## Data sources

- The martj42 international results dataset, 1872 to present, the backbone for the goals fit.
- World Football Elo, computed in repo from those results, used as a prior and as the baseline.
- The official 2026 squad lists, for the projected elevens and the scorer model.

Everything is pulled once, cached locally, and frozen. Nothing is fetched at page load.

## Note

An independent portfolio project. Not affiliated with or endorsed by FIFA. The colours, geometry and badges are original work in the spirit of the 2026 identity, not official marks.
