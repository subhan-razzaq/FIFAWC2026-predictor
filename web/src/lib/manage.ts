// Manage-mode recompute, in the browser.
//
// Changing a team's eleven changes its squad-quality aggregate, which re-enters
// the same standardized blend the engine used (Section 3.3). We reproduce that
// here from the blend constants and each team's fixed prior components exported
// in model.json, then apply a formation lean and a tactical attack/defence
// tradeoff. The scorer model is rebuilt from the chosen eleven too.

import type { Model, ScorerModel, Squad, SquadPlayer } from "@weltmeister/sim";

export interface Formation {
  name: string;
  // outfield quota by coarse position (GK is always 1)
  quota: { DF: number; MF: number; FW: number };
  // small extra attack(+) / defence(-) lean in log-goal units
  tilt: number;
  // pitch slot coordinates (x,y in 0..100) for the eleven, GK first
  slots: { x: number; y: number; pos: "GK" | "DF" | "MF" | "FW" }[];
}

const row = (pos: "GK" | "DF" | "MF" | "FW", y: number, xs: number[]) =>
  xs.map((x) => ({ x, y, pos }));

export const FORMATIONS: Record<string, Formation> = {
  "4-3-3": {
    name: "4-3-3",
    quota: { DF: 4, MF: 3, FW: 3 },
    tilt: 0,
    slots: [
      ...row("GK", 92, [50]),
      ...row("DF", 72, [16, 38, 62, 84]),
      ...row("MF", 48, [28, 50, 72]),
      ...row("FW", 22, [22, 50, 78]),
    ],
  },
  "4-4-2": {
    name: "4-4-2",
    quota: { DF: 4, MF: 4, FW: 2 },
    tilt: -0.01,
    slots: [
      ...row("GK", 92, [50]),
      ...row("DF", 72, [16, 38, 62, 84]),
      ...row("MF", 48, [16, 38, 62, 84]),
      ...row("FW", 22, [36, 64]),
    ],
  },
  "4-2-3-1": {
    name: "4-2-3-1",
    quota: { DF: 4, MF: 5, FW: 1 },
    tilt: 0.0,
    slots: [
      ...row("GK", 92, [50]),
      ...row("DF", 72, [16, 38, 62, 84]),
      ...row("MF", 54, [36, 64]),
      ...row("MF", 36, [22, 50, 78]),
      ...row("FW", 18, [50]),
    ],
  },
  "3-5-2": {
    name: "3-5-2",
    quota: { DF: 3, MF: 5, FW: 2 },
    tilt: 0.03,
    slots: [
      ...row("GK", 92, [50]),
      ...row("DF", 74, [28, 50, 72]),
      ...row("MF", 48, [12, 32, 50, 68, 88]),
      ...row("FW", 22, [36, 64]),
    ],
  },
  "3-4-3": {
    name: "3-4-3",
    quota: { DF: 3, MF: 4, FW: 3 },
    tilt: 0.06,
    slots: [
      ...row("GK", 92, [50]),
      ...row("DF", 74, [28, 50, 72]),
      ...row("MF", 50, [16, 38, 62, 84]),
      ...row("FW", 22, [22, 50, 78]),
    ],
  },
  "5-3-2": {
    name: "5-3-2",
    quota: { DF: 5, MF: 3, FW: 2 },
    tilt: -0.07,
    slots: [
      ...row("GK", 92, [50]),
      ...row("DF", 74, [10, 30, 50, 70, 90]),
      ...row("MF", 48, [28, 50, 72]),
      ...row("FW", 22, [36, 64]),
    ],
  },
};

const STARTER_MIN = 0.88;
const ROTATION_MIN = 0.3;
const BENCH_MIN = 0.08;

function expectedMinutes(players: SquadPlayer[], eleven: Set<string>): Map<string, number> {
  const bench = players.filter((p) => !eleven.has(p.name)).sort((a, b) => b.ability - a.ability);
  const rotation = new Set(bench.slice(0, 5).map((p) => p.name));
  const m = new Map<string, number>();
  for (const p of players) {
    m.set(p.name, eleven.has(p.name) ? STARTER_MIN : rotation.has(p.name) ? ROTATION_MIN : BENCH_MIN);
  }
  return m;
}

