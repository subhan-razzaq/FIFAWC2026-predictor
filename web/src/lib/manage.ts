// Manage-mode recompute, in the browser.
//
// Changing a team's eleven changes its squad-quality aggregate, which re-enters
// the same standardized blend the engine used (Section 3.3). We reproduce that
// here from the blend constants and each team's fixed prior components exported
// in model.json, then apply a formation lean and a tactical attack/defence
// tradeoff. The scorer model is rebuilt from the chosen eleven too.

import { arrangeEleven, outcomeProbs, type Model, type ScorerModel, type Squad, type SquadPlayer } from "@weltmeister/sim";
import { counterAttackRisk, type Tactics, tacticalShift } from "./tactics";
import { outOfPositionPenalty } from "./lineup";
import { fatigueMult } from "./fatigue";
import type { PlayerStates } from "./cards";

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

export interface SquadQuality {
  attack: number;
  defence: number;
  /** extra concede risk (log-goal units) from playing people out of position */
  concedePenalty: number;
  /** names of starters fielded out of their natural line */
  mismatches: string[];
}

/**
 * Squad attack/defence aggregates for a custom eleven. `eleven[i]` is taken to
 * occupy slot `i` of the formation, so a player whose natural line differs from
 * that slot is docked (out-of-position). Tired starters contribute less when a
 * stamina map is supplied.
 */
function squadQuality(
  squad: Squad,
  eleven: string[],
  formationName: string,
  states?: PlayerStates,
): SquadQuality {
  const f = FORMATIONS[formationName] ?? FORMATIONS["4-3-3"]!;
  const set = new Set(eleven);
  const minutes = expectedMinutes(squad.players, set);
  const byName = new Map(squad.players.map((p) => [p.name, p]));
  let attack = 0;
  let defence = 0;
  let concedePenalty = 0;
  const mismatches: string[] = [];
  eleven.forEach((name, i) => {
    const p = byName.get(name);
    if (!p) return;
    const slotPos = f.slots[i]?.pos ?? p.group;
    const oop = outOfPositionPenalty(p.group, slotPos);
    if (oop.contrib < 1) mismatches.push(name);
    const fm = states ? fatigueMult(states[name]?.stamina ?? 100) : 1;
    const eff = oop.contrib * fm;
    const mins = minutes.get(name)!;
    attack += (p.npxg90 * p.position_factor + 0.4 * p.xa90) * p.club_strength * mins * eff;
    defence += p.defense_factor * (0.6 + 0.4 * p.ability) * p.club_strength * mins * eff;
    concedePenalty += oop.concede;
  });
  return { attack, defence, concedePenalty: Math.min(0.15, concedePenalty), mismatches };
}

export interface ManagedRatings {
  atk: number;
  def: number;
  mismatches: string[];
  concedePenalty: number;
}

/** Recompute a team's attack/defence ratings for a custom eleven, formation,
 * tactics and (optionally) squad condition. */
export function managedRatings(
  model: Model,
  team: string,
  eleven: string[],
  formationName: string,
  tactics: Tactics,
  states?: PlayerStates,
): ManagedRatings {
  const squad = model.squads[team]!;
  const teamRating = model.teams.find((t) => t.name === team)!;
  const b = model.meta.blend;
  const h = model.meta.hyperparameters;

  const q = squadQuality(squad, eleven, formationName, states);
  const za = (q.attack - b.squad_attack_mean) / b.squad_attack_std;
  const zd = (q.defence - b.squad_def_mean) / b.squad_def_std;
  // the engine standardizes the combined squad terms once more
  const zSqOverall = (za + zd) / b.squad_overall_std;
  const zSqTilt = (za - zd) / b.squad_tilt_std;

  const wMleTilt = 1 - h.w_squad_tilt!;
  const prior = teamRating.prior;
  const zOverall = h.w_mle! * prior.z_overall_mle + h.w_elo! * prior.z_elo + h.w_squad! * zSqOverall;
  const zTilt = wMleTilt * prior.z_tilt_mle + h.w_squad_tilt! * zSqTilt;

  const overall = b.base_mean + zOverall * b.base_std;
  let tilt = (b.tilt_mean + zTilt * b.tilt_std) * h.tilt_shrink!;
  // the formation lean is a pure attack/defence tradeoff
  tilt += FORMATIONS[formationName]?.tilt ?? 0;

  const shift = tacticalShift(tactics);
  // selection quality: fielding a higher-rated XI than the team's projected one
  // lifts attack and defence a touch, a weaker XI dents them. Zero at the default
  // XI and bounded so it stays believable, this is what makes a player's OVR bite
  // on the pitch rather than being a cosmetic number.
  const qBonus = selectionBonus(squad, eleven);
  const atk = (overall + tilt) / 2 + shift.dAtk + qBonus;
  const def = (overall - tilt) / 2 + shift.dDef - q.concedePenalty + qBonus;
  return { atk, def, mismatches: q.mismatches, concedePenalty: q.concedePenalty };
}

