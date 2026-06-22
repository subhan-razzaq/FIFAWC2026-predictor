// Match enrichment: a deterministic, display-only layer over a finished match.
//
// The core simulation decides the scoreline and which players scored. That is the
// part the model is validated on, so it is never touched here. Enrichment adds the
// broadcast detail a viewer expects: the minute of every goal, both starting
// elevens, and flavour events (bookings and substitutions). It is derived from a
// side RNG seeded off the match identity, so it is fully reproducible for a seed
// and never disturbs the Monte Carlo stream (it runs only on the matches we show,
// not across the tens of thousands of aggregated runs).

import { samplePoisson } from "./poisson";
import { Rng, hashSeed } from "./rng";
import type { MatchResult, Model, Squad } from "./types";

export type MatchEventType = "goal" | "yellow" | "red" | "sub";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: "home" | "away";
  team: string;
  player: string; // scorer, booked player, or the player coming off
  assist?: string; // goal: the assister, if any
  playerOn?: string; // sub: the player coming on
  kind?: "open" | "penalty" | "own"; // goal: how it was scored
}

export interface LineupSlot {
  name: string;
  pos: "GK" | "DF" | "MF" | "FW";
  captain: boolean;
  penalty: boolean;
}

export interface MatchLineup {
  team: string;
  formation: string;
  starters: LineupSlot[]; // ordered GK, DF, MF, FW
}

export interface EnrichedMatch {
  events: MatchEvent[]; // full timeline, sorted by minute
  home: MatchLineup;
  away: MatchLineup;
}

export interface EnrichOptions {
  model: Model;
  match: MatchResult;
  seed: number;
  /** Custom starting eleven per team (manage mode); falls back to projected XI. */
  elevenOverride?: Record<string, string[]>;
  /** Custom formation per team (manage mode); falls back to the squad formation. */
  formationOverride?: Record<string, string>;
  /** Custom captain / penalty taker per team (manage mode). */
  captainOverride?: Record<string, string>;
  penaltyOverride?: Record<string, string>;
}

const POS_ORDER: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
// relative likelihood of picking up a booking, by position
const CARD_WEIGHT: Record<string, number> = { GK: 0.3, DF: 1.4, MF: 1.2, FW: 0.8 };

interface InternalLineup {
  team: string;
  formation: string;
  starters: { name: string; pos: "GK" | "DF" | "MF" | "FW"; ability: number }[];
  bench: { name: string; pos: "GK" | "DF" | "MF" | "FW"; ability: number }[];
  captain: string;
  penalty: string;
}

function posOf(squad: Squad, name: string): "GK" | "DF" | "MF" | "FW" {
  const p = squad.players.find((x) => x.name === name);
  const g = p?.group;
  return g === "GK" || g === "DF" || g === "MF" || g === "FW" ? g : "MF";
}

function buildLineup(
  squad: Squad | undefined,
  team: string,
  eleven: string[] | undefined,
  formation: string | undefined,
  captain: string | undefined,
  penalty: string | undefined,
): InternalLineup {
  if (!squad) {
    return { team, formation: formation ?? "4-3-3", starters: [], bench: [], captain: "", penalty: "" };
  }
  const xi = eleven && eleven.length === 11 ? eleven : squad.projected_eleven;
  const startSet = new Set(xi);
  const ability = new Map(squad.players.map((p) => [p.name, p.ability]));
  const starters = xi
    .map((name) => ({ name, pos: posOf(squad, name), ability: ability.get(name) ?? 0.5 }))
    .sort((a, b) => POS_ORDER[a.pos]! - POS_ORDER[b.pos]!);
  const bench = squad.players
    .filter((p) => !startSet.has(p.name))
    .map((p) => ({ name: p.name, pos: posOf(squad, p.name), ability: p.ability }))
    .sort((a, b) => b.ability - a.ability);
  const cap = captain && startSet.has(captain) ? captain : startSet.has(squad.captain) ? squad.captain : xi[0] ?? "";
  const pk =
    penalty && startSet.has(penalty)
      ? penalty
      : startSet.has(squad.penalty_taker)
        ? squad.penalty_taker
        : xi[10] ?? xi[0] ?? "";
  return { team, formation: formation ?? squad.formation, starters, bench, captain: cap, penalty: pk };
}

/** Pick a starter weighted by how card-prone the position is. */
function weightedStarter(rng: Rng, lu: InternalLineup): string | null {
  if (lu.starters.length === 0) return null;
  let total = 0;
  for (const s of lu.starters) total += CARD_WEIGHT[s.pos] ?? 1;
  let u = rng.next() * total;
  for (const s of lu.starters) {
    u -= CARD_WEIGHT[s.pos] ?? 1;
    if (u <= 0) return s.name;
  }
  return lu.starters[lu.starters.length - 1]!.name;
}

