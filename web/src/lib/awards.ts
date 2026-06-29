// End-of-tournament awards, computed from the manager's run. Because only the
// managed team's matches are played out in full, the awards are drawn from that
// side's tournament: its Golden Boot leader, its standout outfield player (Golden
// Ball), its keeper (Golden Glove), its best player aged 21 or under, and a team of
// the tournament from the players who featured. Every winner is a real player with a
// real number behind the award.

import type { EnrichedMatch, Model, SquadPlayer } from "@weltmeister/sim";
import type { PlayedMatch } from "../store/store";

export const YOUNG_PLAYER_MAX_AGE = 21;

export interface AwardWinner {
  player: string;
  photo: string | null;
  team: string;
  detail: string;
  value: number;
}

export interface TotwSlot {
  player: string;
  photo: string | null;
  pos: "GK" | "DF" | "MF" | "FW";
  rating: number;
}

export interface Awards {
  goldenBoot?: AwardWinner;
  goldenBall?: AwardWinner;
  goldenGlove?: AwardWinner;
  youngPlayer?: AwardWinner;
  teamOfTournament: TotwSlot[];
}

interface Acc {
  player: string;
  goals: number;
  assists: number;
  ratingSum: number;
  apps: number;
  cleanSheetMins: number;
  pos: "GK" | "DF" | "MF" | "FW";
}

function ratingFor(enriched: EnrichedMatch, team: string): Map<string, { rating: number; pos: "GK" | "DF" | "MF" | "FW" }> {
  const out = new Map<string, { rating: number; pos: "GK" | "DF" | "MF" | "FW" }>();
  const side = enriched.home.team === team ? enriched.home : enriched.away;
  for (const s of side.starters) out.set(s.name, { rating: s.rating, pos: s.pos });
  return out;
}

/** Build the five awards from the managed team's played matches. */
export function computeAwards(model: Model, team: string, played: PlayedMatch[]): Awards {
  const squad = model.squads[team];
  const byName = new Map<string, SquadPlayer>((squad?.players ?? []).map((p) => [p.name, p]));
  const acc = new Map<string, Acc>();
  const photoOf = (name: string) => byName.get(name)?.photo ?? null;

  const ensure = (name: string, pos: "GK" | "DF" | "MF" | "FW"): Acc => {
    let a = acc.get(name);
    if (!a) {
      a = { player: name, goals: 0, assists: 0, ratingSum: 0, apps: 0, cleanSheetMins: 0, pos };
      acc.set(name, a);
    }
    return a;
  };

  for (const m of played) {
    const ratings = ratingFor(m.enriched, team);
    const ga = m.result.home === team ? m.result.awayGoals : m.result.homeGoals;
    for (const [name, r] of ratings) {
      const a = ensure(name, r.pos);
      a.ratingSum += r.rating;
      a.apps += 1;
      if (ga === 0) a.cleanSheetMins += 1;
    }
    for (const ev of m.enriched.events) {
      if (ev.team !== team) continue;
      if (ev.type === "goal" && ev.kind !== "own") {
        ensure(ev.player, byName.get(ev.player)?.group as Acc["pos"] | undefined ?? "FW").goals += 1;
        if (ev.assist) ensure(ev.assist, byName.get(ev.assist)?.group as Acc["pos"] | undefined ?? "MF").assists += 1;
      }
    }
  }

  const all = [...acc.values()].filter((a) => a.apps > 0);
  const avg = (a: Acc) => a.ratingSum / Math.max(1, a.apps);

  // Golden Boot: most goals, assists break ties
  const scorers = all.filter((a) => a.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  const goldenBoot = scorers[0]
    ? { player: scorers[0].player, photo: photoOf(scorers[0].player), team, detail: `${scorers[0].goals} goals`, value: scorers[0].goals }
    : undefined;

  // Golden Ball: best outfield player by a goal-weighted average rating
  const ballScore = (a: Acc) => avg(a) + a.goals * 0.25 + a.assists * 0.15;
  const outfield = all.filter((a) => a.pos !== "GK").sort((x, y) => ballScore(y) - ballScore(x));
  const goldenBall = outfield[0]
    ? { player: outfield[0].player, photo: photoOf(outfield[0].player), team, detail: `${avg(outfield[0]).toFixed(2)} avg rating`, value: avg(outfield[0]) }
    : undefined;

  // Golden Glove: keeper with the most clean sheets, rating breaks ties
  const keepers = all.filter((a) => a.pos === "GK").sort((x, y) => y.cleanSheetMins - x.cleanSheetMins || avg(y) - avg(x));
  const goldenGlove = keepers[0]
    ? { player: keepers[0].player, photo: photoOf(keepers[0].player), team, detail: `${keepers[0].cleanSheetMins} clean sheets`, value: keepers[0].cleanSheetMins }
    : undefined;

  // Best Young Player: best ball-score among players aged 21 or under
  const young = outfield
    .concat(all.filter((a) => a.pos === "GK"))
    .filter((a) => {
      const age = byName.get(a.player)?.age;
      return age !== undefined && age <= YOUNG_PLAYER_MAX_AGE;
    })
    .sort((x, y) => ballScore(y) - ballScore(x));
  const youngPlayer = young[0]
    ? { player: young[0].player, photo: photoOf(young[0].player), team, detail: `Age ${byName.get(young[0].player)?.age}`, value: avg(young[0]) }
    : undefined;

  // Team of the tournament: a 4-3-3 of the best-rated players who featured
  const slot = (pos: Acc["pos"], n: number): TotwSlot[] =>
    all
      .filter((a) => a.pos === pos)
      .sort((x, y) => ballScore(y) - ballScore(x))
      .slice(0, n)
      .map((a) => ({ player: a.player, photo: photoOf(a.player), pos, rating: avg(a) }));
  const teamOfTournament = [...slot("GK", 1), ...slot("DF", 4), ...slot("MF", 3), ...slot("FW", 3)];

  return { goldenBoot, goldenBall, goldenGlove, youngPlayer, teamOfTournament };
}
