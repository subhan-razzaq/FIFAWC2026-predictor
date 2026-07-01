// Competition-wide awards, computed across the WHOLE tournament rather than just
// the managed team. We take a full single simulation of the tournament on the run's
// seed, splice in the manager's actual results for the games they played, then enrich
// every match to get real scorers and per-player ratings. From that we hand out the
// tournament's Golden Boot, Golden Ball, Golden Glove, Best Young Player (aged 21 or
// under) and a Team of the Tournament, each from any nation, not only the user's.

import {
  enrichMatch,
  FINAL,
  QF,
  R16,
  R32,
  SF,
  type MatchResult,
  type Model,
  type Stage,
  type TournamentResult,
} from "@weltmeister/sim";
import type { PlayedMatch } from "../store/store";
import { YOUNG_PLAYER_MAX_AGE, type Awards, type AwardWinner, type TotwSlot } from "./awards";
import { resolveBracket, seedR32, type Side } from "./predictBracket";

interface Acc {
  player: string;
  team: string;
  goals: number;
  assists: number;
  ratingSum: number;
  apps: number;
  cleanSheets: number;
  pos: "GK" | "DF" | "MF" | "FW";
}

const STAGE_ORDER: Stage[] = ["group", "R32", "R16", "QF", "SF", "third_place", "final"];

/**
 * Reconcile the simulated tournament with the manager's real run. The manager's own
 * matches are the ones they actually played, in the order they played them; every
 * other team's matches come from the simulation. Crucially, we drop the simulation's
 * fictional versions of the manager team's games (which pair them with different
 * opponents or scorelines than the user saw), so the feed never contradicts what the
 * user actually did.
 */
function reconcileResults(matches: MatchResult[], played: PlayedMatch[], managerTeam: string): MatchResult[] {
  const others = matches.filter((m) => m.home !== managerTeam && m.away !== managerTeam);
  const mine = played.map((p) => p.result);
  return [...others, ...mine];
}

/** The team the manager is running: the one nation that appears in every game they
 * have played (their opponents all differ, they are the constant). */
function managerTeamOf(played: PlayedMatch[]): string {
  const first = played[0];
  if (!first) return "";
  if (played.length === 1) return first.info.isHome ? first.result.home : first.result.away;
  const second = played[1]!;
  const a = new Set([first.result.home, first.result.away]);
  if (a.has(second.result.home) && a.has(second.result.away)) {
    // both teams reappear (unlikely), fall back to the info flag
    return first.info.isHome ? first.result.home : first.result.away;
  }
  return a.has(second.result.home) ? second.result.home : second.result.away;
}

/** Accumulate per-player goals, assists, ratings and clean sheets across a set of
 * matches, enriching each one for real scorers and per-player ratings. */
function accumulate(model: Model, seed: number, matches: MatchResult[]): Acc[] {
  const acc = new Map<string, Acc>();
  const groupOf = (team: string, name: string) =>
    (model.squads[team]?.players.find((p) => p.name === name)?.group ?? "MF") as Acc["pos"];
  const ensure = (team: string, name: string, pos: Acc["pos"]): Acc => {
    const key = `${team}|${name}`;
    let a = acc.get(key);
    if (!a) {
      a = { player: name, team, goals: 0, assists: 0, ratingSum: 0, apps: 0, cleanSheets: 0, pos };
      acc.set(key, a);
    }
    return a;
  };

  for (const m of matches) {
    const enriched = enrichMatch({ model, match: m, seed });
    for (const side of [enriched.home, enriched.away]) {
      const team = side.team;
      const conceded = team === m.home ? m.awayGoals : m.homeGoals;
      for (const s of side.starters) {
        const a = ensure(team, s.name, s.pos);
        a.ratingSum += s.rating;
        a.apps += 1;
        if (s.pos === "GK" && conceded === 0) a.cleanSheets += 1;
      }
    }
    for (const ev of enriched.events) {
      if (ev.type !== "goal" || ev.kind === "own") continue;
      ensure(ev.team, ev.player, groupOf(ev.team, ev.player)).goals += 1;
      if (ev.assist) ensure(ev.team, ev.assist, groupOf(ev.team, ev.assist)).assists += 1;
    }
  }
  return [...acc.values()].filter((a) => a.apps > 0);
}

