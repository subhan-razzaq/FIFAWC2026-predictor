// Pre-match scouting report on the AI opponent.
//
// Built only from data the model actually carries, the opponent's fitted
// attack/defence ratings and their projected XI's real per-90 numbers, so every
// claim is honest. Player roles are coarse (GK/DF/MF/FW), so we do NOT invent
// "they attack down the left"; instead we surface the genuine danger man by share
// of attacking output, how the side is balanced, and a counter-tactic the user
// can act on with the sliders.

import type { Model } from "@weltmeister/sim";

export interface ScoutReport {
  team: string;
  headline: string;
  attack: number; // fitted atk rating
  defence: number; // fitted def rating
  fifaRank: number;
  threat: "elite" | "strong" | "dangerous" | "modest";
  solidity: "watertight" | "solid" | "leaky" | "porous";
  dangerMan?: { name: string; npxg90: number; share: number };
  creator?: { name: string; xa90: number };
  keeper?: { name: string; ability: number };
  setPiece?: string;
  bullets: string[];
  counter: string;
}

export function scoutTeam(model: Model, opponent: string): ScoutReport {
  const t = model.teams.find((x) => x.name === opponent)!;
  const squad = model.squads[opponent];
  const xi = new Set(squad?.projected_eleven ?? []);
  const starters = (squad?.players ?? []).filter((p) => xi.has(p.name));

  // danger man: largest share of the XI's attacking output (npxG/90)
  const totalNpxg = starters.reduce((s, p) => s + p.npxg90, 0) || 1;
  const topScorer = [...starters].sort((a, b) => b.npxg90 - a.npxg90)[0];
  const topCreator = [...starters].sort((a, b) => b.xa90 - a.xa90)[0];
  const gk = [...starters].filter((p) => p.group === "GK").sort((a, b) => b.ability - a.ability)[0];

  const threat = t.atk >= 1.35 ? "elite" : t.atk >= 1.1 ? "strong" : t.atk >= 0.9 ? "dangerous" : "modest";
  // a higher def rating means fewer goals conceded
  const solidity = t.def >= 1.25 ? "watertight" : t.def >= 1.0 ? "solid" : t.def >= 0.8 ? "leaky" : "porous";

  const bullets: string[] = [];
  if (topScorer && topScorer.npxg90 > 0) {
    const share = topScorer.npxg90 / totalNpxg;
    bullets.push(
      `${topScorer.name} carries ${(share * 100).toFixed(0)}% of their attacking threat (${topScorer.npxg90.toFixed(2)} npxG/90).`,
    );
  }
  if (topCreator && topCreator.xa90 >= 0.2 && topCreator.name !== topScorer?.name) {
    bullets.push(`${topCreator.name} is the chief creator (${topCreator.xa90.toFixed(2)} xA/90).`);
  }
  if (squad?.penalty_taker) bullets.push(`${squad.penalty_taker} takes their penalties.`);
  if (squad?.set_piece_taker && squad.set_piece_taker !== squad.penalty_taker) {
    bullets.push(`Set-piece threat from ${squad.set_piece_taker}.`);
  }
  if (gk) bullets.push(`In goal: ${gk.name} (${gk.ability >= 0.7 ? "top class" : gk.ability >= 0.5 ? "reliable" : "beatable"}).`);
  bullets.push(`FIFA rank #${t.fifa_rank}.`);

  // counter-tactic: react to whichever way the opponent leans
  let counter: string;
  if (t.atk - t.def > 0.25) {
    counter = "They overload the attack and can be got at, sit a touch deeper and hit them on the counter.";
  } else if (t.def - t.atk > 0.25) {
    counter = "Hard to break down. Be patient, keep your press high, and don't gift them a counter.";
  } else {
    counter = "Well-balanced. Win the midfield: a high press can tip a close game your way.";
  }

  const headline =
    threat === "elite"
      ? `${opponent}: serious firepower up front.`
      : solidity === "watertight"
        ? `${opponent}: tough to break down.`
        : `${opponent}: there are goals in this one.`;

  return {
    team: opponent,
    headline,
    attack: t.atk,
    defence: t.def,
    fifaRank: t.fifa_rank,
    threat,
    solidity,
    dangerMan: topScorer ? { name: topScorer.name, npxg90: topScorer.npxg90, share: topScorer.npxg90 / totalNpxg } : undefined,
    creator: topCreator && topCreator.xa90 >= 0.2 ? { name: topCreator.name, xa90: topCreator.xa90 } : undefined,
    keeper: gk ? { name: gk.name, ability: gk.ability } : undefined,
    setPiece: squad?.set_piece_taker,
    bullets,
    counter,
  };
}
