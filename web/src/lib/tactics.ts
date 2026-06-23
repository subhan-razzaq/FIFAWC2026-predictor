// Tactical sliders, mapped to bounded attack/defence shifts on the managed team.
//
// The engine scores goals from a Dixon-Coles Poisson, lambda = exp(mu + atk
// − oppDef + host). The only honest lever manage mode has is the team's atk/def,
// so each slider resolves into a small log-goal delta. Magnitudes are tuned
// "pronounced but bounded": a maxed-out setting clearly swings a scoreline, but
// the three together cap at roughly ±0.18 log units (~±20% on expected goals),
// so results stay believable.

export interface Tactics {
  /** −1 ultra-defensive (park the bus) … +1 all-out attack. */
  mentality: number;
  /** 0 sit deep … 1 high press. */
  pressing: number;
  /** 0 slow build-up … 1 fast, direct counters. */
  pacing: number;
}

export const DEFAULT_TACTICS: Tactics = { mentality: 0, pressing: 0.5, pacing: 0.5 };

export interface TacticalShift {
  dAtk: number;
  dDef: number;
}

/** Resolve the sliders into attack/defence deltas (log-goal units). */
export function tacticalShift(t: Tactics): TacticalShift {
  // Mentality is a pure attack/defence trade-off (a tilt): push one up, the other down.
  const mentalityTilt = clamp(t.mentality, -1, 1) * 0.22;
  // High pressing wins the ball higher (more attack) but leaves space on the
  // break (less defence); sitting deep tightens the back line.
  const press = clamp(t.pressing, 0, 1) - 0.5;
  const pressAtk = press * 0.12;
  const pressDef = -press * 0.1;
  // Fast, direct play trades a little control for more attacking thrust.
  const pace = clamp(t.pacing, 0, 1) - 0.5;
  const paceAtk = pace * 0.1;
  const paceDef = -pace * 0.04;
  return {
    dAtk: mentalityTilt / 2 + pressAtk + paceAtk,
    dDef: -mentalityTilt / 2 + pressDef + paceDef,
  };
}

/**
 * Extra attack handed to the OPPONENT (log-goal units) when the managed side
 * over-commits. Pushing the mentality toward all-out attack tilts your own
 * attack/defence up via `tacticalShift`, but it also leaves space in behind: this
 * is the counter-attack tax. A balanced or defensive setup adds nothing; maxed
 * out it lifts the opponent's expected goals by roughly 12%.
 */
export function counterAttackRisk(mentality: number): number {
  const m = clamp(mentality, -1, 1);
  return m > 0 ? m * 0.12 : 0;
}

export function mentalityLabel(m: number): string {
  if (m <= -0.66) return "Ultra-defensive";
  if (m <= -0.2) return "Defensive";
  if (m < 0.2) return "Balanced";
  if (m < 0.66) return "Attacking";
  return "All-out attack";
}

export function pressingLabel(p: number): string {
  if (p <= 0.25) return "Sit deep";
  if (p < 0.45) return "Contain";
  if (p < 0.6) return "Balanced";
  if (p < 0.8) return "Press";
  return "High press";
}

export function pacingLabel(p: number): string {
  if (p <= 0.25) return "Slow build-up";
  if (p < 0.45) return "Patient";
  if (p < 0.6) return "Balanced";
  if (p < 0.8) return "Direct";
  return "Fast counter";
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
