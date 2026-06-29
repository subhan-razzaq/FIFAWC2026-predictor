// Random tournament events: injuries, illness and the odd knock, rolled off the run
// seed so the same career always plays out the same way. These are the things a
// real manager wakes up to between games, and they feed straight into availability
// and the inbox.

import { hashSeed } from "@weltmeister/sim";
import type { PlayerStates } from "./cards";
import type { SquadPlayer } from "@weltmeister/sim";

export type EventKind = "injury" | "illness" | "knock";

export interface SquadEvent {
  player: string;
  kind: EventKind;
  detail: string;
  out: number; // matches the player will miss (0 = available but flagged)
}

// a small bank of plausible lay-offs, each with a typical number of matches out
const INJURIES: [string, number][] = [
  ["a hamstring strain", 2],
  ["a twisted ankle", 1],
  ["a knock to the knee", 1],
  ["a calf problem", 2],
  ["a dead leg", 1],
  ["a groin strain", 2],
  ["a hip flexor issue", 1],
];
const ILLNESS: [string, number][] = [
  ["a stomach bug", 1],
  ["a fever", 1],
  ["a heavy cold", 0],
];

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

// a tiny deterministic generator seeded per matchday so events are reproducible
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Roll the events that strike a squad in the build-up to the next match. Fit,
 * available players can pick up an injury, illness or a knock. Deterministic for a
 * given seed and matchday, and intentionally rare so a run is not all bad news.
 */
export function rollSquadEvents(
  seed: number,
  team: string,
  matchday: number,
  players: SquadPlayer[],
  states: PlayerStates,
): SquadEvent[] {
  const rand = rng(hashSeed(`${seed}|events|${team}|${matchday}`));
  const events: SquadEvent[] = [];
  // a squad sees roughly a 55% chance of one event each build-up, rarely two
  const draws = rand() < 0.55 ? (rand() < 0.18 ? 2 : 1) : 0;
  const eligible = players.filter((p) => {
    const c = states[p.name];
    return !(c?.injuredFor && c.injuredFor > 0) && !c?.suspendedNext;
  });
  const usedNames = new Set<string>();
  for (let i = 0; i < draws && eligible.length > 0; i++) {
    const p = eligible[Math.floor(rand() * eligible.length)]!;
    if (usedNames.has(p.name)) continue;
    usedNames.add(p.name);
    const roll = rand();
    if (roll < 0.6) {
      const [detail, out] = pick(rand, INJURIES);
      events.push({ player: p.name, kind: "injury", detail, out });
    } else if (roll < 0.85) {
      const [detail, out] = pick(rand, ILLNESS);
      events.push({ player: p.name, kind: "illness", detail, out });
    } else {
      events.push({ player: p.name, kind: "knock", detail: "a minor knock in training", out: 0 });
    }
  }
  return events;
}

/** Apply rolled events into the condition map (sets injuredFor / injury). */
export function applyEvents(states: PlayerStates, events: SquadEvent[]): PlayerStates {
  const next: PlayerStates = { ...states };
  for (const e of events) {
    if (e.out <= 0) continue;
    const cur = next[e.player] ?? { stamina: 100, yellows: 0, suspendedNext: false };
    next[e.player] = { ...cur, injuredFor: e.out, injury: capitalize(e.detail) };
  }
  return next;
}

/** Tick every lay-off down by one match as the tournament moves on, clearing those
 * who have recovered. Returns the patched states plus the names now fit again. */
export function recoverInjuries(states: PlayerStates): { states: PlayerStates; returned: string[] } {
  const next: PlayerStates = {};
  const returned: string[] = [];
  for (const [name, c] of Object.entries(states)) {
    if (c.injuredFor && c.injuredFor > 0) {
      const left = c.injuredFor - 1;
      if (left <= 0) {
        const { injury: _injury, injuredFor: _out, ...rest } = c;
        next[name] = { ...rest, injuredFor: 0 };
        returned.push(name);
      } else {
        next[name] = { ...c, injuredFor: left };
      }
    } else {
      next[name] = c;
    }
  }
  return { states: next, returned };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
