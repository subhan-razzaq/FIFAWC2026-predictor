// One simulated match in full: the scoreline plus every goal, with the scorer,
// the assist, and markers for penalties and own goals. Used by the Match Center
// and by manage mode.

import type { GoalEvent, MatchResult } from "@weltmeister/sim";
import { TeamBadge } from "./TeamBadge";
import { STAGE_LABEL } from "../lib/format";
import "./match.css";

interface Props {
  match: MatchResult;
  groupOf: Map<string, string>;
  showStage?: boolean;
}

function goalLine(g: GoalEvent) {
  const marker = g.kind === "penalty" ? " (pen)" : g.kind === "own" ? "" : "";
  const label = g.kind === "own" ? "Own goal" : g.player;
  return { label: `${label}${marker}`, assist: g.assist };
}

export function MatchResultCard({ match, groupOf, showStage = false }: Props) {
  const homeGoals = match.scorers.filter((g) => g.team === match.home);
  const awayGoals = match.scorers.filter((g) => g.team === match.away);
  const homeWin = match.winner ? match.winner === match.home : match.homeGoals > match.awayGoals;
  const awayWin = match.winner ? match.winner === match.away : match.awayGoals > match.homeGoals;
  const note = match.shootout
    ? `pens ${match.shootout.home}-${match.shootout.away}`
    : match.afterExtraTime
      ? "a.e.t."
      : "";

  return (
    <div className="mrc flat-card">
      {(showStage || note) && (
        <div className="mrc__head mono">
          <span>{showStage ? STAGE_LABEL[match.stage] ?? match.stage : ""}</span>
          {note && <span className="mrc__note">{note}</span>}
        </div>
      )}
      <div className="mrc__teams">
        <span className={`mrc__team ${homeWin ? "win" : ""}`}>
          <TeamBadge team={match.home} group={groupOf.get(match.home)} size={24} />
          <span className="mrc__name">{match.home}</span>
        </span>
        <span className="mrc__score anton">
          {match.homeGoals}
          <span className="mrc__colon">:</span>
          {match.awayGoals}
        </span>
        <span className={`mrc__team mrc__team--away ${awayWin ? "win" : ""}`}>
          <span className="mrc__name">{match.away}</span>
          <TeamBadge team={match.away} group={groupOf.get(match.away)} size={24} />
        </span>
      </div>
      {match.scorers.length > 0 && (
        <div className="mrc__goals">
          <ul className="mrc__col">
            {homeGoals.map((g, i) => {
              const { label, assist } = goalLine(g);
              return (
                <li key={i} className="mono">
                  <span className="mrc__ball">{"⚽"}</span> {label}
                  {assist && <em className="mrc__assist"> {assist}</em>}
                </li>
              );
            })}
          </ul>
          <ul className="mrc__col mrc__col--away">
            {awayGoals.map((g, i) => {
              const { label, assist } = goalLine(g);
              return (
                <li key={i} className="mono">
                  {assist && <em className="mrc__assist">{assist} </em>}
                  {label} <span className="mrc__ball">{"⚽"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
