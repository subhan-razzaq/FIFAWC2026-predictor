// Test helpers (loaded only by the test suite).

import { readFileSync } from "node:fs";
import type { MatchResult, Model, Stage } from "./types";

let cached: Model | undefined;

/** Load the real exported model.json for integration tests. */
export function loadModel(): Model {
  if (!cached) {
    const url = new URL("../../web/public/data/model.json", import.meta.url);
    cached = JSON.parse(readFileSync(url, "utf-8")) as Model;
  }
  return cached;
}

/** Build a group MatchResult with a known scoreline (no scorer detail needed). */
export function mk(home: string, away: string, hg: number, ag: number, stage: Stage = "group"): MatchResult {
  return { home, away, homeGoals: hg, awayGoals: ag, stage, scorers: [] };
}