/** Bounded attack/defence nudge (log-goal units) from how the chosen eleven's
 * average rating compares to the squad's projected XI. */
function selectionBonus(squad: Squad, eleven: string[]): number {
  const abilityOf = new Map(squad.players.map((p) => [p.name, p.ability]));
  const meanAbility = (names: string[]) => {
    let sum = 0;
    let count = 0;
    for (const n of names) {
      const a = abilityOf.get(n);
      if (a !== undefined) {
        sum += a;
        count += 1;
      }
    }
    return count ? sum / count : 0.5;
  };
  const delta = meanAbility(eleven) - meanAbility(squad.projected_eleven);
  return Math.max(-0.1, Math.min(0.1, delta * 2.2));
}

// EA-style overall rating (a familiar 40-99 scale) from the model's ability index,
// recalibrated so the field looks like a real tournament: a handful of ~90s at the
// very top, most internationals in the 70s-80s, the squad fringe in the 60s. The
// curve is anchored rather than linear, so the elite compress instead of every
// star piling up at 99.
const OVR_ANCHORS: [number, number][] = [
  [0.25, 58],
  [0.32, 67],
  [0.42, 73],
  [0.55, 78],
  [0.7, 82],
  [0.82, 85],
  [0.92, 88],
  [1.0, 91],
];
export function ovr(ability: number): number {
  const a = Math.max(0.25, Math.min(1, ability));
  for (let i = 1; i < OVR_ANCHORS.length; i++) {
    const [a1, o1] = OVR_ANCHORS[i]!;
    if (a <= a1) {
      const [a0, o0] = OVR_ANCHORS[i - 1]!;
      return Math.round(o0 + ((o1 - o0) * (a - a0)) / (a1 - a0));
    }
  }
  return 91;
}

/** Rebuild the scorer model for a custom eleven so attribution tracks the lineup
 * (and fades a tired player's share when a condition map is supplied). */
