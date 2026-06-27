// Per-match prediction helper for the UI. Wraps the shared engine so match cards
// and the scoreline heatmap use exactly the same Dixon-Coles maths as the sim.
// The richer matchReport adds the derived markets (both teams to score, totals,
// clean sheets, the most likely scorelines) a head-to-head predictor leans on.

import { SimContext, outcomeProbs, scorelineGrid, type Model } from "@weltmeister/sim";

export interface MatchPrediction {
  lamH: number;
  lamA: number;
  win: number;
  draw: number;
  loss: number;
  grid: number[][];
  modal: { x: number; y: number; p: number };
}

export interface ScoreCell {
  h: number;
  a: number;
  p: number;
}

export interface MatchReport extends MatchPrediction {
  /** the most likely scorelines, busiest first */
  topScores: ScoreCell[];
  /** both teams to score */
  btts: number;
  /** P(total goals over the line), for 1.5 / 2.5 / 3.5 */
  over: { line: number; p: number }[];
  /** home keeps a clean sheet (away fails to score) */
  homeCleanSheet: number;
  /** away keeps a clean sheet (home fails to score) */
  awayCleanSheet: number;
}

function modalOf(grid: number[][]): { x: number; y: number; p: number } {
  let modal = { x: 0, y: 0, p: -1 };
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x]!.length; y++) {
      if (grid[x]![y]! > modal.p) modal = { x, y, p: grid[x]![y]! };
    }
  }
  return modal;
}

export function createPredictor(model: Model) {
  const ctx = new SimContext(model);
  const rho = model.meta.global.rho;

  return {
    match(home: string, away: string, hostHome = false, hostAway = false): MatchPrediction {
      const [lamH, lamA] = ctx.lambdas(home, away, hostHome, hostAway);
      const [win, draw, loss] = outcomeProbs(lamH, lamA, rho);
      const grid = scorelineGrid(lamH, lamA, rho, 6);
      return { lamH, lamA, win, draw, loss, grid, modal: modalOf(grid) };
    },

    // A full head-to-head report: the joint scoreline distribution plus every
    // derived market a broadcast graphic would carry, all from one Dixon-Coles fit.
    report(home: string, away: string, hostHome = false, hostAway = false): MatchReport {
      const [lamH, lamA] = ctx.lambdas(home, away, hostHome, hostAway);
      const [win, draw, loss] = outcomeProbs(lamH, lamA, rho);
      const grid = scorelineGrid(lamH, lamA, rho, 10);

      const cells: ScoreCell[] = [];
      let btts = 0;
      let homeCleanSheet = 0;
      let awayCleanSheet = 0;
      const overCounts = [0, 0, 0]; // total >= 2, >= 3, >= 4
      for (let h = 0; h < grid.length; h++) {
        for (let a = 0; a < grid[h]!.length; a++) {
          const p = grid[h]![a]!;
          cells.push({ h, a, p });
          if (h >= 1 && a >= 1) btts += p;
          if (a === 0) homeCleanSheet += p;
          if (h === 0) awayCleanSheet += p;
          const total = h + a;
          if (total >= 2) overCounts[0]! += p;
          if (total >= 3) overCounts[1]! += p;
          if (total >= 4) overCounts[2]! += p;
        }
      }
      cells.sort((x, y) => y.p - x.p);

      return {
        lamH,
        lamA,
        win,
        draw,
        loss,
        grid,
        modal: { x: cells[0]!.h, y: cells[0]!.a, p: cells[0]!.p },
        topScores: cells.slice(0, 6),
        btts,
        over: [
          { line: 1.5, p: overCounts[0]! },
          { line: 2.5, p: overCounts[1]! },
          { line: 3.5, p: overCounts[2]! },
        ],
        homeCleanSheet,
        awayCleanSheet,
      };
    },
  };
}

/** Probability of an exact scoreline from a report grid (0 if off the grid). */
export function scoreProb(grid: number[][], h: number, a: number): number {
  return grid[h]?.[a] ?? 0;
}

/** Where an exact scoreline ranks among all scorelines (1 = most likely). */
export function scoreRank(grid: number[][], h: number, a: number): number {
  const target = scoreProb(grid, h, a);
  let rank = 1;
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x]!.length; y++) {
      if (grid[x]![y]! > target + 1e-12) rank++;
    }
  }
  return rank;
}
