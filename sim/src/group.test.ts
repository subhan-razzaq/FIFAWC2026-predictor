import { describe, expect, it } from "vitest";
import { computeStandings } from "./group";
import { Rng } from "./rng";
import { mk } from "./testutil";

const fifa = new Map([
  ["T1", 1],
  ["T2", 2],
  ["T3", 3],
  ["T4", 4],
]);

describe("group standings", () => {
  it("ranks a clean no-tie table by points", () => {
    // T1 wins all, T2 wins two, T3 wins one, T4 loses all
    const matches = [
      mk("T1", "T2", 1, 0),
      mk("T1", "T3", 2, 0),
      mk("T1", "T4", 3, 0),
      mk("T2", "T3", 1, 0),
      mk("T2", "T4", 1, 0),
      mk("T3", "T4", 2, 1),
    ];
    const table = computeStandings(["T1", "T2", "T3", "T4"], matches, fifa, new Rng(1));
    expect(table.map((s) => s.team)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(table[0]!.points).toBe(9);
    expect(table[1]!.points).toBe(6);
    expect(table[3]!.points).toBe(0);
    expect(table[0]!.gd).toBe(6);
  });

  it("breaks a points tie by head-to-head", () => {
    // T1 and T2 both finish on 6; T2 beat T1 head-to-head so T2 ranks higher,
    // even though T1 has the better overall goal difference.
    const matches = [
      mk("T2", "T1", 1, 0), // h2h: T2 over T1
      mk("T1", "T3", 5, 0),
      mk("T1", "T4", 5, 0),
      mk("T2", "T3", 1, 0),
      mk("T4", "T2", 1, 0), // T2's only loss, so T1 and T2 both finish on 6
      mk("T3", "T4", 2, 0),
    ];
    const table = computeStandings(["T1", "T2", "T3", "T4"], matches, fifa, new Rng(1));
    expect(table[0]!.team).toBe("T2");
    expect(table[1]!.team).toBe("T1");
    expect(table[0]!.points).toBe(6);
    expect(table[1]!.points).toBe(6);
    // T1 still has the larger overall goal difference despite ranking second
    expect(table[1]!.gd).toBeGreaterThan(table[0]!.gd);
  });

  it("falls through to overall goal difference when head-to-head is level", () => {
    // T1 and T2 draw head-to-head and both beat T3, T4; T1 wins by more so leads.
    const matches = [
      mk("T1", "T2", 1, 1),
      mk("T1", "T3", 4, 0),
      mk("T1", "T4", 3, 0),
      mk("T2", "T3", 1, 0),
      mk("T2", "T4", 1, 0),
      mk("T3", "T4", 0, 0),
    ];
    const table = computeStandings(["T1", "T2", "T3", "T4"], matches, fifa, new Rng(1));
    expect(table[0]!.team).toBe("T1");
    expect(table[1]!.team).toBe("T2");
  });

  it("assigns ranks 1 through 4", () => {
    const matches = [
      mk("T1", "T2", 1, 0),
      mk("T1", "T3", 1, 0),
      mk("T1", "T4", 1, 0),
      mk("T2", "T3", 1, 0),
      mk("T2", "T4", 1, 0),
      mk("T3", "T4", 1, 0),
    ];
    const table = computeStandings(["T1", "T2", "T3", "T4"], matches, fifa, new Rng(1));
    expect(table.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });
});
