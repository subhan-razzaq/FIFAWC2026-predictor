// End-of-run manager grade and analytics.
//
// The grade is relative to the team's OWN expectations, taken from the model's
// baseline Monte Carlo odds, so dragging Canada to the quarter-finals is an A+
// while the same run with Brazil is a C. We measure expectation as the expected
// number of knockout rounds survived (sum of the per-round advance probabilities)
// and compare it to what the user actually achieved.

import type { EnrichedMatch, GoalEvent, MatchResult, Model, Stage, TeamOdds } from "@weltmeister/sim";
import { extractManagedCards, extractManagedMinutes, impactSubGoals } from "@weltmeister/sim";
import { ovr } from "./manage";

export type LetterGrade = "A+" | "A" | "B+" | "B" | "C+" | "C" | "D" | "F";

const STAGE_DEPTH: Record<Stage, number> = {
  group: 0,
  R32: 1,
  R16: 2,
  QF: 3,
  SF: 4,
  third_place: 4,
  final: 5,
};

const STAGE_NAME: Record<Stage, string> = {
  group: "group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "quarter-finals",
  SF: "semi-finals",
  third_place: "third-place playoff",
  final: "final",
};

/** Expected knockout rounds survived, from the baseline odds (0..5). */
export function expectedDepth(odds?: TeamOdds): number {
  if (!odds) return 0;
  return odds.round32 + odds.round16 + odds.quarter + odds.semi + odds.final;
}

export function achievedDepth(reached: Stage, isChampion: boolean): number {
  return isChampion ? 6 : STAGE_DEPTH[reached];
}

export interface ManagerGrade {
  grade: LetterGrade;
  expected: number;
  achieved: number;
  reached: Stage;
  reachedLabel: string;
  isChampion: boolean;
  summary: string;
}

function letter(diff: number, isChampion: boolean): LetterGrade {
  if (isChampion) return "A+";
  if (diff >= 1.8) return "A+";
  if (diff >= 1.1) return "A";
  if (diff >= 0.6) return "B+";
  if (diff >= 0.1) return "B";
  if (diff >= -0.5) return "C+";
  if (diff >= -1.1) return "C";
  if (diff >= -1.8) return "D";
  return "F";
}

export function gradeRun(reached: Stage, isChampion: boolean, odds?: TeamOdds): ManagerGrade {
  const expected = expectedDepth(odds);
  const achieved = achievedDepth(reached, isChampion);
  const diff = achieved - expected;
  const grade = letter(diff, isChampion);
  const reachedLabel = isChampion ? "champions" : `out in the ${STAGE_NAME[reached]}`;
  let summary: string;
  if (isChampion) summary = "World champions, nothing beats lifting the trophy.";
  else if (diff >= 1.1) summary = "Wildly overachieved against the model's expectations.";
  else if (diff >= 0.1) summary = "Beat expectations, a tournament to be proud of.";
  else if (diff >= -0.5) summary = "Right about where the squad was projected to finish.";
  else if (diff >= -1.1) summary = "Underwhelming, this group should have gone further.";
  else summary = "A major underachievement for a side of this quality.";
  return { grade, expected, achieved, reached, reachedLabel, isChampion, summary };
}

export interface ScorerLine {
  player: string;
  goals: number;
}

/** Goals by managed-team players across the run (Golden Boot for your squad). */
export function tournamentScorers(results: MatchResult[], team: string): ScorerLine[] {
  const tally = new Map<string, number>();
  for (const m of results) {
    for (const g of m.scorers as GoalEvent[]) {
      if (g.team !== team || g.kind === "own" || g.player === "Unattributed") continue;
      tally.set(g.player, (tally.get(g.player) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([player, goals]) => ({ player, goals }))
    .sort((a, b) => b.goals - a.goals);
}

export interface ImpactSub {
  player: string;
  goals: number;
}

/** Goals scored by players the manager brought off the bench. */
export function impactSubs(enriched: EnrichedMatch[], team: string): ImpactSub[] {
  const tally = new Map<string, number>();
  for (const e of enriched) {
    for (const g of impactSubGoals(e, team)) {
      tally.set(g.player, (tally.get(g.player) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([player, goals]) => ({ player, goals }))
    .sort((a, b) => b.goals - a.goals);
}

export interface MatchRating {
  player: string;
  group: string;
  rating: number;
  goals: number;
  assists: number;
  mins: number;
}

/**
 * Per-player match ratings (≈4.5-10) for the managed team, best first, so the top
 * entry is the player of the match. Read off the canonical enriched timeline,
 * minutes, goals, assists and cards, then weighted by the scoreline (clean sheets
 * lift the back line, a defeat dents everyone) and a light nudge from the player's
 * own class. Short cameos are pulled back toward a neutral 6.5.
 */
export function matchRatings(
  model: Model,
  team: string,
  result: MatchResult,
  enriched: EnrichedMatch,
): MatchRating[] {
  const minutes = extractManagedMinutes(enriched, team, !!result.afterExtraTime);
  const cards = extractManagedCards(enriched, team);
  const yellows = new Set(cards.yellows);
  const reds = new Set(cards.reds);
  const byName = new Map(model.squads[team]!.players.map((p) => [p.name, p]));

  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  for (const g of result.scorers as GoalEvent[]) {
    if (g.team !== team) continue;
    if (g.kind !== "own" && g.player !== "Unattributed") goals.set(g.player, (goals.get(g.player) ?? 0) + 1);
    if (g.assist) assists.set(g.assist, (assists.get(g.assist) ?? 0) + 1);
  }

  const teamHome = result.home === team;
  const tg = teamHome ? result.homeGoals : result.awayGoals;
  const og = teamHome ? result.awayGoals : result.homeGoals;
  const won = result.winner ? result.winner === team : tg > og;
  const drew = !result.winner && tg === og;

  const rows: MatchRating[] = [];
  for (const [name, mins] of minutes) {
    if (mins <= 0) continue;
    const p = byName.get(name);
    if (!p) continue;
    const g = goals.get(name) ?? 0;
    const a = assists.get(name) ?? 0;
    let r = 6.3 + g * 1.05 + a * 0.6;
    const back = p.group === "GK" || p.group === "DF";
    if (back) r += og === 0 && mins >= 60 ? 0.9 : -og * 0.22;
    if (p.group === "GK" && og >= 3) r -= 0.3;
    if (p.group === "FW" && g === 0 && mins >= 60) r -= 0.25;
    r += won ? 0.4 : drew ? 0.05 : -0.25;
    if (yellows.has(name)) r -= 0.3;
    if (reds.has(name)) r -= 1.3;
    r += (ovr(p.ability) - 76) * 0.01;
    if (mins < 30) r = 6.5 + (r - 6.5) * (mins / 30);
    rows.push({
      player: name,
      group: p.group,
      rating: Math.round(Math.max(4.5, Math.min(10, r)) * 10) / 10,
      goals: g,
      assists: a,
      mins,
    });
  }
  rows.sort((x, y) => y.rating - x.rating || y.goals - x.goals || y.mins - x.mins);
  return rows;
}
