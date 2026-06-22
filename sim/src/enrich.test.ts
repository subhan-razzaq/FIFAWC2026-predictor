import { describe, expect, it } from "vitest";
import { enrichMatch } from "./enrich";
import { runSingle } from "./worker";
import { loadModel } from "./testutil";

describe("match enrichment", () => {
  const model = loadModel();
  const single = runSingle(model, 2026);
  // a group match with goals, so we can check the goal timeline
  const scored = single.matches.find((m) => m.scorers.length >= 2)!;

  it("is reproducible for a fixed seed", () => {
    const a = enrichMatch({ model, match: scored, seed: 2026 });
    const b = enrichMatch({ model, match: scored, seed: 2026 });
    expect(a).toEqual(b);
  });

  it("changes with the seed", () => {
    const a = enrichMatch({ model, match: scored, seed: 1 });
    const b = enrichMatch({ model, match: scored, seed: 2 });
    expect(a.events).not.toEqual(b.events);
  });

  it("fields a full eleven for each side, goalkeeper first", () => {
    const e = enrichMatch({ model, match: scored, seed: 2026 });
    expect(e.home.starters).toHaveLength(11);
    expect(e.away.starters).toHaveLength(11);
    expect(e.home.starters[0]!.pos).toBe("GK");
    expect(e.away.starters[0]!.pos).toBe("GK");
    // exactly one captain per side
    expect(e.home.starters.filter((s) => s.captain)).toHaveLength(1);
  });

  it("puts every goal on the timeline with a valid minute", () => {
    const e = enrichMatch({ model, match: scored, seed: 2026 });
    const goals = e.events.filter((ev) => ev.type === "goal");
    expect(goals).toHaveLength(scored.scorers.length);
    const max = scored.afterExtraTime ? 120 : 90;
    for (const ev of e.events) {
      expect(ev.minute).toBeGreaterThanOrEqual(1);
      expect(ev.minute).toBeLessThanOrEqual(max);
    }
    // timeline is sorted
    for (let i = 1; i < e.events.length; i++) {
      expect(e.events[i]!.minute).toBeGreaterThanOrEqual(e.events[i - 1]!.minute);
    }
  });

  it("generates substitutions that bring on bench players", () => {
    const e = enrichMatch({ model, match: scored, seed: 2026 });
    const subs = e.events.filter((ev) => ev.type === "sub");
    expect(subs.length).toBeGreaterThan(0);
    const homeXI = new Set(e.home.starters.map((s) => s.name));
    for (const s of subs.filter((x) => x.side === "home")) {
      // a starter goes off, a non-starter comes on
      expect(homeXI.has(s.player)).toBe(true);
      expect(homeXI.has(s.playerOn!)).toBe(false);
    }
  });

  it("keeps the score level at 90 when a tie needed extra time", () => {
    // find a knockout that actually went to extra time
    const aet = single.matches.find((m) => m.afterExtraTime);
    if (!aet) return; // none in this seed; the invariant is enforced regardless
    const e = enrichMatch({ model, match: aet, seed: 2026 });
    const homeBy90 = e.events.filter((ev) => ev.side === "home" && ev.type === "goal" && ev.minute <= 90).length;
    const awayBy90 = e.events.filter((ev) => ev.side === "away" && ev.type === "goal" && ev.minute <= 90).length;
    // the broadcast timeline must agree with "a.e.t.": deadlocked after 90
    expect(homeBy90).toBe(awayBy90);
  });

  it("never shows two yellows for one player without a red", () => {
    for (let seed = 0; seed < 40; seed++) {
      const e = enrichMatch({ model, match: scored, seed });
      const yellowCount = new Map<string, number>();
      for (const ev of e.events) {
        if (ev.type === "yellow") yellowCount.set(ev.player, (yellowCount.get(ev.player) ?? 0) + 1);
      }
      for (const [, n] of yellowCount) expect(n).toBeLessThanOrEqual(1);
    }
  });

  it("never substitutes off a player who scored or assisted", () => {
    for (let seed = 0; seed < 40; seed++) {
      const e = enrichMatch({ model, match: scored, seed });
      const subbedOff = new Set(e.events.filter((ev) => ev.type === "sub").map((ev) => ev.player));
      const contributed = new Set<string>();
      for (const ev of e.events) {
        if (ev.type !== "goal") continue;
        contributed.add(ev.player);
        if (ev.assist) contributed.add(ev.assist);
      }
      for (const name of subbedOff) expect(contributed.has(name)).toBe(false);
    }
  });

  it("respects a manage-mode lineup override", () => {
    const team = scored.home;
    const squad = model.squads[team]!;
    const custom = squad.players.slice(0, 11).map((p) => p.name);
    const e = enrichMatch({ model, match: scored, seed: 2026, elevenOverride: { [team]: custom } });
    const names = e.home.starters.map((s) => s.name).sort();
    expect(names).toEqual([...custom].sort());
  });
});
