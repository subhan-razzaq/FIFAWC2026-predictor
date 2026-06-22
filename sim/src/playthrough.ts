// Manager-mode playthrough driver: play one nation through the tournament a
// single match at a time, with every other match resolved automatically and
// deterministically.
//
// This file adds NO new match maths. Every managed and auto match is resolved
// through the same validated `simulateGroupMatch` / `simulateKnockout` used by
// the Monte Carlo, with a fresh `SimContext` per match so manage-mode overrides
// (a fatigue/tactics-adjusted attack/defence and scorer model) apply to the
// managed team only. Sub-seeds are derived from the base seed and a stable match
// index, so the rest of the bracket is identical no matter how the user paces
// their clicks, and a managed match replays identically for the same choices.

import { SimContext, type Overrides } from "./context";
import { deriveSeed, Rng } from "./rng";
import { simulateGroupMatch, simulateKnockout, type MatchSpec } from "./match";
import { computeStandings } from "./group";
import { selectBestThirds, type ThirdsResult } from "./thirds";
import {
  allocateThirds,
  resolveSource,
  R32,
  R16,
  QF,
  SF,
  FINAL,
  THIRD_PLACE,
} from "./bracket";
import type { EnrichedMatch, MatchEvent } from "./enrich";
import type { GroupStanding, MatchResult, Model, Stage } from "./types";

/** A single match the managed team must play. `matchNo` is a stable index used
 * for the sub-seed: the fixtures array index (0..71) for group games, and the
 * official 2026 match number (73..104) for knockouts. */
export interface ManagedMatchInfo {
  matchNo: number;
  stage: Stage;
  opponent: string;
  /** True when the managed team is the home side of the official fixture / slot. */
  isHome: boolean;
  hostHome: boolean;
  hostAway: boolean;
  /** Group games only. */
  matchday?: number;
}

/** A managed match the user has already played, kept so the bracket can advance
 * its winner without re-rolling. */
export interface PlayedManagedMatch {
  matchNo: number;
  result: MatchResult;
}

const KO_STAGES = new Set<Stage>(["R32", "R16", "QF", "SF", "third_place", "final"]);

function hostOf(model: Model): Map<string, boolean> {
  return new Map(model.teams.map((t) => [t.name, t.host]));
}

function fifaMap(model: Model): Map<string, number> {
  return new Map(model.teams.map((t) => [t.name, t.fifa_rank]));
}

/** The managed team's three group fixtures, in matchday order. */
export function managedGroupSchedule(model: Model, team: string): ManagedMatchInfo[] {
  const out: ManagedMatchInfo[] = [];
  model.fixtures.forEach((fx, idx) => {
    if (fx.home !== team && fx.away !== team) return;
    const isHome = fx.home === team;
    out.push({
      matchNo: idx,
      stage: "group",
      opponent: isHome ? fx.away : fx.home,
      isHome,
      hostHome: fx.host_home,
      hostAway: fx.host_away,
      matchday: fx.matchday,
    });
  });
  return out.sort((a, b) => (a.matchday ?? 0) - (b.matchday ?? 0));
}

/** Play a single managed match with the given overrides. Deterministic for a
 * fixed seed, match and set of overrides. */
export function playManagedMatch(
  model: Model,
  seed: number,
  team: string,
  info: ManagedMatchInfo,
  overrides: Overrides,
): MatchResult {
  const ctx = new SimContext(model, overrides);
  const rng = new Rng(deriveSeed(seed, info.matchNo));
  const spec: MatchSpec = {
    home: info.isHome ? team : info.opponent,
    away: info.isHome ? info.opponent : team,
    stage: info.stage,
    hostHome: info.hostHome,
    hostAway: info.hostAway,
  };
  return KO_STAGES.has(info.stage)
    ? simulateKnockout(ctx, rng, spec)
    : simulateGroupMatch(ctx, rng, spec);
}

export interface GroupStageOutcome {
  standings: Record<string, GroupStanding[]>;
  thirds: ThirdsResult;
  advanced: boolean;
  finishRank: number;
}

/**
 * Build the full group-stage table once the managed team has played its three
 * games. The managed team's own results are taken as given; every other group
 * game (including the other three in the managed team's group) is auto-simulated
 * with default ratings, so standings, best thirds and the bracket are well-formed.
 */
