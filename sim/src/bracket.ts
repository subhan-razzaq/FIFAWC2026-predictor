// Round of 32 build and the knockout tree (Section 4, steps 4 and 5).
//
// The R32 slot layout is the real 2026 bracket: twelve group winners, twelve
// runners-up, and the eight best third-placed teams, fed into matches 73-88 and
// up through the Round of 16, quarter-finals, semi-finals, third-place playoff,
// and final exactly as in FIFA's published schedule.
//
// FIFA's Annex C fixes which qualifying third meets which winner for each of the
// 495 possible third-place combinations. Rather than embed that table we solve
// the same constraint directly: a perfect matching of the eight qualifying groups
// onto the eight winner slots that respects each slot's eligible-group list. The
// result is always a legal 2026 bracket and is deterministic for a given set of
// qualifying thirds.

import type { SimContext } from "./context";
import { simulateKnockout, type MatchSpec } from "./match";
import type { Rng } from "./rng";
import type { GroupStanding, MatchResult, Stage } from "./types";
import type { ThirdsResult } from "./thirds";

export type Source =
  | { kind: "winner"; group: string }
  | { kind: "runnerup"; group: string }
  | { kind: "third"; slot: number };

export interface R32Slot {
  match: number;
  home: Source;
  away: Source;
}

// The eight winner slots that face a third-placed team, with their eligible groups
// (the official Annex C eligibility lists).
const THIRD_SLOTS: { match: number; winner: string; eligible: string[] }[] = [
  { match: 74, winner: "E", eligible: ["A", "B", "C", "D", "F"] },
  { match: 77, winner: "I", eligible: ["C", "D", "F", "G", "H"] },
  { match: 79, winner: "A", eligible: ["C", "E", "F", "H", "I"] },
  { match: 80, winner: "L", eligible: ["E", "H", "I", "J", "K"] },
  { match: 81, winner: "D", eligible: ["B", "E", "F", "I", "J"] },
  { match: 82, winner: "G", eligible: ["A", "E", "H", "I", "J"] },
  { match: 85, winner: "B", eligible: ["E", "F", "G", "I", "J"] },
  { match: 87, winner: "K", eligible: ["D", "E", "I", "J", "L"] },
];

export const R32: R32Slot[] = [
  { match: 73, home: { kind: "runnerup", group: "A" }, away: { kind: "runnerup", group: "B" } },
  { match: 74, home: { kind: "winner", group: "E" }, away: { kind: "third", slot: 74 } },
  { match: 75, home: { kind: "winner", group: "F" }, away: { kind: "runnerup", group: "C" } },
  { match: 76, home: { kind: "winner", group: "C" }, away: { kind: "runnerup", group: "F" } },
  { match: 77, home: { kind: "winner", group: "I" }, away: { kind: "third", slot: 77 } },
  { match: 78, home: { kind: "runnerup", group: "E" }, away: { kind: "runnerup", group: "I" } },
  { match: 79, home: { kind: "winner", group: "A" }, away: { kind: "third", slot: 79 } },
  { match: 80, home: { kind: "winner", group: "L" }, away: { kind: "third", slot: 80 } },
  { match: 81, home: { kind: "winner", group: "D" }, away: { kind: "third", slot: 81 } },
  { match: 82, home: { kind: "winner", group: "G" }, away: { kind: "third", slot: 82 } },
  { match: 83, home: { kind: "runnerup", group: "K" }, away: { kind: "runnerup", group: "L" } },
  { match: 84, home: { kind: "winner", group: "H" }, away: { kind: "runnerup", group: "J" } },
  { match: 85, home: { kind: "winner", group: "B" }, away: { kind: "third", slot: 85 } },
  { match: 86, home: { kind: "winner", group: "J" }, away: { kind: "runnerup", group: "H" } },
  { match: 87, home: { kind: "winner", group: "K" }, away: { kind: "third", slot: 87 } },
  { match: 88, home: { kind: "runnerup", group: "D" }, away: { kind: "runnerup", group: "G" } },
];

// Later rounds: each match takes the winners of two earlier matches.
export const R16: { match: number; from: [number, number] }[] = [
  { match: 89, from: [74, 77] },
  { match: 90, from: [73, 75] },
  { match: 91, from: [76, 78] },
  { match: 92, from: [79, 80] },
  { match: 93, from: [83, 84] },
  { match: 94, from: [81, 82] },
  { match: 95, from: [86, 88] },
  { match: 96, from: [85, 87] },
];
export const QF: { match: number; from: [number, number] }[] = [
  { match: 97, from: [89, 90] },
  { match: 98, from: [93, 94] },
  { match: 99, from: [91, 92] },
  { match: 100, from: [95, 96] },
];
export const SF: { match: number; from: [number, number] }[] = [
  { match: 101, from: [97, 98] },
  { match: 102, from: [99, 100] },
];
export const FINAL = { match: 104, from: [101, 102] as [number, number] };
export const THIRD_PLACE = { match: 103, from: [101, 102] as [number, number] };

