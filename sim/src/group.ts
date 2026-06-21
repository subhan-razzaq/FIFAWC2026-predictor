// Group tables and the official 2026 tie-breakers.
//
// Order (Section 4): points, then head-to-head points, head-to-head goal
// difference, head-to-head goals among the tied teams, then overall goal
// difference, overall goals, FIFA ranking, and finally a drawing of lots. The
// head-to-head block is resolved recursively: when it splits a tied set into
// smaller tied sets, the head-to-head criteria are re-applied to each of them
// before falling through to the overall criteria.

import type { Rng } from "./rng";
import type { GroupStanding, MatchResult } from "./types";

interface Tally {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

function emptyTally(team: string): Tally {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
}

function tallyMatches(teams: string[], matches: MatchResult[]): Map<string, Tally> {
  const t = new Map<string, Tally>();
  for (const name of teams) t.set(name, emptyTally(name));
  for (const m of matches) {
    const h = t.get(m.home);
    const a = t.get(m.away);
    if (!h || !a) continue; // only matches among `teams`
    h.played++;
    a.played++;
    h.gf += m.homeGoals;
    h.ga += m.awayGoals;
    a.gf += m.awayGoals;
    a.ga += m.homeGoals;
    if (m.homeGoals > m.awayGoals) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (m.homeGoals < m.awayGoals) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  return t;
}

const gd = (t: Tally) => t.gf - t.ga;

/**
 * Order a set of teams that are tied on points, applying head-to-head then the
 * overall and ranking criteria. `overall` holds the full-group tallies; `fifa`
 * maps team to FIFA rank (lower is better).
 */
function breakTie(
  block: string[],
  matches: MatchResult[],
  overall: Map<string, Tally>,
  fifa: Map<string, number>,
  rng: Rng,
): string[] {
  if (block.length === 1) return block;

  // head-to-head mini-table among exactly this block
  const h2h = tallyMatches(block, matches.filter((m) => block.includes(m.home) && block.includes(m.away)));

  const keyOf = (team: string) => {
    const t = h2h.get(team)!;
    return `${t.points}|${gd(t)}|${t.gf}`;
  };
  const sorted = [...block].sort((x, y) => {
    const tx = h2h.get(x)!;
    const ty = h2h.get(y)!;
    if (ty.points !== tx.points) return ty.points - tx.points;
    if (gd(ty) !== gd(tx)) return gd(ty) - gd(tx);
    return ty.gf - tx.gf;
  });

  // group by identical head-to-head key
  const sub: string[][] = [];
  for (const team of sorted) {
    const last = sub[sub.length - 1];
    if (last && keyOf(last[0]!) === keyOf(team)) last.push(team);
    else sub.push([team]);
  }

  // if head-to-head did not separate the block at all, fall through to overall
  if (sub.length === 1) {
    return [...block].sort((x, y) => compareOverall(x, y, overall, fifa, rng));
  }

  // otherwise resolve each smaller tied set recursively
  const out: string[] = [];
  for (const s of sub) out.push(...breakTie(s, matches, overall, fifa, rng));
  return out;
}

function compareOverall(
  x: string,
  y: string,
  overall: Map<string, Tally>,
  fifa: Map<string, number>,
  rng: Rng,
): number {
  const tx = overall.get(x)!;
  const ty = overall.get(y)!;
  if (gd(ty) !== gd(tx)) return gd(ty) - gd(tx);
  if (ty.gf !== tx.gf) return ty.gf - tx.gf;
  const fx = fifa.get(x) ?? 999;
  const fy = fifa.get(y) ?? 999;
  if (fx !== fy) return fx - fy; // lower FIFA rank is better
  return rng.next() < 0.5 ? -1 : 1; // drawing of lots
}

/** Build the ranked standings (1..4) for one group. */
export function computeStandings(
  teams: string[],
  matches: MatchResult[],
  fifa: Map<string, number>,
  rng: Rng,
): GroupStanding[] {
  const overall = tallyMatches(teams, matches);

  // primary sort by points, then resolve equal-points blocks
  const byPoints = [...teams].sort((a, b) => overall.get(b)!.points - overall.get(a)!.points);
  const blocks: string[][] = [];
  for (const team of byPoints) {
    const last = blocks[blocks.length - 1];
    if (last && overall.get(last[0]!)!.points === overall.get(team)!.points) last.push(team);
    else blocks.push([team]);
  }

  const ordered: string[] = [];
  for (const block of blocks) ordered.push(...breakTie(block, matches, overall, fifa, rng));

  return ordered.map((team, i) => {
    const t = overall.get(team)!;
    return {
      team,
      played: t.played,
      won: t.won,
      drawn: t.drawn,
      lost: t.lost,
      gf: t.gf,
      ga: t.ga,
      gd: gd(t),
      points: t.points,
      rank: i + 1,
    };
  });
}
