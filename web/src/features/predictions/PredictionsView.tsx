import { useMemo, useState } from "react";
import type { TeamOdds } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import { MatchCard } from "./MatchCard";
import { TeamBadge } from "../../components/TeamBadge";
import { CountUp } from "../../components/CountUp";
import { oddsPct, pct } from "../../lib/format";
import "./predictions.css";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function PredictionsView() {
  const model = useStore((s) => s.model);
  const result = useStore((s) => s.result);
  const [group, setGroup] = useState("A");

  const oddsByTeam = useMemo(() => {
    const m = new Map<string, TeamOdds>();
    for (const t of result?.teams ?? []) m.set(t.team, t);
    return m;
  }, [result]);

  if (!model) return null;

  const fixtures = model.fixtures.filter((f) => f.group === group);
  const teams = model.teams.filter((t) => t.group === group);
  // order the table by advancement odds when we have them, else by model rating
  const ranked = [...teams].sort((a, b) => {
    const oa = oddsByTeam.get(a.name);
    const ob = oddsByTeam.get(b.name);
    if (oa && ob) return ob.advance - oa.advance;
    return b.rating - a.rating;
  });

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Predictions</div>
          <h2>Group {group}</h2>
        </div>
        <nav className="group-tabs" aria-label="Groups">
          {GROUPS.map((g) => (
            <button
              key={g}
              className={`group-tab ${g === group ? "active" : ""}`}
              onClick={() => setGroup(g)}
              aria-pressed={g === group}
            >
              {g}
            </button>
          ))}
        </nav>
      </div>

      <div className="predictions-grid">
        <div className="group-table flat-card">
          <div className="group-table__head mono">
            <span>Team</span>
            <span title="Probability of winning the group">Win</span>
            <span title="Probability of advancing to the knockouts">Adv</span>
            <span title="Probability of reaching the round of 16">R16</span>
            <span title="Average group finishing position">Fin</span>
          </div>
          {ranked.map((t, i) => {
            const o = oddsByTeam.get(t.name);
            return (
              <div key={t.name} className={`group-table__row ${i < 2 ? "qualify" : ""}`}>
                <span className="group-table__team">
                  <span className="mono group-table__pos">{i + 1}</span>
                  <TeamBadge team={t.name} group={group} size={22} />
                  <span>{t.name}</span>
                </span>
                <span className="mono">{o ? <CountUp value={o.winGroup} format={(v) => pct(v)} /> : "—"}</span>
                <span className="mono group-table__adv">
                  {o ? <CountUp value={o.advance} format={oddsPct} /> : "—"}
                </span>
                <span className="mono">{o ? <CountUp value={o.round16} format={oddsPct} /> : "—"}</span>
                <span className="mono">{o ? o.avgGroupRank.toFixed(2) : "—"}</span>
              </div>
            );
          })}
          <div className="group-table__foot mono">Top 2 advance, plus the 8 best third-placed teams</div>
        </div>

        <div className="match-list">
          {fixtures.map((f) => (
            <MatchCard key={f.id} model={model} fixture={f} />
          ))}
        </div>
      </div>
    </div>
  );
}