const avgOf = (a: Acc) => a.ratingSum / Math.max(1, a.apps);
const ballScoreOf = (a: Acc) => avgOf(a) + a.goals * 0.25 + a.assists * 0.15;

/** Build the competition-wide awards from a full tournament and the manager's run. */
export function competitionAwards(
  model: Model,
  seed: number,
  result: TournamentResult,
  played: PlayedMatch[],
): Awards {
  const managerTeam = managerTeamOf(played);
  const matches = reconcileResults(result.matches, played, managerTeam);
  const all = accumulate(model, seed, matches);
  const photoOf = (team: string, name: string) => model.squads[team]?.players.find((p) => p.name === name)?.photo ?? null;
  const ageOf = (team: string, name: string) => model.squads[team]?.players.find((p) => p.name === name)?.age;

  const winner = (a: Acc | undefined, detail: string, value: number): AwardWinner | undefined =>
    a ? { player: a.player, photo: photoOf(a.team, a.player), team: a.team, detail, value } : undefined;

  const scorers = all.filter((a) => a.goals > 0).sort((x, y) => y.goals - x.goals || y.assists - x.assists);
  const goldenBoot = scorers[0] ? winner(scorers[0], `${scorers[0].goals} goals · ${scorers[0].team}`, scorers[0].goals) : undefined;

  const outfield = all.filter((a) => a.pos !== "GK").sort((x, y) => ballScoreOf(y) - ballScoreOf(x));
  const goldenBall = outfield[0] ? winner(outfield[0], `${avgOf(outfield[0]).toFixed(2)} avg · ${outfield[0].team}`, avgOf(outfield[0])) : undefined;

  const keepers = all.filter((a) => a.pos === "GK").sort((x, y) => y.cleanSheets - x.cleanSheets || avgOf(y) - avgOf(x));
  const goldenGlove = keepers[0] ? winner(keepers[0], `${keepers[0].cleanSheets} clean sheets · ${keepers[0].team}`, keepers[0].cleanSheets) : undefined;

  const young = all
    .filter((a) => {
      const age = ageOf(a.team, a.player);
      return age !== undefined && age <= YOUNG_PLAYER_MAX_AGE;
    })
    .sort((x, y) => ballScoreOf(y) - ballScoreOf(x));
  const youngPlayer = young[0] ? winner(young[0], `Age ${ageOf(young[0].team, young[0].player)} · ${young[0].team}`, avgOf(young[0])) : undefined;

  const slot = (pos: Acc["pos"], n: number): TotwSlot[] =>
    all
      .filter((a) => a.pos === pos)
      .sort((x, y) => ballScoreOf(y) - ballScoreOf(x))
      .slice(0, n)
      .map((a) => ({ player: a.player, photo: photoOf(a.team, a.player), pos, rating: avgOf(a) }));
  const teamOfTournament = [...slot("GK", 1), ...slot("DF", 4), ...slot("MF", 3), ...slot("FW", 3)];

  return { goldenBoot, goldenBall, goldenGlove, youngPlayer, teamOfTournament };
}

// --- live tournament state (available at any point during the run) -------------

export interface RaceEntry {
  player: string;
  team: string;
  photo: string | null;
  value: number;
  detail: string;
}

export interface CompetitionResults {
  stage: Stage;
  label: string;
  matches: MatchResult[];
}

export interface CompetitionState {
  goldenBoot: RaceEntry[];
  goldenBall: RaceEntry[];
  goldenGlove: RaceEntry[];
  youngPlayer: RaceEntry[];
  results: CompetitionResults[];
  matchesPlayed: number;
}

const STAGE_LABEL: Record<Stage, string> = {
  group: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  third_place: "Third-place play-off",
  final: "Final",
};

/** A team-pair key that ignores home/away order, for matching results to fixtures. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Look up each group fixture's matchday (1..3) by its team pairing. */
function buildMatchdayIndex(model: Model): Map<string, number> {
  const idx = new Map<string, number>();
  for (const f of model.fixtures) {
    if (f.stage === "group" && f.matchday) idx.set(pairKey(f.home, f.away), f.matchday);
  }
  return idx;
}

/**
 * Group the revealed matches into rounds for the results feed, newest first. The
 * group stage is split into its three matchdays (like the knockout rounds are
 * separate blocks), so results read one round at a time rather than as one long
 * list. Later stages are one block each.
 */
