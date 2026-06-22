import { useMemo, useState } from "react";
import { useStore } from "../../store/store";
import { TeamBadge } from "../../components/TeamBadge";
import { CountUp } from "../../components/CountUp";
import "./scorers.css";

type Tab = "scorers" | "assists" | "clean";

interface Row {
  player: string;
  team: string;
  value: number;
}

export function ScorersView() {
  const model = useStore((s) => s.model);
  const single = useStore((s) => s.single);
  const run = useStore((s) => s.run);
  const status = useStore((s) => s.status);
  const [tab, setTab] = useState<Tab>("scorers");

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of model?.teams ?? []) m.set(t.name, t.group);
    return m;
  }, [model]);

  // every player maps back to their squad, so we can badge the goalscorers
  const teamOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const [team, squad] of Object.entries(model?.squads ?? {})) {
      for (const p of squad.players) m.set(p.name, team);
    }
    return m;
  }, [model]);

  const rows: Row[] = useMemo(() => {
    if (!single) return [];
    const src = tab === "scorers" ? single.goals : tab === "assists" ? single.assists : single.cleanSheets;
    return Object.entries(src)
      .map(([player, value]) => ({ player, team: teamOf.get(player) ?? "", value }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 25);
  }, [single, tab, teamOf]);

  const max = rows.length ? rows[0]!.value : 1;
  const valueLabel = tab === "scorers" ? "Goals" : tab === "assists" ? "Assists" : "Sheets";
  const heading = tab === "scorers" ? "Golden Boot" : tab === "assists" ? "Playmakers" : "Clean sheets";

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Tournament stats · this run</div>
          <h2>{heading}</h2>
        </div>
        {single && (
          <span className="mono" style={{ color: "var(--text-faint)" }}>
            {single.champion} lift the trophy
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

      {!single ? (
        <div className="stat-empty flat-card">
          <p className="mono" style={{ color: "var(--text-faint)" }}>
            Run a simulation to see this tournament&rsquo;s stats.
          </p>
          <button className="btn" onClick={() => void run(true)} disabled={status === "running"}>
            {status === "running" ? "Running" : "Run simulation"}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="stat-empty flat-card">
          <p className="mono" style={{ color: "var(--text-faint)" }}>
            No {tab === "clean" ? "clean sheets" : tab} recorded in this run.
          </p>
        </div>
      ) : (
        <div className="scorer-list flat-card">
          <div className="scorer-row scorer-row--head mono">
            <span>#</span>
            <span>Player</span>
            <span className="scorer-row__bar-h">This tournament</span>
            <span>{valueLabel}</span>
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
              <CountUp className="mono scorer-row__xg" value={r.value} format={(v) => String(Math.round(v))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
