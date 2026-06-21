// One match: a scoreline plus the players who scored, and for knockout ties the
// extra time and penalty shootout that break a level result (Section 3.6).

import type { SimContext } from "./context";
import { samplePoisson, sampleScore } from "./poisson";
import type { Rng } from "./rng";
import type { GoalEvent, MatchResult, Stage } from "./types";

// Extra time is 30 minutes, so goals continue at one third of the 90-minute rate.
const EXTRA_TIME_SCALE = 30 / 90;

export interface MatchSpec {
  home: string;
  away: string;
  stage: Stage;
  hostHome: boolean;
  hostAway: boolean;
}

/** Simulate a group-stage match (can end level). */
export function simulateGroupMatch(ctx: SimContext, rng: Rng, spec: MatchSpec): MatchResult {
  const [lamH, lamA] = ctx.lambdas(spec.home, spec.away, spec.hostHome, spec.hostAway);
  const [hg, ag] = sampleScore(rng, lamH, lamA, ctx.rho);
  const scorers: GoalEvent[] = [];
  ctx.attributeGoals(rng, spec.home, hg, scorers);
  ctx.attributeGoals(rng, spec.away, ag, scorers);
  return {
    home: spec.home,
    away: spec.away,
    homeGoals: hg,
    awayGoals: ag,
    stage: spec.stage,
    scorers,
  };
}

/**
 * Simulate a knockout tie. Level after 90 goes to extra time (same Poisson
 * process scaled to 30 minutes); still level goes to a penalty shootout. Returns
 * a result with a guaranteed winner.
 */
export function simulateKnockout(ctx: SimContext, rng: Rng, spec: MatchSpec): MatchResult {
  const [lamH, lamA] = ctx.lambdas(spec.home, spec.away, spec.hostHome, spec.hostAway);
  let [hg, ag] = sampleScore(rng, lamH, lamA, ctx.rho);
  const scorers: GoalEvent[] = [];
  ctx.attributeGoals(rng, spec.home, hg, scorers);
  ctx.attributeGoals(rng, spec.away, ag, scorers);

  let afterExtraTime = false;
  if (hg === ag) {
    afterExtraTime = true;
    const [eLamH, eLamA] = ctx.lambdas(
      spec.home,
      spec.away,
      spec.hostHome,
      spec.hostAway,
      EXTRA_TIME_SCALE,
    );
    const eh = samplePoisson(rng, eLamH);
    const ea = samplePoisson(rng, eLamA);
    hg += eh;
    ag += ea;
    ctx.attributeGoals(rng, spec.home, eh, scorers);
    ctx.attributeGoals(rng, spec.away, ea, scorers);
  }

  const result: MatchResult = {
    home: spec.home,
    away: spec.away,
    homeGoals: hg,
    awayGoals: ag,
    stage: spec.stage,
    afterExtraTime,
    scorers,
  };

  if (hg > ag) {
    result.winner = spec.home;
  } else if (ag > hg) {
    result.winner = spec.away;
  } else {
    const so = penaltyShootout(ctx, rng, spec.home, spec.away);
    result.shootout = so;
    result.winner = so.winner;
  }
  return result;
}

/**
 * Penalty shootout sub-model. Each team has a per-kick conversion probability
 * derived from squad attacking quality (a proxy for penalty quality), nudged by a
 * small random edge so identical teams are not a coin toss on skill alone. Best of
 * five, then sudden death.
 */
export function penaltyShootout(
  ctx: SimContext,
  rng: Rng,
  home: string,
  away: string,
): { home: number; away: number; winner: string } {
  const pHome = kickProb(ctx, rng, home);
  const pAway = kickProb(ctx, rng, away);

  let h = 0;
  let a = 0;
  // first five kicks each
  for (let i = 0; i < 5; i++) {
    if (rng.chance(pHome)) h++;
    if (rng.chance(pAway)) a++;
  }
  // sudden death until decided
  while (h === a) {
    const hs = rng.chance(pHome);
    const as = rng.chance(pAway);
    if (hs) h++;
    if (as) a++;
  }
  return { home: h, away: a, winner: h > a ? home : away };
}

function kickProb(ctx: SimContext, rng: Rng, team: string): number {
  // base international conversion is about 0.75; better attacking sides convert a
  // little more. atk is roughly centered near 1, so this maps to ~0.70 .. 0.82.
  const t = ctx.team(team);
  const base = 0.75 + 0.04 * (t.atk - 1.0);
  const edge = (rng.next() - 0.5) * 0.04;
  return Math.min(0.92, Math.max(0.6, base + edge));
}
