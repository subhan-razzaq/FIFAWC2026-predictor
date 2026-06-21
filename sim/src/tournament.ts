// One full tournament simulation (Section 4).
//
// Simulate all 72 group matches, build the 12 group tables with the 2026
// tie-breakers, pick the 8 best third-placed teams, build and play the knockout
// bracket, and record the champion, every team's furthest round, and every goal
// for the Golden Boot race.

import type { SimContext } from "./context";
import { playKnockouts } from "./bracket";
import { computeStandings } from "./group";
import { simulateGroupMatch } from "./match";
import type { Rng } from "./rng";
import { selectBestThirds } from "./thirds";
import type { GroupFixture, GroupStanding, MatchResult, Stage, TournamentResult } from "./types";

export interface TournamentInput {
  fixtures: GroupFixture[];
  fifa: Map<string, number>;
}

export function simulateTournament(ctx: SimContext, rng: Rng, input: TournamentInput): TournamentResult {
  const matches: MatchResult[] = [];

  // 1) group stage, collected per group
  const byGroup = new Map<string, MatchResult[]>();
  for (const fx of input.fixtures) {
    const r = simulateGroupMatch(ctx, rng, {
      home: fx.home,
      away: fx.away,
      stage: "group",
      hostHome: fx.host_home,
      hostAway: fx.host_away,
    });
    matches.push(r);
    const arr = byGroup.get(fx.group) ?? [];
    arr.push(r);
    byGroup.set(fx.group, arr);
  }

  // 2) group tables
  const groupStandings: Record<string, GroupStanding[]> = {};
  for (const [group, groupMatches] of byGroup) {
    const teams = new Set<string>();
    for (const m of groupMatches) {
      teams.add(m.home);
      teams.add(m.away);
    }
    groupStandings[group] = computeStandings([...teams], groupMatches, input.fifa, rng);
  }

  // 3) eight best third-placed teams
  const thirds = selectBestThirds(groupStandings, input.fifa, rng);

  // 4 + 5) knockouts
  const ko = playKnockouts(ctx, rng, groupStandings, thirds);
  for (const m of ko.matches) matches.push(m);

  // furthest round reached: everyone starts at the group stage
  const reached: Record<string, Stage> = {};
  for (const t of ctx.teams.keys()) reached[t] = "group";
  for (const [team, stage] of ko.reached) reached[team] = stage;

  // 6) Golden Boot: tally open-play and penalty goals (own goals do not count)
  const goals: Record<string, number> = {};
  for (const m of matches) {
    for (const g of m.scorers) {
      if (g.kind === "own" || g.player === "Unattributed") continue;
      goals[g.player] = (goals[g.player] ?? 0) + 1;
    }
  }

  return {
    champion: ko.champion,
    runnerUp: ko.runnerUp,
    third: ko.third,
    groupStandings,
    bestThirds: thirds.qualified.map((t) => t.team),
    reached,
    goals,
    matches,
  };
}

/** Build the FIFA-rank lookup used by the tie-breakers from the model teams. */
export function fifaRankMap(teams: { name: string; fifa_rank: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of teams) m.set(t.name, t.fifa_rank);
  return m;
}
