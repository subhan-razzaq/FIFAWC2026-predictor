import { Link } from "react-router-dom";
import { useStore } from "../../store/store";
import { OddsRow } from "../../components/OddsRow";
import { CountUp } from "../../components/CountUp";
import { oddsPct, pct } from "../../lib/format";
import "./home.css";

export function HomeView() {
  const model = useStore((s) => s.model);
  const result = useStore((s) => s.result);
  const single = useStore((s) => s.single);
  const status = useStore((s) => s.status);
  const runs = useStore((s) => s.runs);
  const run = useStore((s) => s.run);

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
              <button className="btn" onClick={() => void run(true)} disabled={status === "running"}>
                {status === "running" ? "Running simulation" : result ? "Run it again" : "Run simulation"}
              </button>
              <Link to="/bracket" className="btn btn--ghost">
                Watch the bracket
              </Link>
              <Link to="/manage" className="btn btn--ghost">
                Manage a nation
              </Link>
            </div>
            {single && (
              <div className="hero__thisrun">
                <span className="eyebrow">This run</span>
                <span className="anton hero__thisrun-champ">{single.champion} win it</span>
                <span className="mono hero__thisrun-sub">
                  beating {single.runnerUp} in the final · run again for a different bracket
                </span>
              </div>
            )}
          </div>

          <aside className="hero__odds flat-card">
            <div className="hero__odds-head">
              <span className="eyebrow">Title odds</span>
              <span className="mono" style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
                {result ? `${result.runs.toLocaleString()} runs` : `${runs.toLocaleString()} runs`}
              </span>
            </div>
            {top.length === 0 ? (
              <div className="hero__loading mono">
                {status === "running" ? "simulating the tournament…" : "hit run to simulate the tournament"}
              </div>
            ) : (
              <div className="odds-list">
                {top.map((t, i) => (
                  <OddsRow key={t.team} team={t.team} group={t.group} value={t.champion} max={maxChamp} rank={i + 1} />
                ))}
              </div>
            )}
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

      <section className="wrap">
        <Link to="/manage" className="manage-cta keyline-gold">
          <div className="manage-cta__copy">
            <div className="eyebrow">Manager mode</div>
            <h2 className="anton">Take charge of a nation</h2>
            <p>
              Pick your XI on a drag-and-drop pitch, set the tactics, scout every opponent, and juggle
              stamina and suspensions across the whole tournament — then get graded against what the
              model expected of your squad.
            </p>
          </div>
          <span className="manage-cta__go btn">Play the World Cup →</span>
        </Link>
      </section>

      {result && (
        <section className="wrap">
          <div className="section-head">
            <h2>Most likely to advance</h2>
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
