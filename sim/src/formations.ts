// Formations and position-aware lineup arrangement.
//
// Two display-layer jobs that keep the broadcast lineups believable. First, each
// team uses the formations it actually plays in real life, weighted, and the
// shape varies from game to game. Second, the eleven is arranged into the chosen
// shape by role, so a striker stands centrally and full-backs stand wide, rather
// than being dropped into slots by raw rating.
//
// This is purely cosmetic. The validated goals model never sees a formation.

import { Rng, hashSeed } from "./rng";
import type { Squad } from "./types";

export type Role = "GK" | "CB" | "FB" | "DM" | "CM" | "AM" | "W" | "ST";

const LINE: Record<Role, "GK" | "DF" | "MF" | "FW"> = {
  GK: "GK",
  CB: "DF",
  FB: "DF",
  DM: "MF",
  CM: "MF",
  AM: "MF",
  W: "FW",
  ST: "FW",
};

// The target role of each slot, in the exact order of the pitch slots in
// FORMATIONS (web/src/lib/manage.ts). Index i here lines up with slot i there.
// Each role's line matches the coarse position of the matching pitch slot, so a
// forward slot wants a forward and a midfield slot wants a midfielder.
export const FORMATION_ROLES: Record<string, Role[]> = {
  "4-3-3": ["GK", "FB", "CB", "CB", "FB", "CM", "DM", "CM", "W", "ST", "W"],
  "4-4-2": ["GK", "FB", "CB", "CB", "FB", "CM", "CM", "CM", "CM", "ST", "ST"],
  "4-2-3-1": ["GK", "FB", "CB", "CB", "FB", "DM", "DM", "AM", "AM", "AM", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "CM", "CM", "DM", "CM", "CM", "ST", "ST"],
  "3-4-3": ["GK", "CB", "CB", "CB", "CM", "CM", "CM", "CM", "W", "ST", "W"],
  "5-3-2": ["GK", "FB", "CB", "CB", "CB", "FB", "CM", "DM", "CM", "ST", "ST"],
};

// Real-life formation usage per team, as weighted options. The first is the
// primary shape, the rest are realistic alternates the manager rotates into.
const DEFAULT_FORMATIONS: [string, number][] = [
  ["4-3-3", 0.5],
  ["4-2-3-1", 0.35],
  ["4-4-2", 0.15],
];

