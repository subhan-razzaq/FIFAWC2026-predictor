import { useMemo } from "react";
import { useStore } from "../../store/store";
import { TeamBadge } from "../../components/TeamBadge";
import { CountUp } from "../../components/CountUp";
import { oddsPct } from "../../lib/format";
import "./scorers.css";

export function ScorersView() {
  const model = useStore((s) => s.model);
  const result = useStore((s) => s.result);

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of model?.teams ?? []) m.set(t.name, t.group);
    return m;
  }, [model]);

  const scorers = result?.scorers.slice(0, 25) ?? [];
  const maxGoals = scorers.length ? scorers[0]!.expectedGoals : 1;

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Golden Boot race</div>
          <h2>Who scores the goals</h2>
        </div>
        {result && (
          <span className="mono" style={{ color: "var(--text-faint)" }}>
            from {result.runs.toLocaleString()} simulated tournaments
          </span>
        )}
      </div>

      {scorers.length === 0 ? (
        <p className="mono" style={{ color: "var(--text-faint)" }}>
          Run a simulation to project the scorers.
        </p>
      ) : (
        <div className="scorer-list flat-card">
          <div className="scorer-row scorer-row--head mono">
            <span>#</span>
            <span>Player</span>
            <span className="scorer-row__bar-h">Expected goals</span>
            <span>xG</span>
            <span title="Probability of winning the Golden Boot">Boot</span>
          </div>
          {scorers.map((s, i) => (
            <div key={s.player} className={`scorer-row ${i === 0 ? "lead" : ""}`}>
              <span className="mono scorer-row__rank">{i + 1}</span>
              <span className="scorer-row__who">
                <TeamBadge team={s.team} group={groupOf.get(s.team)} size={22} />
                <span>
                  <span className="scorer-row__name">{s.player}</span>
                  <span className="scorer-row__team mono">{s.team}</span>
                </span>
              </span>
              <span className="scorer-row__bar">
                <span style={{ width: `${(s.expectedGoals / maxGoals) * 100}%` }} />
              </span>
              <CountUp className="mono scorer-row__xg" value={s.expectedGoals} format={(v) => v.toFixed(2)} />
              <CountUp className="mono scorer-row__boot" value={s.goldenBootProb} format={oddsPct} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
