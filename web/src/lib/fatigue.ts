// Stamina model for the short-tournament survival mechanic.
//
// Every player carries stamina in [0,100], starting fresh. Minutes deplete it
// (forwards and midfielders harder than defenders, keepers least); rest between
// matches recovers some. A tired player is worth less: their effective output is
// scaled by `fatigueMult`, capped at a 20% drop so a knackered star is poor but
// not useless — exactly the 15–20% the brief asks for. This is what forces the
// user to rotate across the three group games instead of riding their best XI.

const ROLE_DEPLETE: Record<string, number> = { GK: 0.4, DF: 0.9, MF: 1.1, FW: 1.0 };
const BASE_DEPLETE = 26; // a full 90 for a midfielder costs ~29 stamina

/** Rest recovery (stamina points) between matches. Knockouts have longer gaps. */
export const GROUP_REST = 16;
export const KO_REST = 22;

/** Effective-output multiplier for a player starting at this stamina. */
export function fatigueMult(stamina: number): number {
  const s = Math.max(0, Math.min(100, stamina));
  return 1 - 0.2 * (1 - s / 100);
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