function groupResultsByRound(model: Model, revealed: MatchResult[]): CompetitionResults[] {
  const mdIndex = buildMatchdayIndex(model);
  const out: CompetitionResults[] = [];

  // group stage: one block per matchday, newest matchday first
  const groupMatches = revealed.filter((m) => m.stage === "group");
  const byMatchday = new Map<number, MatchResult[]>();
  for (const m of groupMatches) {
    const md = mdIndex.get(pairKey(m.home, m.away)) ?? 1;
    const arr = byMatchday.get(md) ?? [];
    arr.push(m);
    byMatchday.set(md, arr);
  }
  for (const md of [3, 2, 1]) {
    const matches = byMatchday.get(md);
    if (matches && matches.length) out.push({ stage: "group", label: `Group stage · Matchday ${md}`, matches });
  }

  // knockout rounds: one block each, newest first
  const koStages = STAGE_ORDER.filter((s) => s !== "group").reverse();
  for (const s of koStages) {
    const matches = revealed.filter((m) => m.stage === s);
    if (matches.length) out.unshift({ stage: s, label: STAGE_LABEL[s], matches });
  }
  // knockouts should sit above the group stage (newest first overall)
  return out.sort((a, b) => {
    const sa = STAGE_ORDER.indexOf(a.stage);
    const sb = STAGE_ORDER.indexOf(b.stage);
    if (sa !== sb) return sb - sa;
    // same stage (group): higher matchday first, read from the label
    const ma = Number(a.label.match(/Matchday (\d)/)?.[1] ?? 0);
    const mb = Number(b.label.match(/Matchday (\d)/)?.[1] ?? 0);
    return mb - ma;
  });
}

/** How far the tournament has progressed, from the manager's own run: the furthest
 * stage they have a completed result in, and how many group games they have played. */
function progress(played: PlayedMatch[]): { furthest: number; groupGames: number } {
  let furthest = 0;
  let groupGames = 0;
  for (const p of played) {
    const idx = STAGE_ORDER.indexOf(p.info.stage);
    if (idx > furthest) furthest = idx;
    if (p.info.stage === "group") groupGames += 1;
  }
  return { furthest, groupGames };
}

/**
 * The whole tournament as it stands right now: every completed match (the manager's
 * real results plus the simulated rest, revealed up to the point the run has
 * reached) and the live award races. Group games reveal matchday by matchday;
 * knockout rounds reveal once the manager reaches that round.
 */
export function competitionState(
  model: Model,
  seed: number,
  result: TournamentResult,
  played: PlayedMatch[],
): CompetitionState {
  const managerTeam = managerTeamOf(played);
  const matches = reconcileResults(result.matches, played, managerTeam);
  const { furthest, groupGames } = progress(played);

  // decide which matches count as "played" so far
  const done = matches.filter((m) => {
    const idx = STAGE_ORDER.indexOf(m.stage);
    if (idx > furthest) return false;
    return true;
  });
  // during the group stage, only reveal other groups up to the same matchday the
  // manager is on, so results appear round by round rather than all at once
  const revealed =
    furthest === 0
      ? capGroupMatchday(model, done, groupGames)
      : done;

  const all = accumulate(model, seed, revealed);
  const photoOf = (team: string, name: string) => model.squads[team]?.players.find((p) => p.name === name)?.photo ?? null;
  const ageOf = (team: string, name: string) => model.squads[team]?.players.find((p) => p.name === name)?.age;

  const entry = (a: Acc, value: number, detail: string): RaceEntry => ({
    player: a.player,
    team: a.team,
    photo: photoOf(a.team, a.player),
    value,
    detail,
  });

  const goldenBoot = all
    .filter((a) => a.goals > 0)
    .sort((x, y) => y.goals - x.goals || y.assists - x.assists)
    .slice(0, 12)
    .map((a) => entry(a, a.goals, `${a.goals} goal${a.goals === 1 ? "" : "s"}, ${a.assists} assist${a.assists === 1 ? "" : "s"}`));

  const goldenBall = all
    .filter((a) => a.pos !== "GK")
    .sort((x, y) => ballScoreOf(y) - ballScoreOf(x))
    .slice(0, 12)
    .map((a) => entry(a, avgOf(a), `${avgOf(a).toFixed(2)} avg rating, ${a.goals}g ${a.assists}a`));

  const goldenGlove = all
    .filter((a) => a.pos === "GK")
    .sort((x, y) => y.cleanSheets - x.cleanSheets || avgOf(y) - avgOf(x))
    .slice(0, 12)
    .map((a) => entry(a, a.cleanSheets, `${a.cleanSheets} clean sheet${a.cleanSheets === 1 ? "" : "s"}`));

  const youngPlayer = all
    .filter((a) => {
      const age = ageOf(a.team, a.player);
      return age !== undefined && age <= YOUNG_PLAYER_MAX_AGE;
    })
    .sort((x, y) => ballScoreOf(y) - ballScoreOf(x))
    .slice(0, 12)
    .map((a) => entry(a, avgOf(a), `Age ${ageOf(a.team, a.player)}, ${avgOf(a).toFixed(2)} avg`));

  const results = groupResultsByRound(model, revealed);

  return { goldenBoot, goldenBall, goldenGlove, youngPlayer, results, matchesPlayed: revealed.length };
}

