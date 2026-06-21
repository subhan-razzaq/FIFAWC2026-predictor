import { describe, expect, it } from "vitest";
import { runMonteCarlo } from "./montecarlo";
import { loadModel } from "./testutil";

describe("monte carlo (real model)", () => {
  const model = loadModel();

  it("is reproducible for a fixed seed", () => {
    const a = runMonteCarlo(model, { runs: 400, seed: 2026 });
    const b = runMonteCarlo(model, { runs: 400, seed: 2026 });
    expect(a.teams.map((t) => [t.team, t.champion])).toEqual(
      b.teams.map((t) => [t.team, t.champion]),
    );
    expect(a.scorers[0]).toEqual(b.scorers[0]);
  });

  it("produces coherent probabilities", () => {
    const res = runMonteCarlo(model, { runs: 1500, seed: 7 });
    expect(res.teams.length).toBe(48);

    // champion probabilities sum to 1 (one champion per run)
    const champSum = res.teams.reduce((s, t) => s + t.champion, 0);
    expect(champSum).toBeCloseTo(1, 6);

    // exactly 32 teams advance to the knockouts per run, so the round32
    // probabilities sum to 32 across all teams
    const r32Sum = res.teams.reduce((s, t) => s + t.round32, 0);
    expect(r32Sum).toBeGreaterThan(31.9);
    expect(r32Sum).toBeLessThan(32.1);

    // monotonic funnel: a team cannot reach the final more often than the semis
    for (const t of res.teams) {
      expect(t.round32).toBeGreaterThanOrEqual(t.round16 - 1e-9);
      expect(t.round16).toBeGreaterThanOrEqual(t.quarter - 1e-9);
      expect(t.quarter).toBeGreaterThanOrEqual(t.semi - 1e-9);
      expect(t.semi).toBeGreaterThanOrEqual(t.final - 1e-9);
      expect(t.final).toBeGreaterThanOrEqual(t.champion - 1e-9);
      expect(t.champion).toBeGreaterThanOrEqual(0);
      expect(t.advance).toBeLessThanOrEqual(1 + 1e-9);
    }

    // a strong side should be among the title favourites
    const top = [...res.teams].sort((a, b) => b.champion - a.champion).slice(0, 8).map((t) => t.team);
    const strong = ["Spain", "France", "England", "Brazil", "Argentina", "Portugal", "Germany"];
    expect(strong.some((s) => top.includes(s))).toBe(true);
  });

  it("produces a plausible Golden Boot race", () => {
    const res = runMonteCarlo(model, { runs: 1500, seed: 11 });
    expect(res.scorers.length).toBeGreaterThan(10);
    // the leading scorer should average a meaningful number of goals and be a
    // recognisable attacker on a strong team
    expect(res.scorers[0]!.expectedGoals).toBeGreaterThan(0.5);
    expect(res.scorers[0]!.team).not.toBe("");
    const gbSum = res.scorers.reduce((s, x) => s + x.goldenBootProb, 0);
    expect(gbSum).toBeLessThanOrEqual(1.0001);
  });
});
