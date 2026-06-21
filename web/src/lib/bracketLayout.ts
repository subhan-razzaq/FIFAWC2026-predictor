// Reconstruct the knockout bracket tree from a single simulated tournament.
//
// The engine appends the 32 knockout matches in a fixed order: R32 slots 73-88,
// then R16 89-96, QF 97-100, SF 101-102, third-place 103, final 104. That fixed
// order lets us place every tie in the right column and side of the bracket
// without carrying match numbers through the result.

import type { MatchResult, TournamentResult } from "@weltmeister/sim";

export interface KoNode {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  winner: string;
  afterExtraTime: boolean;
  shootout?: { home: number; away: number };
  round: number; // 0 R32, 1 R16, 2 QF, 3 SF, 4 final
}

export interface BracketLayout {
  left: { r32: KoNode[]; r16: KoNode[]; qf: KoNode[]; sf: KoNode };
  right: { r32: KoNode[]; r16: KoNode[]; qf: KoNode[]; sf: KoNode };
  final: KoNode;
  third: KoNode;
  champion: string;
  runnerUp: string;
}

function toNode(m: MatchResult, round: number): KoNode {
  const node: KoNode = {
    home: m.home,
    away: m.away,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    winner: m.winner ?? (m.homeGoals >= m.awayGoals ? m.home : m.away),
    afterExtraTime: Boolean(m.afterExtraTime),
    round,
  };
  if (m.shootout) node.shootout = { home: m.shootout.home, away: m.shootout.away };
  return node;
}

export function buildBracket(res: TournamentResult): BracketLayout {
  const ko = res.matches.slice(res.matches.length - 32);
  const at = (i: number, round: number) => toNode(ko[i]!, round);

  // index maps derived from the fixed knockout ordering (see bracket.ts)
  const leftR32 = [1, 4, 0, 2, 10, 11, 8, 9].map((i) => at(i, 0));
  const rightR32 = [3, 5, 6, 7, 13, 15, 12, 14].map((i) => at(i, 0));
  const leftR16 = [16, 17, 20, 21].map((i) => at(i, 1));
  const rightR16 = [18, 19, 22, 23].map((i) => at(i, 1));
  const leftQf = [24, 25].map((i) => at(i, 2));
  const rightQf = [26, 27].map((i) => at(i, 2));
  const leftSf = at(28, 3);
  const rightSf = at(29, 3);
  const third = at(30, 3);
  const final = at(31, 4);

  return {
    left: { r32: leftR32, r16: leftR16, qf: leftQf, sf: leftSf },
    right: { r32: rightR32, r16: rightR16, qf: rightQf, sf: rightSf },
    final,
    third,
    champion: res.champion,
    runnerUp: res.runnerUp,
  };
}
