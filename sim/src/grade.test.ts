import { describe, expect, it } from "vitest";
import { gradeBracket, type BracketPrediction } from "./grade";
import { runMonteCarlo } from "./montecarlo";
import { loadModel } from "./testutil";

/** Build the favourites bracket from the model ratings, the same shape a user fills. */
function favouritesPrediction(model: ReturnType<typeof loadModel>): BracketPrediction {
  const byGroup: Record<string, { name: string; rating: number }[]> = {};
  for (const t of model.teams) (byGroup[t.group] ??= []).push({ name: t.name, rating: t.rating });
  const groupOrder: Record<string, string[]> = {};
  for (const [g, arr] of Object.entries(byGroup)) {
    groupOrder[g] = [...arr].sort((a, b) => b.rating - a.rating).map((t) => t.name);
  }
  const ranked = [...model.teams].sort((a, b) => b.rating - a.rating).map((t) => t.name);
  return { groupOrder, finalFour: ranked.slice(0, 4), finalists: ranked.slice(0, 2), champion: ranked[0]! };
}

describe("bracket grading (real model)", () => {
  const model = loadModel();
  const pred = favouritesPrediction(model);

  it("is reproducible for a fixed seed", () => {
    const a = gradeBracket(model, pred, { runs: 400, seed: 2026 });
    const b = gradeBracket(model, pred, { runs: 400, seed: 2026 });
    expect(a.userExpectedScore).toBe(b.userExpectedScore);
    expect(a.champion.prob).toBe(b.champion.prob);
    expect(a.groups.map((g) => g.exactProb)).toEqual(b.groups.map((g) => g.exactProb));
  });

  it("produces coherent probabilities", () => {
    const g = gradeBracket(model, pred, { runs: 1500, seed: 7 });
    expect(g.groups.length).toBe(12);
    for (const grp of g.groups) {
      expect(grp.exactProb).toBeGreaterThanOrEqual(0);
      expect(grp.exactProb).toBeLessThanOrEqual(1);
      // the exact-order chance can't exceed the chance of merely getting the winner right
      expect(grp.exactProb).toBeLessThanOrEqual(grp.winnerProb + 1e-9);
      // a predicted top-two team advances at least as often as it tops the group
      expect(grp.advanceProb[0]).toBeGreaterThanOrEqual(grp.winnerProb - 1e-9);
    }
    expect(g.champion.prob).toBeGreaterThanOrEqual(0);
    expect(g.champion.prob).toBeLessThanOrEqual(1);
    expect(g.perfectProb).toBeGreaterThan(0);
    expect(g.perfectProb).toBeLessThan(1);

    // the title board is a sane, descending top-contenders list
    expect(g.titleBoard.length).toBeGreaterThan(0);
    expect(g.titleBoard.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < g.titleBoard.length; i++) {
      expect(g.titleBoard[i - 1]!.prob).toBeGreaterThanOrEqual(g.titleBoard[i]!.prob - 1e-9);
    }
  });

  it("matches the Monte Carlo champion marginal for the favourite", () => {
    const seed = 99;
    const runs = 2000;
    const g = gradeBracket(model, pred, { runs, seed });
    const mc = runMonteCarlo(model, { runs, seed });
    const fav = mc.teams.find((t) => t.team === pred.champion)!;
    // same seed, same simulations: the title odds should line up closely
    expect(g.champion.prob).toBeCloseTo(fav.champion, 2);
  });

  it("scores the favourites bracket as model-aligned chalk", () => {
    const g = gradeBracket(model, pred, { runs: 1200, seed: 3 });
    // the favourites bracket IS the chalk benchmark, so alignment should be ~1
    expect(g.alignment).toBeGreaterThan(0.95);
    expect(g.grade).toBe("A+");
    expect(g.userExpectedScore).toBeGreaterThan(0);
    expect(g.bestCaseScore).toBeGreaterThanOrEqual(g.userExpectedScore);
    expect(g.maxScore).toBe(12 * 10 + 4 * 8 + 2 * 12 + 30);
  });
});