// --- read-only knockout bracket from the actual results -----------------------

export interface BracketSlot {
  match: number;
  home?: string;
  away?: string;
  homeGoals?: number;
  awayGoals?: number;
  winner?: string;
  pens?: [number, number];
  played: boolean;
}

export interface BracketState {
  slots: Record<number, BracketSlot>;
  champion?: string;
  runnerUp?: string;
  third?: string;
  fourth?: string;
}

const KO_STAGE_OF: Record<number, Stage> = (() => {
  const m: Record<number, Stage> = {};
  for (const s of R32) m[s.match] = "R32";
  for (const r of R16) m[r.match] = "R16";
  for (const r of QF) m[r.match] = "QF";
  for (const r of SF) m[r.match] = "SF";
  m[FINAL.match] = "final";
  return m;
})();

/** Read the winner of a played knockout tie (shootout winner if it went to pens). */
function resultWinner(m: MatchResult): string {
  if (m.winner) return m.winner;
  return m.homeGoals >= m.awayGoals ? m.home : m.away;
}

/**
 * Rebuild the knockout bracket as a read-only board from the tournament's group
 * standings and the actual knockout results. We seed the Round of 32 the official
 * way, then fill each tie's participants and score by matching the real result
 * between the two teams the bracket puts together.
 */
export function competitionBracket(result: TournamentResult, played: PlayedMatch[]): BracketState {
  const playedByKey = new Map<string, MatchResult>();
  for (const p of played) {
    if (p.info.stage !== "group") playedByKey.set(`${p.info.stage}|${pairKey(p.result.home, p.result.away)}`, p.result);
  }

  // index every knockout tie by stage + team pair. The simulation is the base (so
  // the bracket is always complete, even in the half the manager never reached), and
  // the manager's real results overwrite the exact ties they actually played.
  const koByKey = new Map<string, MatchResult>();
  for (const m of result.matches) {
    if (m.stage !== "group") koByKey.set(`${m.stage}|${pairKey(m.home, m.away)}`, m);
  }
  for (const [k, r] of playedByKey) koByKey.set(k, r);

  // group orders for the R32 seeding, taken from the tournament's standings
  const order: Record<string, string[]> = {};
  const groupOfTeam = new Map<string, string>();
  for (const [g, rows] of Object.entries(result.groupStandings)) {
    order[g] = [...rows].sort((a, b) => a.rank - b.rank).map((r) => r.team);
    for (const r of rows) groupOfTeam.set(r.team, g);
  }
  // the eight qualifying thirds, as the group letters seedR32 expects
  const qualifiedGroups = result.bestThirds.map((team) => groupOfTeam.get(team) ?? "").filter(Boolean);
  // seedR32's model argument is only read when the thirds list is absent; we always
  // pass an explicit eight, so a lightweight stub is safe here
  const seed = seedR32({ teams: [] } as unknown as Model, order, qualifiedGroups);

  const picks: Record<number, string> = {};
  const slots: Record<number, BracketSlot> = {};
  const SLOT_ORDER = [
    ...R32.map((s) => s.match),
    ...R16.map((r) => r.match),
    ...QF.map((r) => r.match),
    ...SF.map((r) => r.match),
    FINAL.match,
  ];
  for (const match of SLOT_ORDER) {
    const { part } = resolveBracket(seed, picks);
    const side: Side = part[match] ?? {};
    const slot: BracketSlot = { match, home: side.home, away: side.away, played: false };
    if (side.home && side.away) {
      const stage = KO_STAGE_OF[match];
      const res = koByKey.get(`${stage}|${pairKey(side.home, side.away)}`);
      if (res) {
        const homeIsHome = res.home === side.home;
        slot.homeGoals = homeIsHome ? res.homeGoals : res.awayGoals;
        slot.awayGoals = homeIsHome ? res.awayGoals : res.homeGoals;
        slot.winner = resultWinner(res);
        slot.played = true;
        if (res.shootout) {
          slot.pens = homeIsHome ? [res.shootout.home, res.shootout.away] : [res.shootout.away, res.shootout.home];
        }
        picks[match] = slot.winner;
      }
    }
    slots[match] = slot;
  }

  // podium: prefer the walked final (which carries the manager's real result if they
  // reached it), and fall back to the simulation's own champion when it does not.
  const finalSlot = slots[FINAL.match];
  const champion = finalSlot?.winner ?? result.champion;
  const runnerUp = finalSlot?.winner
    ? finalSlot.home === finalSlot.winner
      ? finalSlot.away
      : finalSlot.home
    : result.runnerUp;
  const tp = [...koByKey.values()].find((m) => m.stage === "third_place") ?? result.matches.find((m) => m.stage === "third_place");
  const third = tp ? resultWinner(tp) : result.third;
  const fourth = tp ? (third === tp.home ? tp.away : tp.home) : undefined;

  return { slots, champion, runnerUp, third, fourth };
}

