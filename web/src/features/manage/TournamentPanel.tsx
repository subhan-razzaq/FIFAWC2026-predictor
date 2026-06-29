// Live tournament status for the managed run: where the team sits in its group,
// every other group, and the team's knockout path. The table updates as you play,
// taking your finished games as final and projecting the rest with default
// ratings, so you always see the standings and what is happening elsewhere.

import { useMemo, useState } from "react";
import { liveGroupStandings, type GroupStanding } from "@weltmeister/sim";
import { TeamBadge } from "../../components/TeamBadge";
import { teamCode } from "../../lib/teamCode";
import type { CareerState } from "../../store/store";
import type { Model } from "@weltmeister/sim";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const STAGE_LABEL: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

export function TournamentPanel({
  model,
  seed,
  career,
  groupOf,
}: {
  model: Model;
  seed: number;
  career: CareerState;
  groupOf: Map<string, string>;
}) {
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const team = career.team;
  const teamGroup = groupOf.get(team) ?? "A";

  const standings = useMemo(() => {
    const played = career.played.filter((p) => p.info.stage === "group").map((p) => p.result);
    try {
      return liveGroupStandings(model, seed, played);
    } catch {
      return null;
    }
    // re-resolve whenever a new game is banked
  }, [model, seed, team, career.played.length]);

  if (!standings) return null;

  const koPath = career.played.filter((p) => p.info.stage !== "group");

  return (
    <div className="tpanel">
      <div className="tpanel__head">
        <div className="eyebrow">Tournament tracker</div>
        <div className="tpanel__tabs">
          <button className={`group-tab ${tab === "mine" ? "active" : ""}`} style={{ width: "auto", padding: "0 12px" }} onClick={() => setTab("mine")}>
            Group {teamGroup}
          </button>
          <button className={`group-tab ${tab === "all" ? "active" : ""}`} style={{ width: "auto", padding: "0 12px" }} onClick={() => setTab("all")}>
            All groups
          </button>
        </div>
      </div>

      {tab === "mine" ? (
        <div className="tpanel__mine">
          <GroupTable group={teamGroup} rows={standings[teamGroup] ?? []} highlight={team} />
          {koPath.length > 0 && (
            <div className="tpanel__path">
              <div className="eyebrow">Your knockout path</div>
              <div className="tpanel__path-list">
                {koPath.map((p, i) => {
                  const r = p.result;
                  const opp = r.home === team ? r.away : r.home;
                  const tg = r.home === team ? r.homeGoals : r.awayGoals;
                  const og = r.home === team ? r.awayGoals : r.homeGoals;
                  const won = r.winner ? r.winner === team : tg > og;
                  return (
                    <div key={i} className={`tpanel__path-row ${won ? "win" : "out"}`}>
                      <span className="tpanel__path-stage mono">{STAGE_LABEL[p.info.stage] ?? p.info.stage}</span>
                      <span className="tpanel__path-score mono">
                        {tg}-{og}
                      </span>
                      <span className="tpanel__path-opp">
                        <TeamBadge team={opp} group={groupOf.get(opp)} size={18} /> {opp}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="tpanel__grid">
          {GROUPS.map((g) => (
            <GroupTable key={g} group={g} rows={standings[g] ?? []} highlight={g === teamGroup ? team : undefined} compact />
          ))}
        </div>
      )}
      <p className="tpanel__note mono">The table fills in matchday by matchday, so only rounds that have been played count.</p>
    </div>
  );
}

function GroupTable({
  group,
  rows,
  highlight,
  compact,
}: {
  group: string;
  rows: GroupStanding[];
  highlight?: string;
  compact?: boolean;
}) {
  return (
    <div className={`tgtable ${compact ? "tgtable--compact" : ""}`}>
      <div className="tgtable__head mono">
        <span>Group {group}</span>
        <span>Pl</span>
        <span>GD</span>
        <span>Pts</span>
      </div>
      {rows.map((s) => (
        <div
          key={s.team}
          className={`tgtable__row ${s.rank <= 2 ? "q1" : s.rank === 3 ? "q3" : ""} ${s.team === highlight ? "me" : ""}`}
        >
          <span className="tgtable__team">
            <span className="mono tgtable__pos">{s.rank}</span>
            <TeamBadge team={s.team} group={group} size={compact ? 16 : 20} />
            <span className="tgtable__name" title={s.team}>{compact ? teamCode(s.team) : s.team}</span>
          </span>
          <span className="mono">{s.played}</span>
          <span className="mono">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
          <span className="mono tgtable__pts">{s.points}</span>
        </div>
      ))}
    </div>
  );
}