function squadQuality(players: SquadPlayer[], eleven: string[]): { attack: number; defence: number } {
  const set = new Set(eleven);
  const minutes = expectedMinutes(players, set);
  let attack = 0;
  let defence = 0;
  for (const p of players) {
    if (!set.has(p.name)) continue;
    const mins = minutes.get(p.name)!;
    attack += (p.npxg90 * p.position_factor + 0.4 * p.xa90) * p.club_strength * mins;
    defence += p.defense_factor * (0.6 + 0.4 * p.ability) * p.club_strength * mins;
  }
  return { attack, defence };
}

export interface ManagedRatings {
  atk: number;
  def: number;
}

/** Recompute a team's attack/defence ratings for a custom eleven. */
export function managedRatings(
  model: Model,
  team: string,
  eleven: string[],
  formationName: string,
  attackBias: number,
): ManagedRatings {
  const squad = model.squads[team]!;
  const teamRating = model.teams.find((t) => t.name === team)!;
  const b = model.meta.blend;
  const h = model.meta.hyperparameters;

  const { attack, defence } = squadQuality(squad.players, eleven);
  const za = (attack - b.squad_attack_mean) / b.squad_attack_std;
  const zd = (defence - b.squad_def_mean) / b.squad_def_std;
  // the engine standardizes the combined squad terms once more
  const zSqOverall = (za + zd) / b.squad_overall_std;
  const zSqTilt = (za - zd) / b.squad_tilt_std;

  const wMleTilt = 1 - h.w_squad_tilt!;
  const prior = teamRating.prior;
  const zOverall = h.w_mle! * prior.z_overall_mle + h.w_elo! * prior.z_elo + h.w_squad! * zSqOverall;
  let zTilt = wMleTilt * prior.z_tilt_mle + h.w_squad_tilt! * zSqTilt;

  const overall = b.base_mean + zOverall * b.base_std;
  let tilt = (b.tilt_mean + zTilt * b.tilt_std) * h.tilt_shrink!;
  // formation lean and the tactical slider are pure attack/defence tradeoffs
  tilt += (FORMATIONS[formationName]?.tilt ?? 0) + attackBias * 0.2;

  return { atk: (overall + tilt) / 2, def: (overall - tilt) / 2 };
}

/** Rebuild the scorer model for a custom eleven so attribution tracks the lineup. */
export function managedScorers(squad: Squad, eleven: string[], penaltyTaker: string): ScorerModel {
  const set = new Set(eleven);
  const minutes = expectedMinutes(squad.players, set);
  const weights: { player: string; weight: number }[] = [];
  let total = 0;
  for (const p of squad.players) {
    const w = p.npxg90 * minutes.get(p.name)! * p.position_factor;
    if (w > 0) {
      weights.push({ player: p.name, weight: w });
      total += w;
    }
  }
  const open_play = weights
    .map((w) => ({ player: w.player, weight: w.weight / total }))
    .sort((a, b) => b.weight - a.weight);
  return { open_play, penalty_taker: penaltyTaker, penalty_share: 0.1, own_goal_share: 0.035 };
}

/** Pick a default eleven for a formation: best available by ability per quota. */
export function defaultElevenFor(squad: Squad, formationName: string): string[] {
  const f = FORMATIONS[formationName] ?? FORMATIONS["4-3-3"]!;
  const byPos: Record<string, SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of squad.players) byPos[p.group]?.push(p);
  for (const k of Object.keys(byPos)) byPos[k]!.sort((a, b) => b.ability - a.ability);
  const out: string[] = [];
  out.push(byPos.GK![0]?.name ?? squad.players[0]!.name);
  (["DF", "MF", "FW"] as const).forEach((pos) => {
    for (const p of byPos[pos]!.slice(0, f.quota[pos])) out.push(p.name);
  });
  return out;
}
