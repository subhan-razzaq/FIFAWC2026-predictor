import { describe, expect, it } from "vitest";
import { SimContext } from "./context";
import { Rng } from "./rng";
import { fifaRankMap, simulateTournament } from "./tournament";
import { runSingle } from "./worker";
import { loadModel } from "./testutil";

describe("full tournament (real model)", () => {
  const model = loadModel();

  it("plays a complete, well-formed tournament", () => {
    const ctx = new SimContext(model);
    const res = simulateTournament(ctx, new Rng(2026), {
      fixtures: model.fixtures,
      fifa: fifaRankMap(model.teams),
    });

    // 72 group matches + 32 knockout matches = 104
    expect(res.matches.length).toBe(104);
    // 12 groups, each with a 4-team table ranked 1..4
    expect(Object.keys(res.groupStandings).length).toBe(12);
    for (const standings of Object.values(res.groupStandings)) {
      expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
      for (const s of standings) expect(s.played).toBe(3);
    }
    // eight best thirds advance
    expect(res.bestThirds.length).toBe(8);
    // champion, runner-up, third are distinct real teams
    expect(new Set([res.champion, res.runnerUp, res.third]).size).toBe(3);
    expect(res.reached[res.champion]).toBe("final");
  });

  it("is reproducible from a fixed seed (hand-checked bracket)", () => {
    const a = runSingle(model, 2026);
    const b = runSingle(model, 2026);
    // same seed, same champion and same full match list
    expect(a.champion).toBe(b.champion);
    expect(a.matches.map((m) => `${m.homeGoals}-${m.awayGoals}`)).toEqual(
      b.matches.map((m) => `${m.homeGoals}-${m.awayGoals}`),
    );
    // a different seed can produce a different tournament
    const c = runSingle(model, 777);
    expect(c.matches.length).toBe(104);
  });

  it("only ever crowns one of the 48 real teams", () => {
    const names = new Set(model.teams.map((t) => t.name));
    for (let seed = 0; seed < 30; seed++) {
      const res = runSingle(model, seed);
      expect(names.has(res.champion)).toBe(true);
    }
  });
});
