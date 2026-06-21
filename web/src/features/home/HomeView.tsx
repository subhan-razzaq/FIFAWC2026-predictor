import { Link } from "react-router-dom";
import { useStore } from "../../store/store";
import { OddsRow } from "../../components/OddsRow";
import { CountUp } from "../../components/CountUp";
import { oddsPct, pct } from "../../lib/format";
import "./home.css";

export function HomeView() {
  const model = useStore((s) => s.model);
  const result = useStore((s) => s.result);
  const status = useStore((s) => s.status);
  const runs = useStore((s) => s.runs);
  const seedLabel = useStore((s) => s.seedLabel);
  const runSimulation = useStore((s) => s.runSimulation);

  const validation = model?.validation as
    | { combined?: { model?: { rps: number }; elo_only?: { rps: number } }; calibration?: { ece: number } }
    | undefined;
  const combined = validation?.combined;
  const edge =
    combined?.model && combined?.elo_only
      ? ((combined.elo_only.rps - combined.model.rps) / combined.elo_only.rps) * 100
      : null;

  const top = result?.teams.slice(0, 10) ?? [];
  const maxChamp = top.length ? top[0]!.champion : 1;

  return (
    <div>
      <section className="hero">
        <div className="wrap hero__inner">
          <div className="hero__copy">
            <div className="eyebrow">World Cup 2026 · 48 teams · 104 matches</div>
            <h1 className="hero__title anton">
              WHO WINS
              <br />
              THE WORLD CUP
            </h1>
            <p className="hero__lede">
              A calibrated statistical model predicts every match, simulates the whole tournament
              tens of thousands of times, and lets you take over a squad and change the outcome.
            </p>
            <div className="hero__cta">
              <button className="btn" onClick={() => void runSimulation()}>
                {status === "running" ? "Running simulation" : "Run simulation"}
              </button>
              <Link to="/bracket" className="btn btn--ghost">
                Watch the bracket
              </Link>
              <span className="mono hero__seed">seed {seedLabel}</span>
            </div>
          </div>

          <aside className="hero__odds flat-card">
            <div className="hero__odds-head">
              <span className="eyebrow">Title odds</span>
              <span className="mono" style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
                {result ? `${result.runs.toLocaleString()} runs` : `${runs.toLocaleString()} runs`}
              </span>
            </div>
            {top.length === 0 ? (
              <div className="hero__loading mono">simulating the tournament…</div>
            ) : (
              <div className="odds-list">
                {top.map((t, i) => (
                  <OddsRow key={t.team} team={t.team} group={t.group} value={t.champion} max={maxChamp} rank={i + 1} />
                ))}
              </div>
            )}
            <Link to="/predictions" className="hero__more mono">
              all 48 teams →
            </Link>
          </aside>
        </div>
      </section>

      <section className="wrap">
        <div className="cred">
          <CredStat
            big={edge !== null ? `+${edge.toFixed(1)}%` : "—"}
            label="better than Elo-only on RPS"
            sub="backtested on the 2018 and 2022 World Cups"
          />
          <CredStat
            big={validation?.calibration ? validation.calibration.ece.toFixed(3) : "—"}
            label="calibration error (ECE)"
            sub="when it says 30%, it happens about 30% of the time"
          />
          <CredStat
            big={model ? model.meta.n_fit_matches.toLocaleString() : "—"}
            label="real matches fit"
            sub="international results since 1872, time-weighted"
          />
        </div>
      </section>

      {result && (
        <section className="wrap">
          <div className="section-head">
            <h2>Most likely to advance</h2>
            <Link to="/predictions" className="mono" style={{ color: "var(--gold)" }}>
              group by group →
            </Link>
          </div>
          <div className="advance-grid">
            {[...result.teams]
              .sort((a, b) => b.advance - a.advance)
              .slice(0, 12)
              .map((t) => (
                <div key={t.team} className="advance-cell flat-card">
                  <OddsRow team={t.team} group={t.group} value={t.advance} accent="var(--mex-green)" />
                  <div className="mono advance-cell__sub">
                    win group <CountUp value={t.winGroup} format={(v) => pct(v)} /> · reach SF{" "}
                    <CountUp value={t.semi} format={oddsPct} />
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CredStat({ big, label, sub }: { big: string; label: string; sub: string }) {
  return (
    <div className="cred__stat keyline-gold">
      <div className="cred__big anton">{big}</div>
      <div className="cred__label">{label}</div>
      <div className="cred__sub mono">{sub}</div>
    </div>
  );
}