export function managedScorers(
  squad: Squad,
  eleven: string[],
  penaltyTaker: string,
  states?: PlayerStates,
): ScorerModel {
  const set = new Set(eleven);
  const minutes = expectedMinutes(squad.players, set);
  const weights: { player: string; weight: number }[] = [];
  let total = 0;
  for (const p of squad.players) {
    const fm = states && set.has(p.name) ? fatigueMult(states[p.name]?.stamina ?? 100) : 1;
    const w = p.npxg90 * minutes.get(p.name)! * p.position_factor * fm;
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

/**
 * Build an eleven for a formation, in slot order (GK, then DF/MF/FW lines).
 * `exclude` drops unavailable players (e.g. suspended); `prefer` keeps the user's
 * current picks when the formation changes, falling back to best-by-ability.
 */
export function buildEleven(
  squad: Squad,
  formationName: string,
  opts: { prefer?: string[]; exclude?: Set<string> } = {},
): string[] {
  const f = FORMATIONS[formationName] ?? FORMATIONS["4-3-3"]!;
  const exclude = opts.exclude ?? new Set<string>();
  const prefer = new Set(opts.prefer ?? []);
  const byPos: Record<string, SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of squad.players) if (!exclude.has(p.name)) byPos[p.group]?.push(p);
  for (const k of Object.keys(byPos)) {
    byPos[k]!.sort(
      (a, b) => Number(prefer.has(b.name)) - Number(prefer.has(a.name)) || b.ability - a.ability,
    );
  }
  const out: string[] = [];
  out.push(byPos.GK![0]?.name ?? squad.players.find((p) => !exclude.has(p.name))?.name ?? squad.players[0]!.name);
  (["DF", "MF", "FW"] as const).forEach((pos) => {
    for (const p of byPos[pos]!.slice(0, f.quota[pos])) out.push(p.name);
  });
  // arrange the chosen eleven into the formation's slots by role, so a striker
  // lines up centrally and full-backs stay wide rather than being placed by rating
  return arrangeEleven(squad, out, formationName);
}

/** Pick a default eleven for a formation: best available by ability per quota. */
export function defaultElevenFor(squad: Squad, formationName: string): string[] {
  return buildEleven(squad, formationName);
}

/** Stamina below which a starter is rested by the one-tap rotation. */
export const REST_BELOW = 55;

/**
 * Best XI for a formation that rests tired legs: fresh players (>= REST_BELOW)
 * fill each line by ability first, only dipping into the tired when a line is
 * short of fresh cover. Suspended players are never selected.
 */
export function rotatedEleven(squad: Squad, formationName: string, states: PlayerStates): string[] {
  const f = FORMATIONS[formationName] ?? FORMATIONS["4-3-3"]!;
  const byPos: Record<string, SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of squad.players) {
    if (states[p.name]?.suspendedNext) continue;
    byPos[p.group]?.push(p);
  }
  const fresh = (p: SquadPlayer) => ((states[p.name]?.stamina ?? 100) >= REST_BELOW ? 1 : 0);
  for (const k of Object.keys(byPos)) {
    byPos[k]!.sort((a, b) => fresh(b) - fresh(a) || b.ability - a.ability);
  }
  const out: string[] = [];
  out.push(byPos.GK![0]?.name ?? squad.players[0]!.name);
  (["DF", "MF", "FW"] as const).forEach((pos) => {
    for (const p of byPos[pos]!.slice(0, f.quota[pos])) out.push(p.name);
  });
  return arrangeEleven(squad, out, formationName);
}

export interface MatchOdds {
  /** managed team win / draw / opponent win, summing to ~1 */
  win: number;
  draw: number;
  loss: number;
}

/**
 * Honest win/draw/loss odds for the managed team in a specific fixture, using the
 * SAME Dixon-Coles maths the sim plays out: the chosen XI, formation and tactics
 * set the team's attack/defence, an all-out mentality hands the opponent the
 * counter-attack tax, and the host term lands on the right side. This lets the
 * pre-match panel show how a tactical change actually moves the result.
 */
export function managedMatchOdds(
  model: Model,
  team: string,
  opponent: string,
  eleven: string[],
  formationName: string,
  tactics: Tactics,
  states: PlayerStates | undefined,
  fixture: { isHome: boolean; hostHome: boolean; hostAway: boolean },
): MatchOdds {
  const opp = model.teams.find((t) => t.name === opponent);
  if (!opp) return { win: 0, draw: 0, loss: 0 };
  const me = managedRatings(model, team, eleven, formationName, tactics, states);
  const oppAtk = opp.atk + counterAttackRisk(tactics.mentality);
  const { mu, gamma_host, rho } = model.meta.global;

  // orient the two sides exactly as the engine would for this fixture
  const homeAtk = fixture.isHome ? me.atk : oppAtk;
  const homeDef = fixture.isHome ? me.def : opp.def;
  const awayAtk = fixture.isHome ? oppAtk : me.atk;
  const awayDef = fixture.isHome ? opp.def : me.def;
  const lamHome = Math.exp(mu + homeAtk - awayDef + (fixture.hostHome ? gamma_host : 0));
  const lamAway = Math.exp(mu + awayAtk - homeDef + (fixture.hostAway ? gamma_host : 0));

  const [homeWin, draw, awayWin] = outcomeProbs(lamHome, lamAway, rho);
  return fixture.isHome ? { win: homeWin, draw, loss: awayWin } : { win: awayWin, draw, loss: homeWin };
}
