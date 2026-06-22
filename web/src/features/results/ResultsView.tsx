import { useMemo, useState } from "react";
import type { GroupFixture, MatchResult, Stage } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import { MatchResultCard } from "../../components/MatchResultCard";
import { TeamBadge } from "../../components/TeamBadge";
import { STAGE_LABEL } from "../../lib/format";
import "./results.css";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const KO_ORDER: Stage[] = ["R32", "R16", "QF", "SF", "third_place", "final"];

export function ResultsView() {
  const model = useStore((s) => s.model);
  const single = useStore((s) => s.single);
  const run = useStore((s) => s.run);
  const status = useStore((s) => s.status);

  const [phase, setPhase] = useState<"group" | "ko">("group");
  const [group, setGroup] = useState("A");

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of model?.teams ?? []) m.set(t.name, t.group);
    return m;
  }, [model]);

  // zip group-stage results with the fixtures to recover the group + matchday
  const groupMatches = useMemo(() => {
    if (!model || !single) return new Map<string, { fx: GroupFixture; m: MatchResult }[]>();
    const out = new Map<string, { fx: GroupFixture; m: MatchResult }[]>();
    model.fixtures.forEach((fx, i) => {
      const m = single.matches[i];
      if (!m) return;
      const arr = out.get(fx.group) ?? [];
      arr.push({ fx, m });
      out.set(fx.group, arr);
    });
    for (const arr of out.values()) arr.sort((a, b) => a.fx.matchday - b.fx.matchday);
    return out;
  }, [model, single]);

  const koByStage = useMemo(() => {
    const out = new Map<Stage, MatchResult[]>();
    if (!single) return out;
    for (const m of single.matches.slice(72)) {
      const arr = out.get(m.stage) ?? [];
      arr.push(m);
      out.set(m.stage, arr);
    }
    return out;
  }, [single]);

  if (!model) return null;

  if (!single) {
    return (
      <div className="wrap">
        <div className="section-head">
          <div>
            <div className="eyebrow">Match center</div>
            <h2>Every game of the run</h2>
          </div>
        </div>
        <div className="results-empty flat-card">
          <p className="mono" style={{ color: "var(--text-faint)" }}>
            Run a simulation to watch the whole tournament play out, group stage included.
          </p>
          <button className="btn" onClick={() => void run(true)} disabled={status === "running"}>
            {status === "running" ? "Running" : "Run simulation"}
          </button>
        </div>
      </div>
    );
  }

  const leaders = topLeaders(single.goals);
  const assistLeaders = topLeaders(single.assists);

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Match center · this run</div>
          <h2>{single.champion} lift the trophy</h2>
        </div>
        <button className="btn" onClick={() => void run(true)} disabled={status === "running"}>
          {status === "running" ? "Running" : "New run"}
        </button>
      </div>

      <div className="results-leaders">
        <LeaderCard title="Top scorers" rows={leaders} unit="goals" />
        <LeaderCard title="Top assists" rows={assistLeaders} unit="assists" />
        <div className="results-final">
          <span className="eyebrow">The final</span>
          <FinalLine single={single} groupOf={groupOf} />
        </div>
      </div>

      <div className="results-toggle">
        <button className={`group-tab ${phase === "group" ? "active" : ""}`} style={{ width: "auto", padding: "0 14px" }} onClick={() => setPhase("group")}>
          Group stage
        </button>
        <button className={`group-tab ${phase === "ko" ? "active" : ""}`} style={{ width: "auto", padding: "0 14px" }} onClick={() => setPhase("ko")}>
          Knockouts
        </button>
      </div>

      {phase === "group" ? (
        <>
          <nav className="group-tabs results-group-tabs" aria-label="Groups">
            {GROUPS.map((g) => (
              <button key={g} className={`group-tab ${g === group ? "active" : ""}`} onClick={() => setGroup(g)} aria-pressed={g === group}>
                {g}
              </button>
            ))}
          </nav>
          <div className="results-group">
            <div className="results-table flat-card">
              <div className="results-table__head mono">
                <span>Group {group}</span>
                <span>Pld</span>
                <span>GD</span>
                <span>Pts</span>
              </div>
              {(single.groupStandings[group] ?? []).map((s) => (
                <div key={s.team} className={`results-table__row ${s.rank <= 2 ? "q1" : s.rank === 3 ? "q3" : ""}`}>
                  <span className="results-table__team">
                    <span className="mono results-table__pos">{s.rank}</span>
                    <TeamBadge team={s.team} group={group} size={20} />
                    <span>{s.team}</span>
                  </span>
                  <span className="mono">{s.played}</span>
                  <span className="mono">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
                  <span className="mono results-table__pts">{s.points}</span>
                </div>
              ))}
              <div className="results-table__foot mono">Top two advance. Third place may reach the Round of 32.</div>
            </div>
            <div className="results-matches">
              {(groupMatches.get(group) ?? []).map(({ fx, m }) => (
                <MatchResultCard key={fx.id} match={m} groupOf={groupOf} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="results-ko">
          {KO_ORDER.map((stage) => {
            const ms = koByStage.get(stage);
            if (!ms || ms.length === 0) return null;
            return (
              <section key={stage} className="results-round">
                <h3 className="results-round__title">{STAGE_LABEL[stage] ?? stage}</h3>
                <div className="results-round__grid">
                  {ms.map((m, i) => (
                    <MatchResultCard key={i} match={m} groupOf={groupOf} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function topLeaders(tally: Record<string, number>): { player: string; value: number }[] {
  return Object.entries(tally)
    .map(([player, value]) => ({ player, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function LeaderCard({
  title,
  rows,
  unit,
}: {
  title: string;
  rows: { player: string; value: number }[];
  unit: string;
}) {
  return (
    <div className="results-leader flat-card">
      <span className="eyebrow">{title}</span>
      <ul>
        {rows.map((r) => (
          <li key={r.player} className="mono">
            <span className="results-leader__name">{r.player}</span>
            <span className="results-leader__val">
              {r.value} {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinalLine({ single, groupOf }: { single: { matches: MatchResult[] }; groupOf: Map<string, string> }) {
  const final = single.matches.find((m) => m.stage === "final");
  if (!final) return null;
  return <MatchResultCard match={final} groupOf={groupOf} />;
}
