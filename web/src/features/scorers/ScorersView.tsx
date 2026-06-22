import { useMemo, useState } from "react";
import { useStore } from "../../store/store";
import { TeamBadge } from "../../components/TeamBadge";
import { CountUp } from "../../components/CountUp";
import { oddsPct } from "../../lib/format";
import "./scorers.css";

type Tab = "scorers" | "assists" | "clean";

interface Row {
  player: string;
  team: string;
  value: number;
  extra?: number; // golden boot probability for scorers
}

export function ScorersView() {
  const model = useStore((s) => s.model);
  const result = useStore((s) => s.result);
  const run = useStore((s) => s.run);
  const status = useStore((s) => s.status);
  const [tab, setTab] = useState<Tab>("scorers");

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of model?.teams ?? []) m.set(t.name, t.group);
    return m;
  }, [model]);

  const rows: Row[] = useMemo(() => {
    if (!result) return [];
    if (tab === "scorers")
      return result.scorers.slice(0, 25).map((s) => ({ player: s.player, team: s.team, value: s.expectedGoals, extra: s.goldenBootProb }));
    if (tab === "assists")
      return result.assisters.slice(0, 25).map((a) => ({ player: a.player, team: a.team, value: a.expectedAssists }));
    return result.cleanSheets.slice(0, 25).map((c) => ({ player: c.player, team: c.team, value: c.expectedCleanSheets }));
  }, [result, tab]);

  const max = rows.length ? rows[0]!.value : 1;
  const valueLabel = tab === "scorers" ? "xG" : tab === "assists" ? "xA" : "CS";
  const heading = tab === "scorers" ? "Who scores the goals" : tab === "assists" ? "Who makes the goals" : "Who keeps them out";

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Tournament stats</div>
          <h2>{heading}</h2>
        </div>
        {result && (
          <span className="mono" style={{ color: "var(--text-faint)" }}>
            expected over {result.runs.toLocaleString()} simulated tournaments
          </span>
        )}
      </div>

      <div className="stat-tabs">
        <button className={`group-tab ${tab === "scorers" ? "active" : ""}`} style={{ width: "auto", padding: "0 14px" }} onClick={() => setTab("scorers")}>
          Top scorers
        </button>
        <button className={`group-tab ${tab === "assists" ? "active" : ""}`} style={{ width: "auto", padding: "0 14px" }} onClick={() => setTab("assists")}>
          Assists
        </button>
        <button className={`group-tab ${tab === "clean" ? "active" : ""}`} style={{ width: "auto", padding: "0 14px" }} onClick={() => setTab("clean")}>
          Clean sheets
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="stat-empty flat-card">
          <p className="mono" style={{ color: "var(--text-faint)" }}>
            Run a simulation to project the tournament stats.
          </p>
          <button className="btn" onClick={() => void run(true)} disabled={status === "running"}>
            {status === "running" ? "Running" : "Run simulation"}
          </button>
        </div>
      ) : (
        <div className="scorer-list flat-card">
          <div className="scorer-row scorer-row--head mono">
            <span>#</span>
            <span>Player</span>
            <span className="scorer-row__bar-h">Expected per tournament</span>
            <span>{valueLabel}</span>
            <span>{tab === "scorers" ? "Boot" : ""}</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.player} className={`scorer-row ${i === 0 ? "lead" : ""}`}>
              <span className="mono scorer-row__rank">{i + 1}</span>
              <span className="scorer-row__who">
                <TeamBadge team={r.team} group={groupOf.get(r.team)} size={22} />
                <span>
                  <span className="scorer-row__name">{r.player}</span>
                  <span className="scorer-row__team mono">{r.team}</span>
                </span>
              </span>
              <span className="scorer-row__bar">
                <span style={{ width: `${(r.value / max) * 100}%` }} />
              </span>
              <CountUp className="mono scorer-row__xg" value={r.value} format={(v) => v.toFixed(2)} />
              <span className="mono scorer-row__boot">
                {tab === "scorers" && r.extra !== undefined ? <CountUp value={r.extra} format={oddsPct} /> : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
