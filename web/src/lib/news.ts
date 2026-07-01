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

/** Real context from the rest of the tournament, so the paper can report on other
 * games and the wider picture rather than inventing vague rumours. */
export interface NewsContext {
  /** other results at the same stage as the manager's game, with their scorers. */
  otherResults: MatchResult[];
  /** the current top scorer of the whole tournament, if there is one. */
  topScorer?: { player: string; team: string; goals: number };
  /** fitted attack ratings, to judge which results are genuine upsets. */
  ratingOf?: Map<string, number>;
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

/** The biggest result from elsewhere in the round: a thrashing or a marquee win,
 * reported with the real teams and scorers. */
function elsewherePage(myTeam: string, stage: Stage, ctx: NewsContext): NewsPage | null {
  const others = ctx.otherResults.filter((m) => m.home !== myTeam && m.away !== myTeam);
  if (others.length === 0) return null;
  // pick the match with the biggest goal margin, then most total goals
  const best = [...others].sort((a, b) => {
    const ma = Math.abs(a.homeGoals - a.awayGoals);
    const mb = Math.abs(b.homeGoals - b.awayGoals);
    return mb - ma || b.homeGoals + b.awayGoals - (a.homeGoals + a.awayGoals);
  })[0]!;
  const win = best.homeGoals >= best.awayGoals ? best.home : best.away;
  const lose = win === best.home ? best.away : best.home;
  const wg = Math.max(best.homeGoals, best.awayGoals);
  const lg = Math.min(best.homeGoals, best.awayGoals);
  const scorers = scorerPhrase(scorerTally(best.scorers, win));
  const margin = wg - lg;
  const splash = margin >= 3 ? `${win.toUpperCase()} PUT ${lose.toUpperCase()} TO THE SWORD` : `${win.toUpperCase()} SEE OFF ${lose.toUpperCase()}`;
  return {
    kicker: "ELSEWHERE",
    splash,
    standfirst: `${win} beat ${lose} ${wg}-${lg} in the ${STAGE_WORD[stage]}.`,
    tone: "neutral",
    body: [
      `The pick of the round elsewhere saw ${win} beat ${lose} ${wg}-${lg}.`,
      scorers ? `${scorers} did the damage.` : `It was a night to forget for ${lose}.`,
    ],
  };
}

/** An upset from the round, judged against the fitted attack ratings, if one exists. */
function upsetPage(myTeam: string, ctx: NewsContext): NewsPage | null {
  if (!ctx.ratingOf) return null;
  const others = ctx.otherResults.filter((m) => m.home !== myTeam && m.away !== myTeam);
  let best: { winner: string; loser: string; wg: number; lg: number; gap: number } | null = null;
  for (const m of others) {
    const decided = m.winner ?? (m.homeGoals > m.awayGoals ? m.home : m.awayGoals > m.homeGoals ? m.away : null);
    if (!decided) continue;
    const loser = decided === m.home ? m.away : m.home;
    const gap = (ctx.ratingOf.get(loser) ?? 0) - (ctx.ratingOf.get(decided) ?? 0);
    const wg = decided === m.home ? m.homeGoals : m.awayGoals;
    const lg = decided === m.home ? m.awayGoals : m.homeGoals;
    if (gap > 0 && (!best || gap > best.gap)) best = { winner: decided, loser, wg, lg, gap };
  }
  if (!best || best.gap < 0.25) return null;
  return {
    kicker: "UPSET",
    splash: `${best.winner.toUpperCase()} SHOCK ${best.loser.toUpperCase()}`,
    standfirst: `${best.winner} stun the favourites ${best.wg}-${best.lg}.`,
    tone: "neutral",
    body: [`Few saw it coming, but ${best.winner} had too much for ${best.loser} and take the headlines.`],
  };
}

/** The scoring race, named from the real top scorer of the tournament. */
function racePage(ctx: NewsContext): NewsPage | null {
  if (!ctx.topScorer || ctx.topScorer.goals < 2) return null;
  const { player, team, goals } = ctx.topScorer;
  return {
    kicker: "GOLDEN BOOT",
    splash: `${lastName(player).toUpperCase()} LEADS THE RACE`,
    standfirst: `${player} of ${team} tops the scoring charts on ${goals}.`,
    tone: "neutral",
    body: [`${player} has hit ${goals} so far and sits clear at the top of the Golden Boot race.`, "The rest of the field has some catching up to do."],
  };
}

export function buildNewspaper(seed: number, matchday: number, team: string, result: MatchResult, stage: Stage, ctx?: NewsContext): Newspaper {
  const pages: NewsPage[] = [reportPage(team, result, stage)];
  const star = starPage(team, result);
  if (star) pages.push(star);
  if (ctx) {
    const elsewhere = elsewherePage(team, stage, ctx);
    if (elsewhere) pages.push(elsewhere);
    const upset = upsetPage(team, ctx);
    if (upset) pages.push(upset);
    const race = racePage(ctx);
    if (race) pages.push(race);
  }
  // guarantee at least one wider story even with no context yet
  if (pages.length === 1) {
    pages.push({ kicker: "AROUND THE GROUNDS", splash: "THE WORLD CUP ROLLS ON", standfirst: "Drama across the host cities as the tournament builds.", tone: "neutral", body: ["From coast to coast, the World Cup has taken over."] });
  }
  return {
    masthead: masthead(seed, matchday),
    date: `World Cup 2026 · ${STAGE_WORD[stage]}`,
    pages,
  };
}