export function resolveGroupStage(
  model: Model,
  seed: number,
  team: string,
  managedResults: MatchResult[],
): GroupStageOutcome {
  const fifa = fifaMap(model);
  const teamGroup = model.teams.find((t) => t.name === team)!.group;
  const baseCtx = new SimContext(model, {});

  const byGroup = new Map<string, MatchResult[]>();
  model.fixtures.forEach((fx, idx) => {
    const managed = managedResults.find((m) => m.home === fx.home && m.away === fx.away);
    // managed games the user has played are taken as given; everything else
    // (including the managed team's not-yet-played games) is projected with
    // default ratings, so the table is well-formed and updates live as you play
    const r =
      managed ??
      simulateGroupMatch(baseCtx, new Rng(deriveSeed(seed, idx)), {
        home: fx.home,
        away: fx.away,
        stage: "group",
        hostHome: fx.host_home,
        hostAway: fx.host_away,
      });
    const arr = byGroup.get(fx.group) ?? [];
    arr.push(r);
    byGroup.set(fx.group, arr);
  });

  const standings: Record<string, GroupStanding[]> = {};
  for (const [group, ms] of byGroup) {
    const teams = new Set<string>();
    for (const m of ms) {
      teams.add(m.home);
      teams.add(m.away);
    }
    // a stable per-group rng for the drawing-of-lots tie-break
    const rng = new Rng(deriveSeed(seed, 5000 + group.charCodeAt(0)));
    standings[group] = computeStandings([...teams], ms, fifa, rng);
  }
  const thirds = selectBestThirds(standings, fifa, new Rng(deriveSeed(seed, 6000)));

  const myStanding = standings[teamGroup]!.find((s) => s.team === team)!;
  const advanced =
    myStanding.rank <= 2 || (myStanding.rank === 3 && thirds.qualifiedGroups.includes(teamGroup));
  return { standings, thirds, advanced, finishRank: myStanding.rank };
}

export type BracketStatus =
  | {
      status: "pending";
      stage: Stage;
      matchNo: number;
      opponent: string;
      isHome: boolean;
      hostHome: boolean;
      hostAway: boolean;
    }
  | { status: "eliminated"; stage: Stage }
  | { status: "champion" };

interface FeederMatch {
  match: number;
  stage: Stage;
  from: [number, number];
  losersOf?: boolean; // third-place playoff feeds from the losers of the semis
}

const FEEDERS: FeederMatch[] = [
  ...R16.map((m) => ({ match: m.match, stage: "R16" as Stage, from: m.from })),
  ...QF.map((m) => ({ match: m.match, stage: "QF" as Stage, from: m.from })),
  ...SF.map((m) => ({ match: m.match, stage: "SF" as Stage, from: m.from })),
  { match: THIRD_PLACE.match, stage: "third_place" as Stage, from: THIRD_PLACE.from, losersOf: true },
  { match: FINAL.match, stage: "final" as Stage, from: FINAL.from },
];

/**
 * Walk the knockout bracket for the managed team. All non-managed ties are
 * auto-played (deterministically, sub-seeded by match number). When the managed
 * team reaches a tie it has not yet played, returns `pending` with the opponent
 * and venue so the user can pick a lineup; if a managed result is already
 * recorded it advances that winner. Terminal states are `eliminated` (the round
 * the managed team lost in) or `champion`.
 */