/**
 * Assign the eight qualifying groups to the eight winner slots, respecting each
 * slot's eligibility, by backtracking. Returns a map of match number to the group
 * whose third-placed team fills that slot.
 */
export function allocateThirds(qualifiedGroups: string[]): Record<number, string> {
  const qualified = new Set(qualifiedGroups);
  const assignment: Record<number, string> = {};
  const used = new Set<string>();

  const solve = (i: number): boolean => {
    if (i === THIRD_SLOTS.length) return true;
    const slot = THIRD_SLOTS[i]!;
    const candidates = slot.eligible.filter((g) => qualified.has(g) && !used.has(g)).sort();
    for (const g of candidates) {
      assignment[slot.match] = g;
      used.add(g);
      if (solve(i + 1)) return true;
      used.delete(g);
      delete assignment[slot.match];
    }
    return false;
  };

  if (!solve(0)) {
    throw new Error(`no valid thirds allocation for groups ${qualifiedGroups.join(",")}`);
  }
  return assignment;
}

export function resolveSource(
  src: Source,
  standings: Record<string, GroupStanding[]>,
  thirdByMatch: Record<number, string>,
): string {
  if (src.kind === "third") {
    const group = thirdByMatch[src.slot]!;
    return standings[group]!.find((s) => s.rank === 3)!.team;
  }
  const rank = src.kind === "winner" ? 1 : 2;
  return standings[src.group]!.find((s) => s.rank === rank)!.team;
}

export interface KnockoutResult {
  champion: string;
  runnerUp: string;
  third: string;
  fourth: string;
  reached: Map<string, Stage>;
  matches: MatchResult[];
}

const STAGE_DEPTH: Record<Stage, number> = {
  group: 0,
  R32: 1,
  R16: 2,
  QF: 3,
  SF: 4,
  third_place: 4,
  final: 5,
};

/** Build and play the full knockout bracket from the group standings. */
export function playKnockouts(
  ctx: SimContext,
  rng: Rng,
  standings: Record<string, GroupStanding[]>,
  thirds: ThirdsResult,
): KnockoutResult {
  const thirdByMatch = allocateThirds(thirds.qualifiedGroups);
  const winners = new Map<number, string>();
  const losers = new Map<number, string>();
  const matches: MatchResult[] = [];
  const reached = new Map<string, Stage>();

  const note = (team: string, stage: Stage) => {
    const cur = reached.get(team);
    if (!cur || STAGE_DEPTH[stage] > STAGE_DEPTH[cur]) reached.set(team, stage);
  };

  const play = (matchNo: number, home: string, away: string, stage: Stage): void => {
    note(home, stage);
    note(away, stage);
    const spec: MatchSpec = {
      home,
      away,
      stage,
      hostHome: ctx.team(home).host,
      hostAway: ctx.team(away).host,
    };
    const r = simulateKnockout(ctx, rng, spec);
    matches.push(r);
    winners.set(matchNo, r.winner!);
    losers.set(matchNo, r.winner === home ? away : home);
  };

  // R32
  for (const slot of R32) {
    const home = resolveSource(slot.home, standings, thirdByMatch);
    const away = resolveSource(slot.away, standings, thirdByMatch);
    play(slot.match, home, away, "R32");
  }
  // later rounds feed from earlier winners
  for (const r of R16) play(r.match, winners.get(r.from[0])!, winners.get(r.from[1])!, "R16");
  for (const r of QF) play(r.match, winners.get(r.from[0])!, winners.get(r.from[1])!, "QF");
  for (const r of SF) play(r.match, winners.get(r.from[0])!, winners.get(r.from[1])!, "SF");
  // third-place playoff (does not count as progressing past the semi-final)
  play(THIRD_PLACE.match, losers.get(THIRD_PLACE.from[0])!, losers.get(THIRD_PLACE.from[1])!, "third_place");
  // final
  play(FINAL.match, winners.get(FINAL.from[0])!, winners.get(FINAL.from[1])!, "final");

  const champion = winners.get(FINAL.match)!;
  const runnerUp = losers.get(FINAL.match)!;
  const third = winners.get(THIRD_PLACE.match)!;
  const fourth = losers.get(THIRD_PLACE.match)!;
  note(champion, "final");

  return { champion, runnerUp, third, fourth, reached, matches };
}