function addCards(rng: Rng, events: MatchEvent[], side: "home" | "away", lu: InternalLineup, maxMin: number): void {
  if (lu.starters.length === 0) return;
  const yellows = Math.min(5, samplePoisson(rng, 1.7));
  const booked = new Set<string>();
  for (let i = 0; i < yellows; i++) {
    const name = weightedStarter(rng, lu);
    if (!name) break;
    events.push({ minute: 8 + rng.int(Math.max(1, maxMin - 8)), type: "yellow", side, team: lu.team, player: name });
    booked.add(name);
  }
  // a red is rare; model it as its own low-probability event
  if (rng.chance(0.05)) {
    const name = weightedStarter(rng, lu);
    if (name) {
      events.push({ minute: 30 + rng.int(Math.max(1, maxMin - 30)), type: "red", side, team: lu.team, player: name });
    }
  }
}

function addSubs(rng: Rng, events: MatchEvent[], side: "home" | "away", lu: InternalLineup): string[] {
  const sentOff = new Set(
    events.filter((e) => e.side === side && e.type === "red").map((e) => e.player),
  );
  // take off the weaker outfield starters first, with a little randomness
  const offPool = lu.starters
    .filter((s) => s.pos !== "GK" && !sentOff.has(s.name))
    .sort((a, b) => a.ability - b.ability + (rng.next() - 0.5) * 0.1);
  const benchPool = lu.bench.filter((b) => b.pos !== "GK");
  const n = Math.min(offPool.length, benchPool.length, 3 + rng.int(2)); // 3 or 4
  if (n <= 0) return [];

  const minutes = Array.from({ length: n }, () => 46 + rng.int(44)).sort((a, b) => a - b);
  const usedOn = new Set<string>();
  const subbedOn: string[] = [];
  for (let i = 0; i < n; i++) {
    const off = offPool[i]!;
    // prefer a like-for-like replacement, else the best remaining outfield sub
    const on =
      benchPool.find((b) => b.pos === off.pos && !usedOn.has(b.name)) ??
      benchPool.find((b) => !usedOn.has(b.name));
    if (!on) break;
    usedOn.add(on.name);
    subbedOn.push(on.name);
    events.push({ minute: minutes[i]!, type: "sub", side, team: lu.team, player: off.name, playerOn: on.name });
  }
  return subbedOn;
}

function publicLineup(lu: InternalLineup): MatchLineup {
  return {
    team: lu.team,
    formation: lu.formation,
    starters: lu.starters.map((s) => ({
      name: s.name,
      pos: s.pos,
      captain: s.name === lu.captain,
      penalty: s.name === lu.penalty,
    })),
  };
}

function eventRank(e: MatchEvent): number {
  // when minutes tie, show goals first, then reds, yellows, subs
  return e.type === "goal" ? 0 : e.type === "red" ? 1 : e.type === "yellow" ? 2 : 3;
}

/** Build the broadcast timeline and lineups for a single finished match. */
export function enrichMatch(opts: EnrichOptions): EnrichedMatch {
  const { model, match, seed } = opts;
  const rng = new Rng(
    hashSeed(`${seed}|${match.home}|${match.away}|${match.stage}|${match.homeGoals}-${match.awayGoals}`),
  );

  const homeLU = buildLineup(
    model.squads[match.home],
    match.home,
    opts.elevenOverride?.[match.home],
    opts.formationOverride?.[match.home],
    opts.captainOverride?.[match.home],
    opts.penaltyOverride?.[match.home],
  );
  const awayLU = buildLineup(
    model.squads[match.away],
    match.away,
    opts.elevenOverride?.[match.away],
    opts.formationOverride?.[match.away],
    opts.captainOverride?.[match.away],
    opts.penaltyOverride?.[match.away],
  );

  const maxMin = match.afterExtraTime ? 120 : 90;
  const events: MatchEvent[] = [];

  for (const g of match.scorers) {
    const side: "home" | "away" = g.team === match.home ? "home" : "away";
    events.push({
      minute: 1 + rng.int(maxMin),
      type: "goal",
      side,
      team: g.team,
      player: g.player,
      assist: g.assist,
      kind: g.kind,
    });
  }

  addCards(rng, events, "home", homeLU, maxMin);
  addCards(rng, events, "away", awayLU, maxMin);
  addSubs(rng, events, "home", homeLU);
  addSubs(rng, events, "away", awayLU);

  events.sort((a, b) => a.minute - b.minute || eventRank(a) - eventRank(b));

  return { events, home: publicLineup(homeLU), away: publicLineup(awayLU) };
}
