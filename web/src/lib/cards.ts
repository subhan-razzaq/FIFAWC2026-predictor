// Card accumulation and suspensions across the tournament.
//
// FIFA's rule: two yellows in separate matches earns a one-game ban, a straight
// red earns a ban, and accumulated yellows are wiped after the quarter-finals so
// nobody misses a final on a soft booking from the group stage. We model exactly
// that. Suspended players cannot be selected for the next match; sitting it out
// serves the ban.

/** Per-player career condition, shared by the fatigue and card systems. */
export interface PlayerCondition {
  /** 0..100, drives the fatigue multiplier. */
  stamina: number;
  /** unserved yellow cards toward a suspension. */
  yellows: number;
  /** banned from the next match. */
  suspendedNext: boolean;
}

export type PlayerStates = Record<string, PlayerCondition>;

export function freshCondition(): PlayerCondition {
  return { stamina: 100, yellows: 0, suspendedNext: false };
}

/** Fold a played match's cards into the condition map (mutates a copy is the
 * caller's job). Two yellows ⇒ ban + reset; a red ⇒ ban. */
export function applyMatchCards(
  states: PlayerStates,
  yellows: string[],
  reds: string[],
): PlayerStates {
  const next: PlayerStates = { ...states };
  const ensure = (name: string) => {
    next[name] = next[name] ? { ...next[name]! } : freshCondition();
    return next[name]!;
  };
  for (const name of yellows) {
    const c = ensure(name);
    c.yellows += 1;
    if (c.yellows >= 2) {
      c.yellows = 0;
      c.suspendedNext = true;
    }
  }
  for (const name of reds) {
    ensure(name).suspendedNext = true;
  }
  return next;
}

/** After a match is played, the players who were banned for it have served their
 * suspension and become available again. */
export function clearServedSuspensions(states: PlayerStates, suspendedForThisMatch: string[]): PlayerStates {
  const next: PlayerStates = { ...states };
  for (const name of suspendedForThisMatch) {
    if (next[name]) next[name] = { ...next[name]!, suspendedNext: false };
  }
  return next;
}

/** Wipe accumulated yellows (called after the quarter-finals, per FIFA rules). */
export function wipeYellows(states: PlayerStates): PlayerStates {
  const next: PlayerStates = {};
  for (const [name, c] of Object.entries(states)) next[name] = { ...c, yellows: 0 };
  return next;
}

export function isAvailable(states: PlayerStates, name: string): boolean {
  return !states[name]?.suspendedNext;
}
