// Turn a user's predicted group orders into a real, clickable knockout bracket.
//
// We reuse the engine's official 2026 slot layout (the R32 winner/runner-up/third
// sources, then the R16->final tree). The eight best third-placed teams are taken
// by model rating - a legal allocation is guaranteed to exist for any 8 of the 12
// groups - and fed into their Annex C slots. From there the user just clicks the
// winner of each tie and the bracket fills upward to a champion.

import {
  FINAL,
  QF,
  R16,
  R32,
  SF,
  allocateThirds,
  resolveSource,
  type GroupStanding,
  type Model,
} from "@weltmeister/sim";

export interface SeedMatch {
  match: number;
  home: string;
  away: string;
}

export interface Side {
  home?: string;
  away?: string;
}

export interface BracketHalf {
  r32: number[];
  r16: number[];
  qf: number[];
  sf: number;
}

export interface BracketTree {
  left: BracketHalf;
  right: BracketHalf;
  final: number;
}

// match -> the two feeder matches whose winners contest it
const FROM = new Map<number, [number, number]>();
for (const r of [...R16, ...QF, ...SF]) FROM.set(r.match, r.from);
FROM.set(FINAL.match, FINAL.from);

function half(sfMatch: number): BracketHalf {
  const qf = FROM.get(sfMatch)!; // 2 quarter-finals
  const r16 = qf.flatMap((m) => FROM.get(m)!); // 4 round-of-16 ties
  const r32 = r16.flatMap((m) => FROM.get(m)!); // 8 round-of-32 ties
  return { sf: sfMatch, qf, r16, r32 };
}

// the final's two feeders define the left and right halves of the draw
export const TREE: BracketTree = {
  left: half(FINAL.from[0]),
  right: half(FINAL.from[1]),
  final: FINAL.match,
};

const R16_BY: { match: number; from: [number, number] }[] = R16;
const QF_BY: { match: number; from: [number, number] }[] = QF;
const SF_BY: { match: number; from: [number, number] }[] = SF;

/**
 * The eight group letters whose third-placed team advances by default: the
 * strongest thirds by model rating. This is the sensible starting selection the
 * user can then override.
 */
export function defaultQualifiedThirds(model: Model, order: Record<string, string[]>): string[] {
  const ratingOf = new Map(model.teams.map((t) => [t.name, t.rating]));
  return Object.entries(order)
    .map(([g, teams]) => ({ group: g, rating: ratingOf.get(teams[2] ?? "") ?? -Infinity }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 8)
    .map((t) => t.group)
    .sort();
}

/**
 * Seed the 16 round-of-32 ties from the predicted group orders. `qualifiedThirds`
 * is the set of eight group letters whose third-placed team advances; when it is
 * not a valid set of eight, we fall back to the strongest thirds by rating.
 */
export function seedR32(
  model: Model,
  order: Record<string, string[]>,
  qualifiedThirds?: string[],
): SeedMatch[] {
  // resolveSource only reads rank + team, so a minimal standing row is enough
  const standings: Record<string, GroupStanding[]> = {};
  for (const [g, teams] of Object.entries(order)) {
    standings[g] = teams.map((team, i) => ({
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      rank: i + 1,
    }));
  }

  const groups =
    qualifiedThirds && qualifiedThirds.length === 8
      ? [...qualifiedThirds].sort()
      : defaultQualifiedThirds(model, order);
  const thirdByMatch = allocateThirds(groups);

  return R32.map((slot) => ({
    match: slot.match,
    home: resolveSource(slot.home, standings, thirdByMatch),
    away: resolveSource(slot.away, standings, thirdByMatch),
  }));
}

/**
 * Resolve every match's two participants from the seeded R32 and the winners
 * picked so far, pruning any pick that a change upstream has invalidated.
 */
export function resolveBracket(
  seed: SeedMatch[],
  picks: Record<number, string>,
): { part: Record<number, Side>; picks: Record<number, string> } {
  const part: Record<number, Side> = {};
  const next: Record<number, string> = { ...picks };

  const check = (m: number) => {
    const p = part[m];
    const w = next[m];
    if (w !== undefined && (!p || (w !== p.home && w !== p.away))) delete next[m];
  };

  for (const s of seed) {
    part[s.match] = { home: s.home, away: s.away };
    check(s.match);
  }
  const round = (rs: { match: number; from: [number, number] }[]) => {
    for (const r of rs) {
      part[r.match] = { home: next[r.from[0]], away: next[r.from[1]] };
      check(r.match);
    }
  };
  round(R16_BY);
  round(QF_BY);
  round(SF_BY);
  part[FINAL.match] = { home: next[FINAL.from[0]], away: next[FINAL.from[1]] };
  check(FINAL.match);

  return { part, picks: next };
}

/** Auto-pick every tie in favour of the higher-rated side (the chalk bracket). */
export function autoFillBracket(model: Model, seed: SeedMatch[]): Record<number, string> {
  const rating = (name?: string) => (name ? model.teams.find((t) => t.name === name)?.rating ?? -Infinity : -Infinity);
  const sequence = [
    ...seed.map((s) => s.match),
    ...R16_BY.map((r) => r.match),
    ...QF_BY.map((r) => r.match),
    ...SF_BY.map((r) => r.match),
    FINAL.match,
  ];
  let picks: Record<number, string> = {};
  for (const m of sequence) {
    const { part } = resolveBracket(seed, picks);
    const p = part[m];
    if (p?.home && p?.away) {
      picks = { ...picks, [m]: rating(p.home) >= rating(p.away) ? p.home : p.away };
    }
  }
  return picks;
}

/** The champion (winner of the final), if the bracket is complete. */
export function championOf(picks: Record<number, string>): string | undefined {
  return picks[FINAL.match];
}

/** Final four (the four semi-finalists) and finalists, read off the resolved tree. */
export function deepPicks(part: Record<number, Side>): { finalFour: string[]; finalists: string[] } {
  const sfL = part[TREE.left.sf];
  const sfR = part[TREE.right.sf];
  const finalFour = [sfL?.home, sfL?.away, sfR?.home, sfR?.away].filter((t): t is string => !!t);
  const fin = part[FINAL.match];
  const finalists = [fin?.home, fin?.away].filter((t): t is string => !!t);
  return { finalFour, finalists };
}
