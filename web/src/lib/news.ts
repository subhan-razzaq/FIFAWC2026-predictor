// Back-page news. After every game the press writes its front pages off the actual
// result: the match report, the named scorers, the player of the match and the
// standings picture. The reader can cycle through several full pages, each grounded
// in what really happened, so a headline never says "someone scored" when the paper
// knows exactly who did.

import { hashSeed, type GoalEvent, type MatchResult, type Stage } from "@weltmeister/sim";

export interface Headline {
  splash: string;
  standfirst: string;
  kicker: string;
  tone: "good" | "bad" | "neutral";
}

export interface NewsPage extends Headline {
  body: string[]; // a few paragraphs of the story
}

export interface Newspaper {
  masthead: string;
  date: string;
  pages: NewsPage[];
}

const PAPERS = ["The Global Post", "World Sport Daily", "The Touchline", "Frontpage FC", "The Terrace"];

const STAGE_WORD: Record<Stage, string> = {
  group: "group stage",
  R32: "round of 32",
  R16: "round of 16",
  QF: "quarter-final",
  SF: "semi-final",
  third_place: "third-place play-off",
  final: "final",
};

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

/** Group goals by scorer for one team, ignoring own goals, so we can write "X with
 * a brace" from the real scorer list. */
function scorerTally(scorers: GoalEvent[], team: string): { player: string; goals: number }[] {
  const tally = new Map<string, number>();
  for (const g of scorers) {
    if (g.team !== team || g.kind === "own" || g.player === "Unattributed") continue;
    tally.set(g.player, (tally.get(g.player) ?? 0) + 1);
  }
  return [...tally.entries()].map(([player, goals]) => ({ player, goals })).sort((a, b) => b.goals - a.goals);
}

