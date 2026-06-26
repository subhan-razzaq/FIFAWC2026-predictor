// Stamina model for the short-tournament survival mechanic.
//
// Every player carries stamina in [0,100], starting fresh. Minutes deplete it
// (forwards and midfielders harder than defenders, keepers least); rest between
// matches recovers some. A tired player is worth less: their effective output is
// scaled by `fatigueMult`. Above half stamina the wear is gentle, but BELOW 50%
// the penalty turns steep: a player run into the ground falls off a cliff, which
// is what forces the user to rotate and to use the half-time window rather than
// riding their best XI through the whole month.

const ROLE_DEPLETE: Record<string, number> = { GK: 0.4, DF: 0.9, MF: 1.1, FW: 1.0 };
const BASE_DEPLETE = 26; // a full 90 for a midfielder costs ~29 stamina

/** Rest recovery (stamina points) between matches. Knockouts have longer gaps. */
export const GROUP_REST = 16;
export const KO_REST = 22;

/** The stamina at which the heavy penalty kicks in. */
export const FATIGUE_THRESHOLD = 50;

/**
 * Effective-output multiplier for a player starting at this stamina. Gentle
 * linear wear down to 50% (about a 6% loss at the threshold), then a steep
 * quadratic penalty below it, bottoming out near a 34% loss for a spent player.
 */
export function fatigueMult(stamina: number): number {
  const s = Math.max(0, Math.min(100, stamina));
  const linear = 1 - 0.12 * (1 - s / 100);
  if (s >= FATIGUE_THRESHOLD) return linear;
  const deficit = (FATIGUE_THRESHOLD - s) / FATIGUE_THRESHOLD; // 0 at 50%, 1 at empty
  return linear - 0.22 * deficit * deficit;
}

/** True when a player is fatigued enough to carry the heavy penalty. */
export function isFatigued(stamina: number): boolean {
  return stamina < FATIGUE_THRESHOLD;
}

/** New stamina after playing `minutes` in a position group. */
export function depleteStamina(current: number, minutes: number, posGroup: string): number {
  const drop = (minutes / 90) * BASE_DEPLETE * (ROLE_DEPLETE[posGroup] ?? 1);
  return Math.max(0, current - drop);
}

/** New stamina after a rest period (players who sat out recover fully over a game). */
export function recoverStamina(current: number, restPoints: number): number {
  return Math.min(100, current + restPoints);
}

export type StaminaTier = "fresh" | "ok" | "tired" | "spent";

export function staminaTier(s: number): StaminaTier {
  if (s >= 80) return "fresh";
  if (s >= 55) return "ok";
  if (s >= 30) return "tired";
  return "spent";
}
