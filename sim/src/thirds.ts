// Selection of the eight best third-placed teams (Section 4, step 3).
//
// All twelve third-placed teams are ranked by points, then overall goal
// difference, then goals scored, then FIFA ranking, then lots. The top eight
// advance to the Round of 32. Which group each qualifying third came from drives
// the bracket assignment in bracket.ts.

import type { Rng } from "./rng";
import type { GroupStanding } from "./types";

export interface ThirdPlace {
  team: string;
  group: string;
  points: number;
  gd: number;
  gf: number;
}

export interface ThirdsResult {
  /** The eight qualifying thirds, best first. */
  qualified: ThirdPlace[];
  /** All twelve thirds in ranked order (for display and debugging). */
  ranked: ThirdPlace[];
  /** Set of group letters whose third-placed team advanced. */
  qualifiedGroups: string[];
}

export function selectBestThirds(
  groupStandings: Record<string, GroupStanding[]>,
  fifa: Map<string, number>,
  rng: Rng,
): ThirdsResult {
  const thirds: ThirdPlace[] = [];
  for (const [group, standings] of Object.entries(groupStandings)) {
    const third = standings.find((s) => s.rank === 3);
    if (third) {
      thirds.push({ team: third.team, group, points: third.points, gd: third.gd, gf: third.gf });
    }
  }

  thirds.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const fa = fifa.get(a.team) ?? 999;
    const fb = fifa.get(b.team) ?? 999;
    if (fa !== fb) return fa - fb;
    return rng.next() < 0.5 ? -1 : 1;
  });

  const qualified = thirds.slice(0, 8);
  return {
    qualified,
    ranked: thirds,
    qualifiedGroups: qualified.map((t) => t.group).sort(),
  };
}
