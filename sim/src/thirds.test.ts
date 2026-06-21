import { describe, expect, it } from "vitest";
import { allocateThirds } from "./bracket";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// eligibility lists per winner-slot (mirrors bracket.ts THIRD_SLOTS)
const ELIGIBLE: Record<number, string[]> = {
  74: ["A", "B", "C", "D", "F"],
  77: ["C", "D", "F", "G", "H"],
  79: ["C", "E", "F", "H", "I"],
  80: ["E", "H", "I", "J", "K"],
  81: ["B", "E", "F", "I", "J"],
  82: ["A", "E", "H", "I", "J"],
  85: ["E", "F", "G", "I", "J"],
  87: ["D", "E", "I", "J", "L"],
};

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]!);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

describe("thirds allocation", () => {
  it("produces a valid perfect matching for all 495 qualifying combinations", () => {
    const combos = combinations(GROUPS, 8);
    expect(combos.length).toBe(495);
    for (const qualified of combos) {
      const assignment = allocateThirds(qualified);
      const slots = Object.keys(assignment).map(Number);
      // all eight winner-slots filled
      expect(slots.sort((a, b) => a - b)).toEqual([74, 77, 79, 80, 81, 82, 85, 87]);
      const usedGroups = new Set<string>();
      for (const [slot, group] of Object.entries(assignment)) {
        // each assigned group is eligible for its slot and a qualifier
        expect(ELIGIBLE[Number(slot)]).toContain(group);
        expect(qualified).toContain(group);
        usedGroups.add(group);
      }
      // exactly the eight qualifying groups, each used once
      expect(usedGroups.size).toBe(8);
      expect([...usedGroups].sort()).toEqual([...qualified].sort());
    }
  });
});
