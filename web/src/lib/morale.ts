// Player form, morale and team chemistry: the soft factors that sit alongside
// stamina and turn a squad into a living thing across a tournament.
//
// Form is a rolling -5..+5 number nudged by how a player actually performed (goals,
// assists, the match rating off the canonical timeline, the result). It shifts the
// overall the badge shows, by up to a couple of points, the way a hot or cold
// streak does in a sports game. Morale is 0..100 happiness moved by minutes, results
// and the manager's press answers; a happy, in-form side carries a small chemistry
// bonus, an unhappy one a penalty, and that feeds the team rating exactly like
// fatigue does. Everything is deterministic given the same matches and seed.

import type { PlayerStates } from "./cards";

export const FORM_MIN = -5;
export const FORM_MAX = 5;

function clampForm(v: number): number {
  return Math.max(FORM_MIN, Math.min(FORM_MAX, v));
}

function clampMorale(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** The overall adjustment (whole points) a player's form earns: hot form lifts the
 * displayed rating, a slump drops it. Capped at +/-3. */
export function formOvrDelta(form: number | undefined): number {
  if (!form) return 0;
  return Math.round(clampForm(form) * 0.6);
}

/** A short label for a player's form, for chips and the inbox. */
export function formLabel(form: number | undefined): "hot" | "good" | "steady" | "poor" | "cold" {
  const f = form ?? 0;
  if (f >= 3) return "hot";
  if (f >= 1) return "good";
  if (f <= -3) return "cold";
  if (f <= -1) return "poor";
  return "steady";
}

export function moraleLabel(morale: number | undefined): "buzzing" | "happy" | "settled" | "unsettled" | "unhappy" {
  const m = morale ?? 70;
  if (m >= 85) return "buzzing";
  if (m >= 70) return "happy";
  if (m >= 50) return "settled";
  if (m >= 30) return "unsettled";
  return "unhappy";
}

/**
 * Effective-output multiplier from form and morale, mirroring `fatigueMult`. A
 * red-hot, buzzing player is worth a few percent more, a cold and unhappy one a few
 * percent less. Deliberately gentler than fatigue so the lineup still matters most.
 */
export function formMoraleMult(form: number | undefined, morale: number | undefined): number {
  const f = clampForm(form ?? 0) / FORM_MAX; // -1..1
  const m = (clampMorale(morale ?? 70) - 70) / 30; // ~ -2.3..1
  return 1 + 0.05 * f + 0.03 * Math.max(-1, Math.min(1, m));
}

export interface PerfInput {
  played: boolean;
  minutes: number;
  rating: number; // match rating off the enriched timeline (~4.5..10)
  goals: number;
  assists: number;
  won: boolean;
  drew: boolean;
  benched: boolean; // in the squad but did not feature
}

/** Update one player's form and morale from a single match. Pure: returns a fresh
 * condition patch. */
export function applyPerformance(form: number | undefined, morale: number | undefined, perf: PerfInput): { form: number; morale: number } {
  let f = clampForm(form ?? 0);
  let m = clampMorale(morale ?? 70);

  if (perf.played) {
    // form tracks the rating, pulling toward a baseline of 6.7
    f += (perf.rating - 6.7) * 0.9 + perf.goals * 0.5 + perf.assists * 0.3;
    f = clampForm(f * 0.85); // decay toward zero so streaks fade
    m += (perf.won ? 6 : perf.drew ? 1 : -4) + perf.goals * 2 + (perf.minutes >= 60 ? 2 : 0);
  } else if (perf.benched) {
    f = clampForm(f * 0.8);
    m += (perf.won ? 1 : perf.drew ? 0 : -2) - 4; // wants to play
  }
  return { form: f, morale: clampMorale(m) };
}

export interface TeamMorale {
  /** 0..100 average morale across the squad. */
  morale: number;
  /** 0..100 chemistry, blending morale and how settled the form is. */
  chemistry: number;
}

/** Roll the squad's individual conditions up into a team morale and chemistry,
 * starting players weighted double since they set the dressing-room tone. */
export function teamMorale(states: PlayerStates, eleven: string[]): TeamMorale {
  const set = new Set(eleven);
  let wsum = 0;
  let mSum = 0;
  let formSpread = 0;
  let n = 0;
  for (const [name, c] of Object.entries(states)) {
    const w = set.has(name) ? 2 : 1;
    wsum += w;
    mSum += w * (c.morale ?? 70);
    formSpread += Math.abs(c.form ?? 0);
    n += 1;
  }
  const morale = wsum ? mSum / wsum : 70;
  // chemistry dips when forms are wildly uneven across the group
  const spread = n ? formSpread / n : 0;
  const chemistry = clampMorale(morale - spread * 3);
  return { morale, chemistry };
}

/** The team-wide output multiplier from squad morale and chemistry, applied to the
 * managed side's ratings like the fatigue penalty. */
export function chemistryMult(tm: TeamMorale): number {
  const m = (tm.morale - 70) / 30;
  const c = (tm.chemistry - 70) / 30;
  return 1 + 0.04 * Math.max(-1, Math.min(1, m)) + 0.03 * Math.max(-1, Math.min(1, c));
}
