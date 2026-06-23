// One simulated match: the scoreline plus the goals (with minutes), and an
// expandable broadcast detail with the full timeline (cards, subs) and both
// starting elevens. Used by the Match Center and by manage mode.

import { useMemo, useState } from "react";
import type { EnrichedMatch, GoalEvent, MatchResult, Model } from "@weltmeister/sim";
import { enrichMatch } from "@weltmeister/sim";
import { TeamBadge } from "./TeamBadge";
import { MatchDetail } from "./MatchDetail";
import { BallIcon } from "./icons";
import { STAGE_LABEL } from "../lib/format";
import "./match.css";

interface Props {
  match: MatchResult;
  groupOf: Map<string, string>;
  showStage?: boolean;
  /** Pass the model + seed to unlock minutes, lineups and the detail timeline. */
  model?: Model;
  seed?: number;
  /** Manage-mode lineup overrides, keyed by team. */
  elevenOverride?: Record<string, string[]>;
  formationOverride?: Record<string, string>;
  captainOverride?: Record<string, string>;
  penaltyOverride?: Record<string, string>;
  /** A pre-built timeline (manage-mode live match) used verbatim instead of
   * re-deriving one, so the detail matches exactly what played out. */
  enriched?: EnrichedMatch | null;
}

interface DisplayGoal {
  player: string;
  assist?: string;
  kind: GoalEvent["kind"];
  minute?: number;
}

function goalLabel(g: DisplayGoal): string {
  if (g.kind === "own") return "Own goal";
  return g.kind === "penalty" ? `${g.player} (pen)` : g.player;
}

function goalsFor(
  match: MatchResult,
  enriched: EnrichedMatch | null,
  side: "home" | "away",
  team: string,
): DisplayGoal[] {
  if (enriched) {
    return enriched.events
      .filter((e) => e.type === "goal" && e.side === side)
      .map((e) => ({ player: e.player, assist: e.assist, kind: e.kind!, minute: e.minute }));
  }
  return match.scorers
    .filter((g) => g.team === team)
    .map((g) => ({ player: g.player, assist: g.assist, kind: g.kind }));
}

export function MatchResultCard({
  match,
  groupOf,
  showStage = false,
  model,
  seed,
  elevenOverride,
  formationOverride,
  captainOverride,
  penaltyOverride,
  enriched: enrichedProp,
}: Props) {
  const [open, setOpen] = useState(false);

  const enriched = useMemo(
    () =>
      enrichedProp ??
      (model && seed != null
        ? enrichMatch({ model, match, seed, elevenOverride, formationOverride, captainOverride, penaltyOverride })
        : null),
    [enrichedProp, model, match, seed, elevenOverride, formationOverride, captainOverride, penaltyOverride],
  );

  const homeGoals = goalsFor(match, enriched, "home", match.home);
  const awayGoals = goalsFor(match, enriched, "away", match.away);
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
            {homeGoals.map((g, i) => (
              <li key={i} className="mono">
                {g.minute !== undefined && <span className="mrc__min">{g.minute}&prime;</span>}
                <span className="mrc__goal-ic"><BallIcon size={10} /></span> {goalLabel(g)}
                {g.assist && <em className="mrc__assist"> {g.assist}</em>}
              </li>
            ))}
          </ul>
          <ul className="mrc__col mrc__col--away">
            {awayGoals.map((g, i) => (
              <li key={i} className="mono">
                {g.assist && <em className="mrc__assist">{g.assist} </em>}
                {goalLabel(g)} <span className="mrc__goal-ic"><BallIcon size={10} /></span>
                {g.minute !== undefined && <span className="mrc__min">{g.minute}&prime;</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {enriched && (
        <>
          <button className="mrc__toggle mono" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide lineups & timeline" : "Lineups & timeline"}
          </button>
          {open && model && (
            <MatchDetail
              enriched={enriched}
              homeTeam={match.home}
              awayTeam={match.away}
              homeGoals={match.homeGoals}
              awayGoals={match.awayGoals}
              groupOf={groupOf}
              model={model}
            />
          )}
        </>
      )}
    </div>
  );
}
