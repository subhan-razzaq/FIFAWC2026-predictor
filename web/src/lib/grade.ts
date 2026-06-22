// End-of-run manager grade and analytics.
//
// The grade is relative to the team's OWN expectations, taken from the model's
// baseline Monte Carlo odds, so dragging Canada to the quarter-finals is an A+
// while the same run with Brazil is a C. We measure expectation as the expected
// number of knockout rounds survived (sum of the per-round advance probabilities)
// and compare it to what the user actually achieved.

import type { EnrichedMatch, GoalEvent, MatchResult, Stage, TeamOdds } from "@weltmeister/sim";
import { impactSubGoals } from "@weltmeister/sim";

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
