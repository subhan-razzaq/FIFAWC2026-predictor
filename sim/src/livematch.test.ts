import { describe, expect, it } from "vitest";
import { simulateLiveSegment, simulateLiveShootout, type LiveSpec } from "./livematch";
import { loadModel } from "./testutil";
import type { Overrides } from "./context";

describe("live match engine (real model)", () => {
  const model = loadModel();
  const home = model.teams[3]!.name;
  const away = model.teams[17]!.name;
  const spec: LiveSpec = { home, away, stage: "group", hostHome: false, hostAway: false };

  it("is reproducible for a fixed seed, spec and overrides", () => {
    const a = simulateLiveSegment(model, {}, 12345, spec, 0, 45);
    const b = simulateLiveSegment(model, {}, 12345, spec, 0, 45);
    expect(a.homeGoals).toBe(b.homeGoals);
    expect(a.awayGoals).toBe(b.awayGoals);
    expect(a.goals.map((g) => `${g.minute}-${g.player}`)).toEqual(b.goals.map((g) => `${g.minute}-${g.player}`));
  });

  it("stamps every goal inside the segment window", () => {
    for (let seed = 0; seed < 40; seed++) {
      const seg = simulateLiveSegment(model, {}, seed, spec, 45, 90);
      for (const g of seg.goals) {
        expect(g.minute).toBeGreaterThan(45);
        expect(g.minute).toBeLessThanOrEqual(90);
        expect(g.type).toBe("goal");
      }
      // the goal events agree with the scoreline they were drawn from
      expect(seg.goals.filter((g) => g.side === "home").length).toBe(seg.homeGoals);
      expect(seg.goals.filter((g) => g.side === "away").length).toBe(seg.awayGoals);
    }
  });

  it("an attacking override genuinely lifts a side's goals across many halves", () => {
    const cautious: Overrides = { ratings: { [home]: { atk: 0.2, def: 1.6 } } };
    const allOut: Overrides = { ratings: { [home]: { atk: 2.4, def: 0.2 } } };
    let cautiousGoals = 0;
    let allOutGoals = 0;
    for (let seed = 0; seed < 300; seed++) {
      cautiousGoals += simulateLiveSegment(model, cautious, seed, spec, 0, 45).homeGoals;
      allOutGoals += simulateLiveSegment(model, allOut, seed, spec, 0, 45).homeGoals;
    }
    // tactics drive the maths, not the other way round
    expect(allOutGoals).toBeGreaterThan(cautiousGoals);
  });

  it("a shootout always returns a clean winner", () => {
    for (let seed = 0; seed < 20; seed++) {
      const so = simulateLiveShootout(model, {}, seed, home, away);
      expect(so.home).not.toBe(so.away);
      expect(so.winner === home || so.winner === away).toBe(true);
      expect(so.winner).toBe(so.home > so.away ? home : away);
    }
  });
});