/** The context a newspaper needs to report on the wider tournament: the other
 * results at the manager's current stage, the current top scorer, and the attack
 * ratings so an upset can be judged. Cheap enough to compute after each match. */
export function newsContext(
  model: Model,
  result: TournamentResult,
  played: PlayedMatch[],
  stage: Stage,
): { otherResults: MatchResult[]; topScorer?: { player: string; team: string; goals: number }; ratingOf: Map<string, number> } {
  const managerTeam = managerTeamOf(played);
  const matches = reconcileResults(result.matches, played, managerTeam);
  // only real other-team games at this stage, never the manager's own team
  const otherResults = matches.filter((m) => m.stage === stage && m.home !== managerTeam && m.away !== managerTeam);
  // top scorer so far, across every revealed match up to the current stage
  const furthest = STAGE_ORDER.indexOf(stage);
  const done = matches.filter((m) => STAGE_ORDER.indexOf(m.stage) <= furthest);
  const goals = new Map<string, { team: string; goals: number }>();
  for (const m of done) {
    for (const g of m.scorers) {
      if (g.kind === "own" || g.player === "Unattributed") continue;
      const cur = goals.get(g.player) ?? { team: g.team, goals: 0 };
      cur.goals += 1;
      goals.set(g.player, cur);
    }
  }
  let topScorer: { player: string; team: string; goals: number } | undefined;
  for (const [player, v] of goals) {
    if (!topScorer || v.goals > topScorer.goals) topScorer = { player, team: v.team, goals: v.goals };
  }
  const ratingOf = new Map(model.teams.map((t) => [t.name, t.atk]));
  return { otherResults, topScorer, ratingOf };
}

/** Keep only group matches up to the manager's current matchday, so other groups
 * reveal in step with the user rather than all at once. Each group plays 6 games
 * across 3 matchdays; we approximate the matchday from the manager's group games. */
function capGroupMatchday(model: Model, matches: MatchResult[], groupGames: number): MatchResult[] {
  const matchday = Math.min(3, groupGames); // 0..3 group games played
  if (matchday >= 3) return matches;
  const perGroup = new Map<string, number>();
  const groupOfTeam = new Map<string, string>();
  for (const t of model.teams) groupOfTeam.set(t.name, t.group);
  const out: MatchResult[] = [];
  for (const m of matches) {
    if (m.stage !== "group") {
      out.push(m);
      continue;
    }
    const g = groupOfTeam.get(m.home) ?? "?";
    const n = perGroup.get(g) ?? 0;
    if (n < matchday * 2) {
      out.push(m);
      perGroup.set(g, n + 1);
    }
  }
  return out;
}
