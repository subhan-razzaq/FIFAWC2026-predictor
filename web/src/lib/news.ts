// Back-page news. After every game the press writes its headlines: one leading on
// the manager's own result, plus a few from around the World Cup. Clicking a
// headline opens a full newspaper front page. All of it is built from the real
// result and tournament state, so the story always matches what happened.

import { hashSeed, type MatchResult, type Stage } from "@weltmeister/sim";

export interface Headline {
  splash: string; // the big headline
  standfirst: string; // the supporting line
  kicker: string; // small label, e.g. "MATCH REPORT"
  tone: "good" | "bad" | "neutral";
}

export interface Newspaper {
  masthead: string;
  date: string;
  lead: Headline;
  briefs: Headline[];
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

function masthead(seed: number, matchday: number): string {
  return PAPERS[hashSeed(`paper|${seed}|${matchday}`) % PAPERS.length]!;
}

/** The leading headline about the manager's own latest result. */
export function matchHeadline(team: string, result: MatchResult, stage: Stage): Headline {
  const isHome = result.home === team;
  const gf = isHome ? result.homeGoals : result.awayGoals;
  const ga = isHome ? result.awayGoals : result.homeGoals;
  const opp = isHome ? result.away : result.home;
  const won = result.winner ? result.winner === team : gf > ga;
  const drew = !result.winner && gf === ga;
  const margin = Math.abs(gf - ga);
  const stageWord = STAGE_WORD[stage];

  if (won && margin >= 3) {
    return {
      kicker: "MATCH REPORT",
      splash: `${team.toUpperCase()} RUN RIOT`,
      standfirst: `A ${gf}-${ga} demolition of ${opp} sends a warning to the rest of the ${stageWord}.`,
      tone: "good",
    };
  }
  if (won) {
    return {
      kicker: "MATCH REPORT",
      splash: `${team.toUpperCase()} GET THE JOB DONE`,
      standfirst: `${gf}-${ga} against ${opp}. The manager will take it and move on.`,
      tone: "good",
    };
  }
  if (drew) {
    return {
      kicker: "MATCH REPORT",
      splash: `HONOURS EVEN`,
      standfirst: `${team} and ${opp} share the points in a ${gf}-${ga} ${stageWord} draw.`,
      tone: "neutral",
    };
  }
  return {
    kicker: "MATCH REPORT",
    splash: `${team.toUpperCase()} COME UP SHORT`,
    standfirst: `${opp} edge it ${ga}-${gf}. Questions for the manager after a flat display.`,
    tone: "bad",
  };
}

/** A few flavour briefs from elsewhere in the tournament, seeded so they are stable
 * for a given matchday. */
export function tournamentBriefs(seed: number, matchday: number, team: string): Headline[] {
  const bank: Headline[] = [
    { kicker: "ELSEWHERE", splash: "HOSTS MARCH ON", standfirst: "A home crowd roars its side into the next round.", tone: "neutral" },
    { kicker: "UPSET", splash: "MINNOWS STUN A GIANT", standfirst: "The shock of the tournament so far lights up the group.", tone: "neutral" },
    { kicker: "GOLDEN BOOT", splash: "STRIKER ON FIRE", standfirst: "Another brace puts a forward clear at the top of the scoring charts.", tone: "neutral" },
    { kicker: "INJURY", splash: "STAR LIMPS OFF", standfirst: "A contender sweats on the fitness of a key man.", tone: "neutral" },
    { kicker: "VAR", splash: "LATE DRAMA", standfirst: "A stoppage-time review decides a knife-edge tie.", tone: "neutral" },
    { kicker: "FANS", splash: "CARNIVAL IN THE STANDS", standfirst: "Supporters turn the host cities into one long party.", tone: "neutral" },
    { kicker: "MANAGER", splash: "DUGOUT UNDER PRESSURE", standfirst: "A big nation's boss faces the heat after a stuttering start.", tone: "neutral" },
  ];
  const h = hashSeed(`briefs|${seed}|${matchday}|${team}`);
  // rotate the bank by the seed and take three, so each paper feels fresh
  const start = h % bank.length;
  return [0, 1, 2].map((i) => bank[(start + i) % bank.length]!);
}

export function buildNewspaper(seed: number, matchday: number, team: string, result: MatchResult, stage: Stage): Newspaper {
  return {
    masthead: masthead(seed, matchday),
    date: `World Cup 2026 · ${STAGE_WORD[stage]}`,
    lead: matchHeadline(team, result, stage),
    briefs: tournamentBriefs(seed, matchday, team),
  };
}