export function resolveBracketForManaged(
  model: Model,
  seed: number,
  standings: Record<string, GroupStanding[]>,
  thirds: ThirdsResult,
  team: string,
  played: PlayedManagedMatch[],
): BracketStatus {
  const baseCtx = new SimContext(model, {});
  const host = hostOf(model);
  const thirdByMatch = allocateThirds(thirds.qualifiedGroups);
  const winners = new Map<number, string>();
  const losers = new Map<number, string>();
  const playedBy = new Map<number, MatchResult>();
  for (const p of played) playedBy.set(p.matchNo, p.result);

  // Resolve a single tie. Returns a BracketStatus if the walk must pause/stop,
  // otherwise records the winner/loser and returns null to continue.
  const resolve = (matchNo: number, stage: Stage, home: string, away: string): BracketStatus | null => {
    const managed = home === team || away === team;
    if (managed) {
      const rec = playedBy.get(matchNo);
      if (!rec) {
        return {
          status: "pending",
          stage,
          matchNo,
          opponent: home === team ? away : home,
          isHome: home === team,
          hostHome: host.get(home) ?? false,
          hostAway: host.get(away) ?? false,
        };
      }
      const w = rec.winner!;
      winners.set(matchNo, w);
      losers.set(matchNo, w === home ? away : home);
      if (w !== team) return { status: "eliminated", stage };
      if (stage === "final") return { status: "champion" };
      return null;
    }
    const ctx = baseCtx;
    const rng = new Rng(deriveSeed(seed, matchNo));
    const r = simulateKnockout(ctx, rng, {
      home,
      away,
      stage,
      hostHome: host.get(home) ?? false,
      hostAway: host.get(away) ?? false,
    });
    winners.set(matchNo, r.winner!);
    losers.set(matchNo, r.winner === home ? away : home);
    return null;
  };

  // Round of 32, seeded straight from the group tables.
  for (const slot of R32) {
    const home = resolveSource(slot.home, standings, thirdByMatch);
    const away = resolveSource(slot.away, standings, thirdByMatch);
    const s = resolve(slot.match, "R32", home, away);
    if (s) return s;
  }
  // Later rounds feed from earlier winners (third place from the semi losers).
  for (const f of FEEDERS) {
    const pool = f.losersOf ? losers : winners;
    const home = pool.get(f.from[0])!;
    const away = pool.get(f.from[1])!;
    const s = resolve(f.match, f.stage, home, away);
    if (s) return s;
  }
  // Unreachable for a well-formed bracket (the final always resolves a champion).
  return { status: "eliminated", stage: "final" };
}

// --- enrichment extraction: minutes and cards for the managed team -----------
//
// Fatigue and card accumulation read the SAME deterministic broadcast events the
// match timeline shows, so what the user sees is exactly what updates their squad.

function managedSide(enriched: EnrichedMatch, team: string): "home" | "away" | null {
  if (enriched.home.team === team) return "home";
  if (enriched.away.team === team) return "away";
  return null;
}

/** Minutes played by every managed-team player who appeared (starter or sub). */
export function extractManagedMinutes(
  enriched: EnrichedMatch,
  team: string,
  afterExtraTime = false,
): Map<string, number> {
  const maxMin = afterExtraTime ? 120 : 90;
  const out = new Map<string, number>();
  const side = managedSide(enriched, team);
  if (!side) return out;
  const lineup = side === "home" ? enriched.home : enriched.away;
  const mine = enriched.events.filter((e) => e.side === side);

  const offAt = new Map<string, number>();
  const onAt = new Map<string, number>();
  for (const e of mine) {
    if (e.type === "sub") {
      offAt.set(e.player, e.minute);
      if (e.playerOn) onAt.set(e.playerOn, e.minute);
    } else if (e.type === "red") {
      const cur = offAt.get(e.player);
      if (cur === undefined || e.minute < cur) offAt.set(e.player, e.minute);
    }
  }
  for (const s of lineup.starters) {
    out.set(s.name, offAt.get(s.name) ?? maxMin);
  }
  for (const [name, on] of onAt) {
    if (!out.has(name)) out.set(name, Math.max(0, maxMin - on));
  }
  return out;
}

/** Yellow and red cards picked up by managed-team players this match. */
export function extractManagedCards(
  enriched: EnrichedMatch,
  team: string,
): { yellows: string[]; reds: string[] } {
  const yellows: string[] = [];
  const reds: string[] = [];
  const side = managedSide(enriched, team);
  if (!side) return { yellows, reds };
  for (const e of enriched.events) {
    if (e.side !== side) continue;
    if (e.type === "yellow") yellows.push(e.player);
    else if (e.type === "red") reds.push(e.player);
  }
  return { yellows, reds };
}

/** Goals scored by managed-team players who had been substituted on before the
 * goal, the "impact sub" stat. Reads the same events as the timeline. */
export function impactSubGoals(enriched: EnrichedMatch, team: string): MatchEvent[] {
  const side = managedSide(enriched, team);
  if (!side) return [];
  const onAt = new Map<string, number>();
  for (const e of enriched.events) {
    if (e.side === side && e.type === "sub" && e.playerOn) onAt.set(e.playerOn, e.minute);
  }
  return enriched.events.filter(
    (e) => e.side === side && e.type === "goal" && onAt.has(e.player) && e.minute >= (onAt.get(e.player) ?? 0),
  );
}
