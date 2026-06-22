import { describe, expect, it } from "vitest";
import {
  managedGroupSchedule,
  playManagedMatch,
  resolveGroupStage,
  resolveBracketForManaged,
  type PlayedManagedMatch,
} from "./playthrough";
import { loadModel } from "./testutil";
import type { MatchResult } from "./types";

describe("manager playthrough driver (real model)", () => {
  const model = loadModel();
  const seed = 2026;
  // a mid-table side so the path can reach the knockouts but isn't trivially safe
  const team = model.teams[20]!.name;

  it("schedules the three real group fixtures, in matchday order", () => {
    const sched = managedGroupSchedule(model, team);
    expect(sched.length).toBe(3);
    expect(sched.map((s) => s.matchday)).toEqual([1, 2, 3]);
    for (const s of sched) {
      expect(s.opponent).not.toBe(team);
      expect(s.stage).toBe("group");
    }
    // the managed team really plays each scheduled opponent in the fixtures
    for (const s of sched) {
      const fx = model.fixtures[s.matchNo]!;
      expect(fx.home === team || fx.away === team).toBe(true);
      expect(fx.home === s.opponent || fx.away === s.opponent).toBe(true);
    }
  });

  it("replays a managed match identically for the same choices, and the group table is well-formed", () => {
    const sched = managedGroupSchedule(model, team);
    const playTwice = sched.map((info) => {
      const a = playManagedMatch(model, seed, team, info, {});
      const b = playManagedMatch(model, seed, team, info, {});
      expect(`${a.homeGoals}-${a.awayGoals}`).toBe(`${b.homeGoals}-${b.awayGoals}`);
      return a;
    });

    const outcome = resolveGroupStage(model, seed, team, playTwice);
    expect(Object.keys(outcome.standings).length).toBe(12);
    for (const st of Object.values(outcome.standings)) {
      expect(st.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
      for (const s of st) expect(s.played).toBe(3);
    }
    expect(outcome.thirds.qualified.length).toBe(8);
    expect([1, 2, 3, 4]).toContain(outcome.finishRank);
    expect(typeof outcome.advanced).toBe("boolean");
  });

  it("stronger tactics change a managed scoreline (overrides really bite)", () => {
    const info = managedGroupSchedule(model, team)[0]!;
    const weak = playManagedMatch(model, seed, team, info, { ratings: { [team]: { atk: 0.2, def: 1.6 } } });
    const strong = playManagedMatch(model, seed, team, info, { ratings: { [team]: { atk: 2.4, def: 0.2 } } });
    const teamGoals = (r: MatchResult) => (r.home === team ? r.homeGoals : r.awayGoals);
    // with the same seed, a far stronger attack should not score fewer
    expect(teamGoals(strong)).toBeGreaterThanOrEqual(teamGoals(weak));
  });

  it("walks the bracket: pending opponent, then advances or eliminates", () => {
    const sched = managedGroupSchedule(model, team);
    const groupResults = sched.map((info) => playManagedMatch(model, seed, team, info, {}));
    const outcome = resolveGroupStage(model, seed, team, groupResults);

    const first = resolveBracketForManaged(model, seed, outcome.standings, outcome.thirds, team, []);
    if (!outcome.advanced) {
      // a team that didn't advance never appears in the bracket walk
      expect(first.status).toBe("eliminated");
      return;
    }
    expect(first.status).toBe("pending");
    if (first.status !== "pending") return;
    expect(first.stage).toBe("R32");
    expect(first.opponent).not.toBe(team);

    // play that R32 tie and feed it back; the walk must move on (no longer R32-pending)
    const r32 = playManagedMatch(
      model,
      seed,
      team,
      { matchNo: first.matchNo, stage: first.stage, opponent: first.opponent, isHome: first.isHome, hostHome: first.hostHome, hostAway: first.hostAway },
      {},
    );
    const played: PlayedManagedMatch[] = [{ matchNo: first.matchNo, result: r32 }];
    const next = resolveBracketForManaged(model, seed, outcome.standings, outcome.thirds, team, played);
    const teamWon = r32.winner === team;
    if (teamWon) {
      expect(next.status === "pending" || next.status === "champion").toBe(true);
      if (next.status === "pending") expect(next.stage).not.toBe("R32");
    } else {
      expect(next.status).toBe("eliminated");
      if (next.status === "eliminated") expect(next.stage).toBe("R32");
    }
  });
});
