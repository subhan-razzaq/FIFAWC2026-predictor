// Competition-wide awards, computed across the WHOLE tournament rather than just
// the managed team. We take a full single simulation of the tournament on the run's
// seed, splice in the manager's actual results for the games they played, then enrich
// every match to get real scorers and per-player ratings. From that we hand out the
// tournament's Golden Boot, Golden Ball, Golden Glove, Best Young Player (aged 21 or
// under) and a Team of the Tournament, each from any nation, not only the user's.

import { enrichMatch, type MatchResult, type Model, type TournamentResult } from "@weltmeister/sim";
import type { PlayedMatch } from "../store/store";
import { YOUNG_PLAYER_MAX_AGE, type Awards, type AwardWinner, type TotwSlot } from "./awards";

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

/** Replace the simulated version of each match the manager actually played with the
 * real result, matched on the two teams and the stage. */
function spliceManagerResults(matches: MatchResult[], played: PlayedMatch[]): MatchResult[] {
  const byKey = new Map<string, MatchResult>();
  for (const p of played) {
    const a = [p.result.home, p.result.away].sort().join("|");
    byKey.set(`${p.result.stage}|${a}`, p.result);
  }
  return matches.map((m) => {
    const a = [m.home, m.away].sort().join("|");
    const real = byKey.get(`${m.stage}|${a}`);
    return real ?? m;
  });
}

/** Build the competition-wide awards from a full tournament and the manager's run. */
export function competitionAwards(
  model: Model,
  seed: number,
  result: TournamentResult,
  played: PlayedMatch[],
): Awards {
  const matches = spliceManagerResults(result.matches, played);
  const acc = new Map<string, Acc>();
  const photoOf = (team: string, name: string) => model.squads[team]?.players.find((p) => p.name === name)?.photo ?? null;
  const ageOf = (team: string, name: string) => model.squads[team]?.players.find((p) => p.name === name)?.age;
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

  const all = [...acc.values()].filter((a) => a.apps > 0);
  const avg = (a: Acc) => a.ratingSum / Math.max(1, a.apps);
  const ballScore = (a: Acc) => avg(a) + a.goals * 0.25 + a.assists * 0.15;

  const winner = (a: Acc | undefined, detail: string, value: number): AwardWinner | undefined =>
    a ? { player: a.player, photo: photoOf(a.team, a.player), team: a.team, detail, value } : undefined;

  const scorers = all.filter((a) => a.goals > 0).sort((x, y) => y.goals - x.goals || y.assists - x.assists);
  const goldenBoot = scorers[0] ? winner(scorers[0], `${scorers[0].goals} goals · ${scorers[0].team}`, scorers[0].goals) : undefined;

  const outfield = all.filter((a) => a.pos !== "GK").sort((x, y) => ballScore(y) - ballScore(x));
  const goldenBall = outfield[0] ? winner(outfield[0], `${avg(outfield[0]).toFixed(2)} avg · ${outfield[0].team}`, avg(outfield[0])) : undefined;

  const keepers = all.filter((a) => a.pos === "GK").sort((x, y) => y.cleanSheets - x.cleanSheets || avg(y) - avg(x));
  const goldenGlove = keepers[0] ? winner(keepers[0], `${keepers[0].cleanSheets} clean sheets · ${keepers[0].team}`, keepers[0].cleanSheets) : undefined;

  const young = all
    .filter((a) => {
      const age = ageOf(a.team, a.player);
      return age !== undefined && age <= YOUNG_PLAYER_MAX_AGE;
    })
    .sort((x, y) => ballScore(y) - ballScore(x));
  const youngPlayer = young[0] ? winner(young[0], `Age ${ageOf(young[0].team, young[0].player)} · ${young[0].team}`, avg(young[0])) : undefined;

  const slot = (pos: Acc["pos"], n: number): TotwSlot[] =>
    all
      .filter((a) => a.pos === pos)
      .sort((x, y) => ballScore(y) - ballScore(x))
      .slice(0, n)
      .map((a) => ({ player: a.player, photo: photoOf(a.team, a.player), pos, rating: avg(a) }));
  const teamOfTournament = [...slot("GK", 1), ...slot("DF", 4), ...slot("MF", 3), ...slot("FW", 3)];

  return { goldenBoot, goldenBall, goldenGlove, youngPlayer, teamOfTournament };
}
