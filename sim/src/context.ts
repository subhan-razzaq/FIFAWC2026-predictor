// Simulation context: an indexed, mutable-friendly view of the model.
//
// Holds per-team ratings, the global Dixon-Coles parameters, and precomputed
// scorer sampling tables. Manage mode passes overrides so one team's ratings and
// scorer model can change without touching the rest, which is what makes the live
// re-sim cheap.

import type { Rng } from "./rng";
import type { GoalEvent, Model, ScorerModel, Squad, TeamRating } from "./types";

// fraction of open-play goals credited with an assist
const ASSIST_RATE = 0.74;

export interface TeamState {
  name: string;
  atk: number;
  def: number;
  host: boolean;
  group: string;
  pot: number;
  fifaRank: number;
}

interface ScorerTable {
  players: string[];
  cdf: Float64Array;
  penaltyTaker: string;
  penaltyShare: number;
  ownGoalShare: number;
}

interface AssistTable {
  players: string[];
  cdf: Float64Array;
}

export interface Overrides {
  ratings?: Record<string, { atk: number; def: number }>;
  scorers?: Record<string, ScorerModel>;
}

// starters dominate assists; weight the projected eleven by expected assists.
function buildAssistTable(squad: Squad): AssistTable {
  const starters = new Set(squad.projected_eleven);
  const entries = squad.players
    .filter((p) => starters.has(p.name))
    .map((p) => ({ name: p.name, w: p.xa90 + 0.02 }));
  const total = entries.reduce((s, e) => s + e.w, 0) || 1;
  const players: string[] = [];
  const cdf = new Float64Array(entries.length);
  let acc = 0;
  for (let i = 0; i < entries.length; i++) {
    acc += entries[i]!.w / total;
    players.push(entries[i]!.name);
    cdf[i] = acc;
  }
  if (cdf.length > 0) cdf[cdf.length - 1] = 1;
  return { players, cdf };
}

function keeperOf(squad: Squad): string {
  const gk = squad.players.find((p) => p.group === "GK" && squad.projected_eleven.includes(p.name));
  return gk?.name ?? squad.projected_eleven[0] ?? "Goalkeeper";
}

function buildScorerTable(s: ScorerModel): ScorerTable {
  const players: string[] = [];
  const cdf = new Float64Array(s.open_play.length);
  let acc = 0;
  let total = 0;
  for (const w of s.open_play) total += w.weight;
  for (let i = 0; i < s.open_play.length; i++) {
    const op = s.open_play[i]!;
    acc += op.weight / total;
    players.push(op.player);
    cdf[i] = acc;
  }
  if (cdf.length > 0) cdf[cdf.length - 1] = 1;
  return {
    players,
    cdf,
    penaltyTaker: s.penalty_taker,
    penaltyShare: s.penalty_share,
    ownGoalShare: s.own_goal_share,
  };
}

export class SimContext {
  readonly mu: number;
  readonly gamma: number;
  readonly rho: number;
  readonly teams = new Map<string, TeamState>();
  private readonly scorers = new Map<string, ScorerTable>();
  private readonly assists = new Map<string, AssistTable>();
  private readonly keepers = new Map<string, string>();

  constructor(model: Model, overrides: Overrides = {}) {
    this.mu = model.meta.global.mu;
    this.gamma = model.meta.global.gamma_host;
    this.rho = model.meta.global.rho;

    for (const t of model.teams) {
      const o = overrides.ratings?.[t.name];
      this.teams.set(t.name, {
        name: t.name,
        atk: o ? o.atk : t.atk,
        def: o ? o.def : t.def,
        host: t.host,
        group: t.group,
        pot: t.pot,
        fifaRank: t.fifa_rank,
      });
    }
    for (const [name, s] of Object.entries(model.scorers)) {
      this.scorers.set(name, buildScorerTable(overrides.scorers?.[name] ?? s));
    }
    for (const [name, squad] of Object.entries(model.squads)) {
      this.assists.set(name, buildAssistTable(squad));
      this.keepers.set(name, keeperOf(squad));
    }
  }

  keeper(team: string): string {
    return this.keepers.get(team) ?? "Goalkeeper";
  }

  team(name: string): TeamState {
    const t = this.teams.get(name);
    if (!t) throw new Error(`unknown team: ${name}`);
    return t;
  }

  /**
   * Expected goals for a match. Host advantage is added only for a host nation,
   * matching the 2026 neutral-venue rule. In a 90-minute match the full gamma
   * applies; pass `minutesScale` < 1 for extra time.
   */
  lambdas(
    home: string,
    away: string,
    hostHome: boolean,
    hostAway: boolean,
    minutesScale = 1,
  ): [number, number] {
    const h = this.team(home);
    const a = this.team(away);
    const gh = hostHome ? this.gamma : 0;
    const ga = hostAway ? this.gamma : 0;
    const lamH = Math.exp(this.mu + h.atk - a.def + gh) * minutesScale;
    const lamA = Math.exp(this.mu + a.atk - h.def + ga) * minutesScale;
    return [lamH, lamA];
  }

  /** Attribute `n` goals scored by `team` to players, appending to `out`. */
  attributeGoals(rng: Rng, team: string, n: number, out: GoalEvent[]): void {
    const tbl = this.scorers.get(team);
    for (let g = 0; g < n; g++) {
      if (!tbl || tbl.players.length === 0) {
        out.push({ team, player: "Unattributed", kind: "open" });
        continue;
      }
      const r = rng.next();
      if (r < tbl.ownGoalShare) {
        out.push({ team, player: "Own goal", kind: "own" });
      } else if (r < tbl.ownGoalShare + tbl.penaltyShare) {
        out.push({ team, player: tbl.penaltyTaker, kind: "penalty" });
      } else {
        const u = rng.next();
        let i = 0;
        while (i < tbl.cdf.length - 1 && tbl.cdf[i]! < u) i++;
        const scorer = tbl.players[i]!;
        const ev: GoalEvent = { team, player: scorer, kind: "open" };
        const assister = this.pickAssister(rng, team, scorer);
        if (assister) ev.assist = assister;
        out.push(ev);
      }
    }
  }

  /** Most open-play goals are assisted by a teammate, weighted by expected
   * assists. Returns undefined for unassisted goals or when no teammate is found. */
  private pickAssister(rng: Rng, team: string, scorer: string): string | undefined {
    if (rng.next() >= ASSIST_RATE) return undefined;
    const at = this.assists.get(team);
    if (!at || at.players.length < 2) return undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const u = rng.next();
      let i = 0;
      while (i < at.cdf.length - 1 && at.cdf[i]! < u) i++;
      const a = at.players[i]!;
      if (a !== scorer) return a;
    }
    return undefined;
  }
}

/** Convenience for tests and tools: a minimal model-less context is not allowed;
 * always build from a Model. */
export function teamRatingMap(model: Model): Map<string, TeamRating> {
  const m = new Map<string, TeamRating>();
  for (const t of model.teams) m.set(t.name, t);
  return m;
}
