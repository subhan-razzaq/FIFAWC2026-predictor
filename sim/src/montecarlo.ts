// Monte Carlo aggregation (Section 4): run one tournament N times from a base
// seed and roll the results up into probabilities. Counters accumulate
// incrementally so memory stays flat even at 50,000 runs.

import { SimContext, type Overrides } from "./context";
import { deriveSeed, Rng } from "./rng";
import { simulateTournament, type TournamentInput } from "./tournament";
import type { Model, Stage } from "./types";

const DEPTH: Record<Stage, number> = {
  group: 0, R32: 1, R16: 2, QF: 3, SF: 4, third_place: 4, final: 5,
};

export interface TeamOdds {
  team: string;
  group: string;
  champion: number;
  final: number;
  semi: number;
  quarter: number;
  round16: number;
  round32: number; // reached the knockouts at all
  winGroup: number;
  advance: number; // top two or a qualifying third
  avgGroupRank: number;
}

export interface ScorerOdds {
  player: string;
  team: string;
  expectedGoals: number;
  goldenBootProb: number;
}

export interface AssistOdds {
  player: string;
  team: string;
  expectedAssists: number;
}

export interface CleanSheetOdds {
  player: string;
  team: string;
  expectedCleanSheets: number;
}

export interface MonteCarloResult {
  runs: number;
  seed: number;
  teams: TeamOdds[];
  scorers: ScorerOdds[];
  assisters: AssistOdds[];
  cleanSheets: CleanSheetOdds[];
  generatedFromSnapshot: string;
}

export interface MonteCarloOptions {
  runs: number;
  seed: number;
  overrides?: Overrides;
  onProgress?: (done: number, total: number) => void;
  progressEvery?: number;
}

interface Acc {
  champion: number;
  final: number;
  semi: number;
  quarter: number;
  round16: number;
  round32: number;
  winGroup: number;
  advance: number;
  rankSum: number;
}

export function runMonteCarlo(model: Model, opts: MonteCarloOptions): MonteCarloResult {
  const ctx = new SimContext(model, opts.overrides ?? {});
  const input: TournamentInput = {
    fixtures: model.fixtures,
    fifa: new Map(model.teams.map((t) => [t.name, t.fifa_rank])),
  };
  const groupOf = new Map(model.teams.map((t) => [t.name, t.group]));
  const playerTeam = buildPlayerTeamMap(model);

  const acc = new Map<string, Acc>();
  for (const t of model.teams) {
    acc.set(t.name, {
      champion: 0, final: 0, semi: 0, quarter: 0, round16: 0, round32: 0,
      winGroup: 0, advance: 0, rankSum: 0,
    });
  }
  const scorerGoals = new Map<string, number>();
  const goldenBoot = new Map<string, number>();
  const assistTotals = new Map<string, number>();
  const cleanSheetTotals = new Map<string, number>();

  const every = opts.progressEvery ?? Math.max(1, Math.floor(opts.runs / 50));

  for (let i = 0; i < opts.runs; i++) {
    const rng = new Rng(deriveSeed(opts.seed, i));
    const res = simulateTournament(ctx, rng, input);

    // per-round survival
    for (const [team, stage] of Object.entries(res.reached)) {
      const a = acc.get(team)!;
      const d = DEPTH[stage];
      if (d >= 1) a.round32++;
      if (d >= 2) a.round16++;
      if (d >= 3) a.quarter++;
      if (d >= 4) a.semi++;
      if (d >= 5) a.final++;
    }
    acc.get(res.champion)!.champion++;

    // group outcomes
    const advancing = new Set<string>([...res.bestThirds]);
    for (const standings of Object.values(res.groupStandings)) {
      for (const s of standings) {
        const a = acc.get(s.team)!;
        a.rankSum += s.rank;
        if (s.rank === 1) a.winGroup++;
        if (s.rank <= 2) advancing.add(s.team);
      }
    }
    for (const team of advancing) acc.get(team)!.advance++;

    // Golden Boot
    let maxGoals = 0;
    const leaders: string[] = [];
    for (const [player, g] of Object.entries(res.goals)) {
      scorerGoals.set(player, (scorerGoals.get(player) ?? 0) + g);
      if (g > maxGoals) {
        maxGoals = g;
        leaders.length = 0;
        leaders.push(player);
      } else if (g === maxGoals && g > 0) {
        leaders.push(player);
      }
    }
    if (leaders.length > 0) {
      const share = 1 / leaders.length;
      for (const p of leaders) goldenBoot.set(p, (goldenBoot.get(p) ?? 0) + share);
    }

    for (const [player, a] of Object.entries(res.assists)) {
      assistTotals.set(player, (assistTotals.get(player) ?? 0) + a);
    }
    for (const [keeper, cs] of Object.entries(res.cleanSheets)) {
      cleanSheetTotals.set(keeper, (cleanSheetTotals.get(keeper) ?? 0) + cs);
    }

    if (opts.onProgress && (i + 1) % every === 0) opts.onProgress(i + 1, opts.runs);
  }

  const N = opts.runs;
  const teams: TeamOdds[] = model.teams.map((t) => {
    const a = acc.get(t.name)!;
    return {
      team: t.name,
      group: groupOf.get(t.name)!,
      champion: a.champion / N,
      final: a.final / N,
      semi: a.semi / N,
      quarter: a.quarter / N,
      round16: a.round16 / N,
      round32: a.round32 / N,
      winGroup: a.winGroup / N,
      advance: a.advance / N,
      avgGroupRank: a.rankSum / N,
    };
  });
  teams.sort((x, y) => y.champion - x.champion || y.advance - x.advance);

  const scorers: ScorerOdds[] = [...scorerGoals.entries()]
    .map(([player, g]) => ({
      player,
      team: playerTeam.get(player) ?? "",
      expectedGoals: g / N,
      goldenBootProb: (goldenBoot.get(player) ?? 0) / N,
    }))
    .sort((a, b) => b.expectedGoals - a.expectedGoals)
    .slice(0, 60);

  const assisters: AssistOdds[] = [...assistTotals.entries()]
    .map(([player, a]) => ({ player, team: playerTeam.get(player) ?? "", expectedAssists: a / N }))
    .sort((x, y) => y.expectedAssists - x.expectedAssists)
    .slice(0, 60);

  const cleanSheets: CleanSheetOdds[] = [...cleanSheetTotals.entries()]
    .map(([player, cs]) => ({ player, team: playerTeam.get(player) ?? "", expectedCleanSheets: cs / N }))
    .sort((x, y) => y.expectedCleanSheets - x.expectedCleanSheets)
    .slice(0, 40);

  if (opts.onProgress) opts.onProgress(N, N);

  return {
    runs: N,
    seed: opts.seed,
    teams,
    scorers,
    assisters,
    cleanSheets,
    generatedFromSnapshot: model.meta.snapshot_date,
  };
}

function buildPlayerTeamMap(model: Model): Map<string, string> {
  const m = new Map<string, string>();
  for (const [team, squad] of Object.entries(model.squads)) {
    for (const p of squad.players) m.set(p.name, team);
  }
  return m;
}
