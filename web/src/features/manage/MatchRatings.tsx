// Post-match player ratings for the managed team, headlined by the player of the
// match. Shown on the result screen, under the scoreline.

import { motion } from "framer-motion";
import type { EnrichedMatch, MatchResult, Model } from "@weltmeister/sim";
import { matchRatings, type MatchRating } from "../../lib/grade";
import { TeamBadge } from "../../components/TeamBadge";

function tier(r: number): string {
  if (r >= 7.5) return "hot";
  if (r >= 7) return "good";
  if (r < 6) return "poor";
  return "";
}

function motmLine(r: MatchRating): string {
  const bits: string[] = [];
  if (r.goals) bits.push(`${r.goals} goal${r.goals > 1 ? "s" : ""}`);
  if (r.assists) bits.push(`${r.assists} assist${r.assists > 1 ? "s" : ""}`);
  if (bits.length === 0) bits.push(r.group === "GK" || r.group === "DF" ? "Marshalled the back line" : "Ran the game");
  return bits.join(" · ");
}

interface Props {
  model: Model;
  team: string;
  group?: string;
  result: MatchResult;
  enriched: EnrichedMatch;
}

export function MatchRatings({ model, team, group, result, enriched }: Props) {
  const rows = matchRatings(model, team, result, enriched);
  if (rows.length === 0) return null;
  const motm = rows[0]!;

  return (
    <div className="mrating flat-card">
      <motion.div
        className="mrating__motm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      >
        <span className="eyebrow">Player of the match</span>
        <div className="mrating__motm-row">
          <TeamBadge team={team} group={group} size={26} />
          <span className="anton mrating__motm-name">{motm.player}</span>
          <span className={`mono mrating__motm-score ${tier(motm.rating)}`}>{motm.rating.toFixed(1)}</span>
        </div>
        <span className="mono mrating__motm-line">{motmLine(motm)}</span>
      </motion.div>

      <ul className="mrating__list">
        {rows.map((r) => (
          <li key={r.player} className="mrating__row">
            <span className="mrating__pos mono">{r.group}</span>
            <span className="mrating__name">{r.player}</span>
            {(r.goals > 0 || r.assists > 0) && (
              <span className="mrating__tags mono">
                {r.goals > 0 && <em className="mrating__g">{r.goals}G</em>}
                {r.assists > 0 && <em className="mrating__a">{r.assists}A</em>}
              </span>
            )}
            <span className={`mono mrating__val ${tier(r.rating)}`}>{r.rating.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