function scorerPhrase(list: { player: string; goals: number }[]): string {
  if (list.length === 0) return "";
  const part = (s: { player: string; goals: number }) =>
    s.goals >= 3 ? `${lastName(s.player)} (hat-trick)` : s.goals === 2 ? `${lastName(s.player)} (brace)` : lastName(s.player);
  const names = list.map(part);
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function masthead(seed: number, matchday: number): string {
  return PAPERS[hashSeed(`paper|${seed}|${matchday}`) % PAPERS.length]!;
}

/** The leading match-report page, with the real scoreline and named scorers. */
function reportPage(team: string, result: MatchResult, stage: Stage): NewsPage {
  const isHome = result.home === team;
  const gf = isHome ? result.homeGoals : result.awayGoals;
  const ga = isHome ? result.awayGoals : result.homeGoals;
  const opp = isHome ? result.away : result.home;
  const won = result.winner ? result.winner === team : gf > ga;
  const drew = !result.winner && gf === ga;
  const margin = Math.abs(gf - ga);
  const stageWord = STAGE_WORD[stage];
  const ours = scorerPhrase(scorerTally(result.scorers, team));
  const theirs = scorerPhrase(scorerTally(result.scorers, opp));
  const pens = result.shootout ? ` (${result.shootout.home}-${result.shootout.away} on penalties)` : result.afterExtraTime ? " after extra time" : "";

  const ourLine = ours ? `${ours} found the net for ${team}.` : `${team} could not find a way through.`;
  const theirLine = theirs ? `${opp} replied through ${theirs}.` : `${opp} were kept off the scoresheet.`;

  if (won && margin >= 3) {
    return {
      kicker: "MATCH REPORT",
      splash: `${team.toUpperCase()} RUN RIOT`,
      standfirst: `A ${gf}-${ga} demolition of ${opp} in the ${stageWord}${pens}.`,
      tone: "good",
      body: [`${team} were irresistible, putting ${gf} past ${opp}.`, ourLine, theirLine],
    };
  }
  if (won) {
    return {
      kicker: "MATCH REPORT",
      splash: `${team.toUpperCase()} GET THE JOB DONE`,
      standfirst: `${gf}-${ga} against ${opp} in the ${stageWord}${pens}.`,
      tone: "good",
      body: [`A professional night's work for ${team}.`, ourLine, theirLine],
    };
  }
  if (drew) {
    return {
      kicker: "MATCH REPORT",
      splash: "HONOURS EVEN",
      standfirst: `${team} and ${opp} share a ${gf}-${ga} draw in the ${stageWord}${pens}.`,
      tone: "neutral",
      body: [`Nothing to separate them in the end.`, ourLine, theirLine],
    };
  }
  return {
    kicker: "MATCH REPORT",
    splash: `${team.toUpperCase()} COME UP SHORT`,
    standfirst: `${opp} edge it ${ga}-${gf} in the ${stageWord}${pens}.`,
    tone: "bad",
    body: [`A frustrating night for ${team}.`, theirLine, ourLine],
  };
}

/** A page that singles out the night's star, taken from the real scorer list. */
function starPage(team: string, result: MatchResult): NewsPage | null {
  const ours = scorerTally(result.scorers, team);
  if (ours.length === 0) return null;
  const top = ours[0]!;
  const name = lastName(top.player);
  if (top.goals >= 3) {
    return { kicker: "THE STAR", splash: `${name.toUpperCase()} HAT-TRICK HERO`, standfirst: `Three goals and the match ball for ${name}.`, tone: "good", body: [`${name} produced a performance to remember, helping themselves to a hat-trick.`, "The forward is the talk of the tournament after a ruthless display."] };
  }
  if (top.goals === 2) {
    return { kicker: "THE STAR", splash: `${name.toUpperCase()} ON THE DOUBLE`, standfirst: `A brace from ${name} settles it for ${team}.`, tone: "good", body: [`${name} was at the heart of everything good, taking both chances with the minimum of fuss.`] };
  }
  return { kicker: "THE STAR", splash: `${name.toUpperCase()} ON TARGET`, standfirst: `${name} with the decisive contribution for ${team}.`, tone: "neutral", body: [`${name} popped up with a goal that could prove important come the end of the tournament.`] };
}

/** One tournament-wide brief, still grounded so it never reads as a vague rumour. */
function aroundPage(seed: number, matchday: number, team: string, stage: Stage): NewsPage {
  const bank: NewsPage[] = [
    { kicker: "ELSEWHERE", splash: "HOSTS MARCH ON", standfirst: "A home crowd roars its side through the round.", tone: "neutral", body: ["The three host nations continue to draw vast, noisy crowds across the continent."] },
    { kicker: "THE RACE", splash: "GOLDEN BOOT HEATS UP", standfirst: "The scoring charts tighten at the top.", tone: "neutral", body: ["With goals flying in across the groups, the race for the Golden Boot is wide open."] },
    { kicker: "FANS", splash: "CARNIVAL IN THE STANDS", standfirst: "Supporters turn the host cities into one long party.", tone: "neutral", body: ["From coast to coast, the World Cup has taken over."] },
    { kicker: "TACTICS", splash: "PRESSING GAME RULES", standfirst: "The sides who press highest are setting the pace.", tone: "neutral", body: ["Analysts note that the most aggressive teams are reaping the rewards in the final third."] },
    { kicker: "DRAMA", splash: "LATE GOALS DECIDE IT", standfirst: "Stoppage time is providing the headlines.", tone: "neutral", body: ["More than one tie has swung in the dying minutes during this ", "round."] },
  ];
  const h = hashSeed(`around|${seed}|${matchday}|${team}|${stage}`);
  return bank[h % bank.length]!;
}

export function buildNewspaper(seed: number, matchday: number, team: string, result: MatchResult, stage: Stage): Newspaper {
  const pages: NewsPage[] = [reportPage(team, result, stage)];
  const star = starPage(team, result);
  if (star) pages.push(star);
  pages.push(aroundPage(seed, matchday, team, stage));
  return {
    masthead: masthead(seed, matchday),
    date: `World Cup 2026 · ${STAGE_WORD[stage]}`,
    pages,
  };
}
