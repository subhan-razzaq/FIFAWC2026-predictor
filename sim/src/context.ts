// Simulation context: an indexed, mutable-friendly view of the model.
//
// Holds per-team ratings, the global Dixon-Coles parameters, and precomputed
// scorer sampling tables. Manage mode passes overrides so one team's ratings and
// scorer model can change without touching the rest, which is what makes the live
// re-sim cheap.

import type { Rng } from "./rng";
import type { GoalEvent, Model, ScorerModel, TeamRating } from "./types";

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

export interface Overrides {
  ratings?: Record<string, { atk: number; def: number }>;
  scorers?: Record<string, ScorerModel>;
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
        out.push({ team, player: tbl.players[i]!, kind: "open" });
      }
    }
  }
}

/** Convenience for tests and tools: a minimal model-less context is not allowed;
 * always build from a Model. */
export function teamRatingMap(model: Model): Map<string, TeamRating> {
  const m = new Map<string, TeamRating>();
  for (const t of model.teams) m.set(t.name, t);
  return m;
}
