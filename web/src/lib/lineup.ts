// Out-of-position penalties.
//
// The XI is positional: eleven[i] occupies the i-th slot of the chosen formation,
// so the slot's line (GK/DF/MF/FW) is the role we are asking that player to fill.
// Player roles in the model are coarse (the same four lines), so a mismatch means
// e.g. a striker shoved into central defence. Penalties are deliberately harsh and
// visible ("pronounced but bounded"): a far-out-of-position player loses half
// their output and leaks goals; an outfielder in goal (or a keeper outfield) is a
// disaster.

const POS_RANK: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };

export interface PositionPenalty {
  /** Multiplier on the player's attack & defence contribution (1 = on-position). */
  contrib: number;
  /** Extra team concede risk in log-goal units (lowers defence). */
  concede: number;
}

export function outOfPositionPenalty(natural: string, slot: string): PositionPenalty {
  if (natural === slot) return { contrib: 1, concede: 0 };
  // a keeper outfield, or any outfielder in goal: extreme
  if (natural === "GK" || slot === "GK") return { contrib: 0.35, concede: 0.06 };
  const dist = Math.abs((POS_RANK[natural] ?? 2) - (POS_RANK[slot] ?? 2));
  // far apart (striker at the back, defender up top)
  if (dist >= 2) return { contrib: 0.5, concede: 0.05 };
  // one line out (forward in midfield, midfielder at full-back)
  return { contrib: 0.7, concede: 0.02 };
}

export function isOutOfPosition(natural: string, slot: string): boolean {
  return natural !== slot;
}
