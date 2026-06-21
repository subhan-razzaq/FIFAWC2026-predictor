// Per-match prediction helper for the UI. Wraps the shared engine so match cards
// and the scoreline heatmap use exactly the same Dixon-Coles maths as the sim.

import { SimContext, outcomeProbs, scorelineGrid, type Model } from "@weltmeister/sim";

export interface MatchPrediction {
  lamH: number;
  lamA: number;
  win: number;
  draw: number;
  loss: number;
  grid: number[][];
  modal: { x: number; y: number; p: number };
  topScores: { x: number; y: number; p: number }[];
}

export function createPredictor(model: Model) {
  const ctx = new SimContext(model);
  const rho = model.meta.global.rho;

  return {
    match(home: string, away: string, hostHome = false, hostAway = false): MatchPrediction {
      const [lamH, lamA] = ctx.lambdas(home, away, hostHome, hostAway);
      const [win, draw, loss] = outcomeProbs(lamH, lamA, rho);
      const grid = scorelineGrid(lamH, lamA, rho, 6);
      const cells: { x: number; y: number; p: number }[] = [];
      for (let x = 0; x < grid.length; x++) {
        for (let y = 0; y < grid[x]!.length; y++) cells.push({ x, y, p: grid[x]![y]! });
      }
      cells.sort((a, b) => b.p - a.p);
      return { lamH, lamA, win, draw, loss, grid, modal: cells[0]!, topScores: cells.slice(0, 5) };
    },
  };
}
