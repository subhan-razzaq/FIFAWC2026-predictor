// Grade a user's whole-tournament prediction against the model.
//
// The user predicts the finishing order of every group, a final four, the two
// finalists, and a champion. We run the same Monte Carlo as the rest of the app
// and read off, from thousands of simulated tournaments, how often each of those
// calls actually comes true. That turns a gut-feeling bracket into honest odds:
// the chance of each exact group order, of each deep-run pick, and of the title,
// plus how the whole bracket would score against the realities the model rolls.

import { SimContext } from "./context";
import { deriveSeed, Rng } from "./rng";
import { simulateTournament, type TournamentInput } from "./tournament";
import type { Model, Stage } from "./types";

const DEPTH: Record<Stage, number> = {
  group: 0, R32: 1, R16: 2, QF: 3, SF: 4, third_place: 4, final: 5,
};

// Transparent points awarded when a pick matches a simulated tournament. Shown to
// the user so the grade is never a black box. Group order is where most of the
// skill is; the title is the single biggest call.
export const SCORING = {
  groupWinner: 5,
  groupRunnerUp: 3,
  groupThird: 1,
  groupFourth: 1,
  reachSemi: 8,
  reachFinal: 12,
  champion: 30,
} as const;

export interface BracketPrediction {
  /** group letter -> the four teams in predicted finish order (1st..4th) */
  groupOrder: Record<string, string[]>;
  /** four teams predicted to reach the semi-finals */
  finalFour: string[];
  /** two teams predicted to reach the final (a subset of finalFour) */
  finalists: string[];
  /** the predicted champion (one of the finalists) */
  champion: string;
}

export interface GroupGrade {
  group: string;
  predicted: string[];
  /** the model's single most likely finish order for this group */
  modalOrder: string[];
  /** P(the group finishes in exactly the predicted order) */
  exactProb: number;
  /** P(the predicted team in each slot finishes in that slot), 1st..4th */
  positionProb: number[];
  /** P(predicted winner tops the group) */
  winnerProb: number;
  /** P(predicted 1st and 2nd both finish top two) */
  advanceProb: [number, number];
  matchesModal: boolean;
}

export interface PickOdds {
  team: string;
  prob: number;
}

export interface BracketGrade {
  runs: number;
  seed: number;
  groups: GroupGrade[];
  finalFour: PickOdds[]; // P(reach the semis) per pick
  finalists: PickOdds[]; // P(reach the final) per pick
  champion: {
    team: string;
    prob: number;
    /** the model's favourite to lift it, and that team's title odds */
    modal: string;
    modalProb: number;
    /** where the predicted champion sits on the title-odds board (1 = favourite) */
    rank: number;
  };
  /** the model's title-odds board (top contenders), for context around the pick */
  titleBoard: PickOdds[];

  /** rough 1-in-N odds of getting every group order AND the champion right */
  perfectProb: number;
  /** expected number of groups whose order is nailed exactly */
  expectedGroupsExact: number;
  /** expected correct group positions, out of 48 */
  expectedPositions: number;

  // bracket scoring, against the tournaments the model rolled
  scoring: typeof SCORING;
  maxScore: number;
  userExpectedScore: number;
  /** the favourites-only "chalk" bracket, scored the same way, as a benchmark */
  chalkExpectedScore: number;
  bestCaseScore: number;
  /** P(the user's bracket out-scores the chalk bracket in a given tournament) */
  beatChalkProb: number;
  /** alignment with the model, 0..1 (user expected / chalk expected) */
  alignment: number;
  grade: string;
  persona: string;

  // highlights
  safestPick: { label: string; prob: number };
  biggestGamble: { label: string; prob: number };
  /** group calls that depart from the model's favourite, hardest first */
  contrarian: { group: string; predictedWinner: string; modalWinner: string; winnerProb: number }[];
}

export interface GradeOptions {
  runs: number;
  seed: number;
  onProgress?: (done: number, total: number) => void;
  progressEvery?: number;
}

const ORDER_PTS = [SCORING.groupWinner, SCORING.groupRunnerUp, SCORING.groupThird, SCORING.groupFourth];

/** Score one prediction against a single realized tournament. */
function scoreAgainst(
  pred: BracketPrediction,
  realized: Record<string, string[]>,
  sfSet: Set<string>,
  finalists: Set<string>,
  champion: string,
): number {
  let s = 0;
  for (const [g, order] of Object.entries(pred.groupOrder)) {
    const real = realized[g];
    if (!real) continue;
    for (let i = 0; i < 4; i++) if (order[i] && order[i] === real[i]) s += ORDER_PTS[i]!;
  }
  for (const t of pred.finalFour) if (sfSet.has(t)) s += SCORING.reachSemi;
  for (const t of pred.finalists) if (finalists.has(t)) s += SCORING.reachFinal;
  if (pred.champion && pred.champion === champion) s += SCORING.champion;
  return s;
}

