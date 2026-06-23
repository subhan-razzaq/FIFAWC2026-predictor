// Manage-mode live match: a managed game played in segments (first half, second
// half, extra time) rather than resolved in one shot.
//
// This exists so half-time decisions are real. Each segment is simulated with the
// overrides in force AT THAT MOMENT, so a substitution or a tactical change made
// at the break genuinely re-shapes the second half's expected goals. The maths is
// the same Dixon-Coles attack/defence the rest of the engine uses: a segment's
// expected goals are the full-match rate scaled to the segment's minutes, sampled
// per side, then attributed to scorers through the same scorer tables. The
// prediction Monte Carlo is untouched; this is the playable layer only.

import { SimContext, type Overrides } from "./context";
import { Rng } from "./rng";
import { samplePoisson } from "./poisson";
import { penaltyShootout } from "./match";
import type { MatchEvent } from "./enrich";
import type { GoalEvent, Model, Stage } from "./types";

const MATCH_MINUTES = 90;

export interface LiveSpec {
  home: string;
  away: string;
  stage: Stage;
  hostHome: boolean;
  hostAway: boolean;
}

export interface LiveSegment {
  /** Goal events stamped with minutes inside (from, to]. */
  goals: MatchEvent[];
  homeGoals: number;
  awayGoals: number;
}

/**
 * Simulate one segment of play under `overrides`. Expected goals are the
 * full-match rate scaled by the segment length, so a 45-minute half carries half
 * the match's goals and a 30-minute extra time a third. Deterministic for a fixed
 * `segSeed`, spec and set of overrides.
 */
export function simulateLiveSegment(
  model: Model,
  overrides: Overrides,
  segSeed: number,
  spec: LiveSpec,
  from: number,
  to: number,
): LiveSegment {
  const ctx = new SimContext(model, overrides);
  const rng = new Rng(segSeed);
  const span = Math.max(1, to - from);
  const [lamH, lamA] = ctx.lambdas(spec.home, spec.away, spec.hostHome, spec.hostAway, span / MATCH_MINUTES);
  const homeGoals = samplePoisson(rng, lamH);
  const awayGoals = samplePoisson(rng, lamA);

  const homeScorers: GoalEvent[] = [];
  const awayScorers: GoalEvent[] = [];
  ctx.attributeGoals(rng, spec.home, homeGoals, homeScorers);
  ctx.attributeGoals(rng, spec.away, awayGoals, awayScorers);

  const goals: MatchEvent[] = [];
  const place = (scorers: GoalEvent[], side: "home" | "away") => {
    for (const g of scorers) {
      const minute = Math.min(to, from + 1 + rng.int(span));
      goals.push({ minute, type: "goal", side, team: g.team, player: g.player, assist: g.assist, kind: g.kind });
    }
  };
  place(homeScorers, "home");
  place(awayScorers, "away");
  goals.sort((a, b) => a.minute - b.minute);

  return { goals, homeGoals, awayGoals };
}

/** A penalty shootout for a knockout tie still level after extra time. */
export function simulateLiveShootout(
  model: Model,
  overrides: Overrides,
  segSeed: number,
  home: string,
  away: string,
): { home: number; away: number; winner: string } {
  const ctx = new SimContext(model, overrides);
  const rng = new Rng(segSeed);
  return penaltyShootout(ctx, rng, home, away);
}