export const TEAM_FORMATIONS: Record<string, [string, number][]> = {
  Argentina: [["4-3-3", 0.55], ["4-4-2", 0.3], ["3-5-2", 0.15]],
  France: [["4-2-3-1", 0.5], ["4-3-3", 0.4], ["4-4-2", 0.1]],
  England: [["4-2-3-1", 0.45], ["4-3-3", 0.35], ["3-4-3", 0.2]],
  Spain: [["4-3-3", 0.7], ["4-2-3-1", 0.3]],
  Brazil: [["4-3-3", 0.45], ["4-2-3-1", 0.4], ["4-4-2", 0.15]],
  Portugal: [["4-3-3", 0.55], ["4-2-3-1", 0.35], ["4-4-2", 0.1]],
  Netherlands: [["4-3-3", 0.45], ["3-4-3", 0.35], ["4-2-3-1", 0.2]],
  Germany: [["4-2-3-1", 0.45], ["4-3-3", 0.4], ["4-4-2", 0.15]],
  Belgium: [["4-3-3", 0.45], ["3-4-3", 0.35], ["4-2-3-1", 0.2]],
  Croatia: [["4-3-3", 0.55], ["4-2-3-1", 0.3], ["4-4-2", 0.15]],
  Uruguay: [["4-3-3", 0.45], ["4-4-2", 0.35], ["3-5-2", 0.2]],
  Colombia: [["4-2-3-1", 0.5], ["4-3-3", 0.4], ["4-4-2", 0.1]],
  Morocco: [["4-3-3", 0.55], ["4-2-3-1", 0.3], ["4-4-2", 0.15]],
  Japan: [["4-2-3-1", 0.4], ["3-4-3", 0.35], ["4-3-3", 0.25]],
  "South Korea": [["4-4-2", 0.4], ["4-2-3-1", 0.35], ["4-3-3", 0.25]],
  "United States": [["4-3-3", 0.55], ["4-2-3-1", 0.3], ["3-4-3", 0.15]],
  Mexico: [["4-3-3", 0.5], ["4-2-3-1", 0.35], ["4-4-2", 0.15]],
  Canada: [["4-3-3", 0.45], ["3-4-3", 0.3], ["4-4-2", 0.25]],
  Senegal: [["4-3-3", 0.6], ["4-2-3-1", 0.4]],
  Switzerland: [["4-2-3-1", 0.5], ["4-3-3", 0.3], ["3-4-3", 0.2]],
  Norway: [["4-3-3", 0.5], ["4-4-2", 0.3], ["4-2-3-1", 0.2]],
  Egypt: [["4-2-3-1", 0.55], ["4-3-3", 0.3], ["4-4-2", 0.15]],
  Austria: [["4-3-3", 0.45], ["4-2-3-1", 0.35], ["4-4-2", 0.2]],
  Ecuador: [["4-3-3", 0.5], ["4-4-2", 0.3], ["4-2-3-1", 0.2]],
  Australia: [["4-2-3-1", 0.4], ["4-4-2", 0.35], ["4-3-3", 0.25]],
  Turkey: [["4-2-3-1", 0.5], ["4-3-3", 0.3], ["3-4-3", 0.2]],
  "Ivory Coast": [["4-3-3", 0.55], ["4-2-3-1", 0.3], ["4-4-2", 0.15]],
  Algeria: [["4-3-3", 0.5], ["4-2-3-1", 0.35], ["3-4-3", 0.15]],
  Scotland: [["3-5-2", 0.5], ["3-4-3", 0.3], ["4-2-3-1", 0.2]],
  Paraguay: [["4-4-2", 0.45], ["4-3-3", 0.3], ["3-5-2", 0.25]],
  Iran: [["4-3-3", 0.45], ["4-2-3-1", 0.35], ["5-3-2", 0.2]],
  Qatar: [["3-5-2", 0.45], ["4-2-3-1", 0.3], ["4-3-3", 0.25]],
  "Saudi Arabia": [["4-2-3-1", 0.5], ["4-3-3", 0.3], ["4-4-2", 0.2]],
  Uzbekistan: [["4-3-3", 0.45], ["4-2-3-1", 0.35], ["4-4-2", 0.2]],
  Iraq: [["4-2-3-1", 0.45], ["4-3-3", 0.3], ["4-4-2", 0.25]],
  Jordan: [["3-4-3", 0.4], ["4-2-3-1", 0.35], ["4-3-3", 0.25]],
  Tunisia: [["4-3-3", 0.45], ["4-2-3-1", 0.35], ["3-4-3", 0.2]],
  "Cape Verde": [["4-3-3", 0.5], ["4-4-2", 0.3], ["4-2-3-1", 0.2]],
  Ghana: [["4-3-3", 0.45], ["4-2-3-1", 0.35], ["3-4-3", 0.2]],
  "DR Congo": [["4-3-3", 0.45], ["4-2-3-1", 0.35], ["4-4-2", 0.2]],
  "South Africa": [["4-3-3", 0.5], ["4-2-3-1", 0.3], ["4-4-2", 0.2]],
  "New Zealand": [["4-2-3-1", 0.4], ["5-3-2", 0.35], ["4-4-2", 0.25]],
  Panama: [["4-4-2", 0.4], ["4-3-3", 0.35], ["5-3-2", 0.25]],
  Haiti: [["4-3-3", 0.45], ["4-4-2", 0.35], ["4-2-3-1", 0.2]],
  Curacao: [["4-3-3", 0.45], ["4-4-2", 0.35], ["4-2-3-1", 0.2]],
  "Czech Republic": [["4-2-3-1", 0.5], ["4-3-3", 0.3], ["4-4-2", 0.2]],
  "Bosnia and Herzegovina": [["4-2-3-1", 0.45], ["4-3-3", 0.35], ["3-4-3", 0.2]],
  Sweden: [["4-4-2", 0.45], ["4-3-3", 0.3], ["4-2-3-1", 0.25]],
};