/** The favourites-only benchmark bracket, built straight from the model ratings. */
function chalkBracket(model: Model): BracketPrediction {
  const byGroup: Record<string, { name: string; rating: number }[]> = {};
  for (const t of model.teams) (byGroup[t.group] ??= []).push({ name: t.name, rating: t.rating });
  const groupOrder: Record<string, string[]> = {};
  for (const [g, arr] of Object.entries(byGroup)) {
    groupOrder[g] = [...arr].sort((a, b) => b.rating - a.rating).map((t) => t.name);
  }
  const ranked = [...model.teams].sort((a, b) => b.rating - a.rating).map((t) => t.name);
  return {
    groupOrder,
    finalFour: ranked.slice(0, 4),
    finalists: ranked.slice(0, 2),
    champion: ranked[0]!,
  };
}

function maxScoreOf(pred: BracketPrediction): number {
  let m = 0;
  for (const order of Object.values(pred.groupOrder)) {
    for (let i = 0; i < Math.min(4, order.length); i++) m += ORDER_PTS[i]!;
  }
  m += pred.finalFour.length * SCORING.reachSemi;
  m += pred.finalists.length * SCORING.reachFinal;
  m += SCORING.champion;
  return m;
}

function gradeLetter(alignment: number): { grade: string; persona: string } {
  // alignment is how close the bracket sits to the value-maximising favourites.
  // a high number means sharp, model-aligned calls; a low number means bold.
  if (alignment >= 0.97) return { grade: "A+", persona: "Razor sharp" };
  if (alignment >= 0.9) return { grade: "A", persona: "Form student" };
  if (alignment >= 0.8) return { grade: "B", persona: "Calculated" };
  if (alignment >= 0.68) return { grade: "C", persona: "Gut caller" };
  if (alignment >= 0.55) return { grade: "D", persona: "Romantic" };
  return { grade: "E", persona: "High roller" };
}

