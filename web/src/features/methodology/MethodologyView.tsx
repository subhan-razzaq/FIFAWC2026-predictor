import { useStore } from "../../store/store";
import { CalibrationChart } from "./CalibrationChart";
import "./methodology.css";

interface Metric {
  rps: number;
  brier: number;
  log_loss: number;
  n: number;
}
interface Validation {
  combined: { model: Metric; elo_only: Metric; uniform: Metric };
  per_tournament: Record<string, { model: Metric; elo_only: Metric; uniform: Metric }>;
  beats_elo_on_rps: boolean;
  calibration: { bins: { bin: [number, number]; mean_pred: number | null; obs_freq: number | null; count: number }[]; ece: number; n_predictions: number };
  hyperparameters: Record<string, number>;
}

export function MethodologyView() {
  const model = useStore((s) => s.model);
  if (!model) return null;
  const v = model.validation as unknown as Validation;
  const c = v.combined;
  const edge = ((c.elo_only.rps - c.model.rps) / c.elo_only.rps) * 100;

  return (
    <div className="methodology">
      <div className="wrap">
        <div className="section-head">
          <div>
            <div className="eyebrow">Methodology</div>
            <h2>How the model works, and how we know it works</h2>
          </div>
        </div>

        <div className="method-cols">
          <section className="method-prose">
            <h3>The goals model</h3>
            <p>
              Every match is a Dixon-Coles adjusted Poisson. Each team has an attack rating and a
              defence rating. The expected goals for the home side are exp(mu plus attack minus the
              opponent defence plus a host term), and likewise for the away side. Goals are drawn from
              that Poisson, with the Dixon-Coles correction coupling the low scores so 0-0, 1-0, 0-1 and
              1-1 are not treated as independent.
            </p>
            <p>
              The ratings are fit by maximum likelihood on real international results going back decades,
              with an exponential time decay so recent and important matches count for more. Because
              national teams play few matches, the fit is blended with two priors: an Elo rating computed
              from the same results, and a squad-quality estimate aggregated from the announced 26-player
              squads. Changing the squad in manage mode changes that aggregate, which is what moves a
              team's ratings.
            </p>
            <h3>Simulating the tournament</h3>
            <p>
              One simulation plays all 72 group matches, builds the twelve tables with the official 2026
              tie-breakers, selects the eight best third-placed teams, assembles the real Round of 32
              bracket, and plays the knockouts with extra time and a penalty shootout. The Monte Carlo
              layer repeats this thousands of times from a seed, so every run is reproducible and the
              odds are just frequencies across runs.
            </p>
            <h3>Data sources</h3>
            <ul className="method-sources">
              <li>martj42 international results, 1872 to present, the backbone for the goals fit</li>
              <li>World Football Elo, computed in-repo from those results, as the prior and the baseline</li>
              <li>The official 2026 squad lists, for the projected elevens and the scorer model</li>
            </ul>
          </section>

          <aside className="method-metrics">
            <div className="method-verdict">
              <div className="anton">{edge > 0 ? `+${edge.toFixed(1)}%` : `${edge.toFixed(1)}%`}</div>
              <p>
                better Ranked Probability Score than an Elo-only model across the 2018 and 2022 World
                Cups. {v.beats_elo_on_rps ? "The model clears its baseline." : ""}
              </p>
            </div>

            <table className="method-table mono">
              <thead>
                <tr>
                  <th></th>
                  <th>RPS</th>
                  <th>Brier</th>
                  <th>LogLoss</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Model" m={c.model} highlight />
                <Row label="Elo only" m={c.elo_only} />
                <Row label="Uniform" m={c.uniform} />
              </tbody>
            </table>
            <div className="method-note mono">
              Lower is better. Combined over {c.model.n} matches.
            </div>

            <table className="method-table mono">
              <thead>
                <tr>
                  <th>Backtest</th>
                  <th>Model RPS</th>
                  <th>Elo RPS</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(v.per_tournament).map(([name, m]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className={m.model.rps < m.elo_only.rps ? "win" : ""}>{m.model.rps.toFixed(4)}</td>
                    <td>{m.elo_only.rps.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <CalibrationChart bins={v.calibration.bins} ece={v.calibration.ece} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Row({ label, m, highlight }: { label: string; m: Metric; highlight?: boolean }) {
  return (
    <tr className={highlight ? "win" : ""}>
      <td>{label}</td>
      <td>{m.rps.toFixed(4)}</td>
      <td>{m.brier.toFixed(4)}</td>
      <td>{m.log_loss.toFixed(4)}</td>
    </tr>
  );
}