/** Weighted, deterministic formation pick for a team in a single match. */
export function chooseFormation(team: string, key: string): string {
  const opts = (TEAM_FORMATIONS[team] ?? DEFAULT_FORMATIONS).filter(([f, w]) => w > 0 && FORMATION_ROLES[f]);
  if (opts.length === 0) return "4-3-3";
  const total = opts.reduce((s, [, w]) => s + w, 0);
  let r = new Rng(hashSeed(key)).next() * total;
  for (const [f, w] of opts) {
    r -= w;
    if (r <= 0) return f;
  }
  return opts[0]![0];
}

function fitness(playerRole: Role, slotRole: Role): number {
  if (playerRole === slotRole) return 5;
  const pl = LINE[playerRole];
  const sl = LINE[slotRole];
  if (pl === sl) return 2.5;
  const adjacent =
    (pl === "DF" && sl === "MF") ||
    (pl === "MF" && sl === "DF") ||
    (pl === "MF" && sl === "FW") ||
    (pl === "FW" && sl === "MF");
  return adjacent ? 0.3 : -4;
}

/** Classify each player of the eleven into a fine role, relative to their line. */
function classify(squad: Squad, eleven: string[]): Map<string, Role> {
  const byName = new Map(squad.players.map((p) => [p.name, p]));
  const players = eleven.map((n) => byName.get(n)).filter((p): p is NonNullable<typeof p> => !!p);
  const roleOf = new Map<string, Role>();

  const inLine = (g: string) => players.filter((p) => p.group === g);

  for (const p of inLine("GK")) roleOf.set(p.name, "GK");

  // defenders: the most creative two become full-backs, the rest centre-backs
  const df = [...inLine("DF")].sort((a, b) => b.xa90 - a.xa90);
  df.forEach((p, i) => roleOf.set(p.name, i < 2 ? "FB" : "CB"));

  // midfielders: most attacking is the playmaker, most defensive is the holder
  const mf = [...inLine("MF")].sort((a, b) => b.npxg90 + b.xa90 - (a.npxg90 + a.xa90));
  mf.forEach((p, i) => roleOf.set(p.name, i === 0 ? "AM" : i === mf.length - 1 && mf.length > 1 ? "DM" : "CM"));

  // forwards: the sharpest finisher is the central striker, the rest play wide
  const fw = [...inLine("FW")].sort((a, b) => b.npxg90 - a.npxg90);
  fw.forEach((p, i) => roleOf.set(p.name, i === 0 ? "ST" : "W"));

  return roleOf;
}

/**
 * Reorder an eleven so that `result[i]` is the player who should fill slot `i` of
 * the formation, by role fitness. Greedy slot-by-slot assignment, good enough to
 * keep strikers central and full-backs wide while always placing all eleven.
 */
export function arrangeEleven(squad: Squad, eleven: string[], formation: string): string[] {
  const slots = FORMATION_ROLES[formation] ?? FORMATION_ROLES["4-3-3"]!;
  const roleOf = classify(squad, eleven);
  const byName = new Map(squad.players.map((p) => [p.name, p]));
  const pool = eleven
    .filter((n) => byName.has(n))
    .map((n) => ({ name: n, role: roleOf.get(n) ?? "CM", ability: byName.get(n)!.ability }));

  // Global best-fit assignment: rank every (player, slot) pair and assign the
  // strongest fit first. Role fitness dominates and ability only breaks ties, so
  // the best forward keeps the striker slot rather than being pulled into an
  // overflow midfield spot by a left-to-right pass.
  const pairs: { name: string; slot: number; score: number }[] = [];
  pool.forEach((c) => {
    slots.forEach((slotRole, slot) => {
      pairs.push({ name: c.name, slot, score: fitness(c.role, slotRole) * 100 + c.ability });
    });
  });
  pairs.sort((a, b) => b.score - a.score);

  const assigned: (string | null)[] = slots.map(() => null);
  const usedNames = new Set<string>();
  for (const pr of pairs) {
    if (usedNames.has(pr.name) || assigned[pr.slot] !== null) continue;
    assigned[pr.slot] = pr.name;
    usedNames.add(pr.name);
  }
  // fill any gaps (defensive) with leftover players in order
  const leftovers = pool.map((c) => c.name).filter((n) => !usedNames.has(n));
  return assigned.map((n) => n ?? leftovers.shift() ?? "");
}