export function gradeBracket(model: Model, pred: BracketPrediction, opts: GradeOptions): BracketGrade {
  const ctx = new SimContext(model);
  const input: TournamentInput = {
    fixtures: model.fixtures,
    fifa: new Map(model.teams.map((t) => [t.name, t.fifa_rank])),
  };
  const groups = Object.keys(pred.groupOrder).sort();

  // per-group counters
  const exact = new Map<string, number>();
  const posHits = new Map<string, [number, number, number, number]>();
  const winnerHit = new Map<string, number>();
  const advHit = new Map<string, [number, number]>();
  const orderCounts = new Map<string, Map<string, number>>();
  for (const g of groups) {
    exact.set(g, 0);
    posHits.set(g, [0, 0, 0, 0]);
    winnerHit.set(g, 0);
    advHit.set(g, [0, 0]);
    orderCounts.set(g, new Map());
  }

  const ffHit = new Map<string, number>(pred.finalFour.map((t) => [t, 0]));
  const finalHit = new Map<string, number>(pred.finalists.map((t) => [t, 0]));
  const championCounts = new Map<string, number>();
  let champHit = 0;

  const chalk = chalkBracket(model);
  let userScoreSum = 0;
  let chalkScoreSum = 0;
  let beatChalk = 0;
  let bestCase = 0;

  const N = opts.runs;
  const every = opts.progressEvery ?? Math.max(1, Math.floor(N / 50));

  for (let i = 0; i < N; i++) {
    const rng = new Rng(deriveSeed(opts.seed, i));
    const res = simulateTournament(ctx, rng, input);

    // realized group orders
    const realized: Record<string, string[]> = {};
    for (const [g, standings] of Object.entries(res.groupStandings)) {
      realized[g] = [...standings].sort((a, b) => a.rank - b.rank).map((s) => s.team);
    }

    for (const g of groups) {
      const real = realized[g];
      const order = pred.groupOrder[g]!;
      if (!real) continue;
      const key = real.join("|");
      const oc = orderCounts.get(g)!;
      oc.set(key, (oc.get(key) ?? 0) + 1);

      const ph = posHits.get(g)!;
      let all = true;
      for (let k = 0; k < 4; k++) {
        if (order[k] === real[k]) ph[k] = (ph[k] ?? 0) + 1;
        else all = false;
      }
      if (all) exact.set(g, exact.get(g)! + 1);
      if (order[0] === real[0]) winnerHit.set(g, winnerHit.get(g)! + 1);
      const top2 = new Set([real[0], real[1]]);
      const ah = advHit.get(g)!;
      if (top2.has(order[0]!)) ah[0]++;
      if (top2.has(order[1]!)) ah[1]++;
    }

    // deep-run survival
    const sfSet = new Set<string>();
    for (const [team, stage] of Object.entries(res.reached)) {
      if (DEPTH[stage] >= 4) sfSet.add(team);
    }
    const finalists = new Set<string>([res.champion, res.runnerUp]);
    for (const t of pred.finalFour) if (sfSet.has(t)) ffHit.set(t, ffHit.get(t)! + 1);
    for (const t of pred.finalists) if (finalists.has(t)) finalHit.set(t, finalHit.get(t)! + 1);
    championCounts.set(res.champion, (championCounts.get(res.champion) ?? 0) + 1);
    if (pred.champion === res.champion) champHit++;

    // bracket scoring vs the favourites benchmark
    const us = scoreAgainst(pred, realized, sfSet, finalists, res.champion);
    const them = scoreAgainst(chalk, realized, sfSet, finalists, res.champion);
    userScoreSum += us;
    chalkScoreSum += them;
    if (us > them) beatChalk++;
    if (us > bestCase) bestCase = us;

    if (opts.onProgress && (i + 1) % every === 0) opts.onProgress(i + 1, N);
  }

  const floor = 0.5 / N; // keep "impossible in this sample" picks from collapsing to a hard zero

  const groupGrades: GroupGrade[] = groups.map((g) => {
    const order = pred.groupOrder[g]!;
    const oc = orderCounts.get(g)!;
    let modalKey = "";
    let modalCount = -1;
    for (const [k, c] of oc) if (c > modalCount) ((modalCount = c), (modalKey = k));
    const modalOrder = modalKey ? modalKey.split("|") : order;
    const ph = posHits.get(g)!;
    const ah = advHit.get(g)!;
    return {
      group: g,
      predicted: order,
      modalOrder,
      exactProb: exact.get(g)! / N,
      positionProb: ph.map((c) => c / N),
      winnerProb: winnerHit.get(g)! / N,
      advanceProb: [ah[0] / N, ah[1] / N],
      matchesModal: order.join("|") === modalOrder.join("|"),
    };
  });

  // champion board
  const champProb = champHit / N;
  let modalChamp = pred.champion;
  let modalChampCount = -1;
  for (const [t, c] of championCounts) if (c > modalChampCount) ((modalChampCount = c), (modalChamp = t));
  const champBoard = [...championCounts.entries()].sort((a, b) => b[1] - a[1]);
  const champRank = Math.max(1, champBoard.findIndex(([t]) => t === pred.champion) + 1 || champBoard.length + 1);
  const titleBoard: PickOdds[] = champBoard.slice(0, 8).map(([team, c]) => ({ team, prob: c / N }));

  // perfect-bracket headline: every group order plus the title, smoothed
  let perfect = Math.max(champProb, floor);
  let expectedGroupsExact = 0;
  let expectedPositions = 0;
  for (const gg of groupGrades) {
    perfect *= Math.max(gg.exactProb, floor);
    expectedGroupsExact += gg.exactProb;
    for (const p of gg.positionProb) expectedPositions += p;
  }

  const userExpectedScore = userScoreSum / N;
  const chalkExpectedScore = chalkScoreSum / N;
  const maxScore = maxScoreOf(pred);
  const alignment = chalkExpectedScore > 0 ? Math.min(1, userExpectedScore / chalkExpectedScore) : 0;
  const { grade, persona } = gradeLetter(alignment);

  // highlights: collect every individual call with its probability
  const calls: { label: string; prob: number }[] = [];
  for (const gg of groupGrades) calls.push({ label: `${gg.predicted[0]} to win Group ${gg.group}`, prob: gg.winnerProb });
  for (const f of pred.finalFour) calls.push({ label: `${f} to reach the semis`, prob: (ffHit.get(f) ?? 0) / N });
  for (const f of pred.finalists) calls.push({ label: `${f} to reach the final`, prob: (finalHit.get(f) ?? 0) / N });
  calls.push({ label: `${pred.champion} to lift the trophy`, prob: champProb });
  const ranked = calls.filter((c) => c.prob > 0).sort((a, b) => a.prob - b.prob);
  const biggestGamble = ranked[0] ?? { label: "-", prob: 0 };
  const safestPick = ranked[ranked.length - 1] ?? { label: "-", prob: 0 };

  const contrarian = groupGrades
    .filter((gg) => gg.predicted[0] !== gg.modalOrder[0])
    .map((gg) => ({
      group: gg.group,
      predictedWinner: gg.predicted[0]!,
      modalWinner: gg.modalOrder[0]!,
      winnerProb: gg.winnerProb,
    }))
    .sort((a, b) => a.winnerProb - b.winnerProb);

  if (opts.onProgress) opts.onProgress(N, N);

  return {
    runs: N,
    seed: opts.seed,
    groups: groupGrades,
    finalFour: pred.finalFour.map((t) => ({ team: t, prob: (ffHit.get(t) ?? 0) / N })),
    finalists: pred.finalists.map((t) => ({ team: t, prob: (finalHit.get(t) ?? 0) / N })),
    champion: { team: pred.champion, prob: champProb, modal: modalChamp, modalProb: modalChampCount / N, rank: champRank },
    titleBoard,
    perfectProb: perfect,
    expectedGroupsExact,
    expectedPositions,
    scoring: SCORING,
    maxScore,
    userExpectedScore,
    chalkExpectedScore,
    bestCaseScore: bestCase,
    beatChalkProb: beatChalk / N,
    alignment,
    grade,
    persona,
    safestPick,
    biggestGamble,
    contrarian,
  };
}
