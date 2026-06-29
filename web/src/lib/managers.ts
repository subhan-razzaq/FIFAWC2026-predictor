// The man in the other dugout. Each nation gets a stable head coach name and a
// one-to-five-star rating derived from the team's fitted strength, so when you face
// a side you also size up their manager. Names are a curated, deterministic pool;
// nothing here pretends to be a real person's record, it is colour for the matchup.

import { hashSeed, type Model } from "@weltmeister/sim";

export interface OpponentManager {
  name: string;
  stars: number; // 1..5, half-steps allowed (e.g. 3.5)
  nous: string; // a short read on their reputation
}

// a broad, neutral pool of coach-style names; the seed picks one per nation so the
// same team always has the same manager within a run
const FIRST = [
  "Marco",
  "Diego",
  "Hugo",
  "Andre",
  "Lars",
  "Paulo",
  "Stefan",
  "Bruno",
  "Viktor",
  "Tariq",
  "Kenji",
  "Mateo",
  "Goran",
  "Ivan",
  "Felipe",
  "Oscar",
  "Niko",
  "Emre",
  "Rafael",
  "Dimitri",
];
const LAST = [
  "Moreno",
  "Vogel",
  "Castellano",
  "Petrov",
  "Larsson",
  "Hassan",
  "Tanaka",
  "Kovac",
  "Mensah",
  "Duarte",
  "Bauer",
  "Ferreira",
  "Novak",
  "Okafor",
  "Reuter",
  "Salas",
  "Demir",
  "Andersen",
  "Costa",
  "Bianchi",
];

function ratingToStars(rating: number, allRatings: number[]): number {
  const sorted = [...allRatings].sort((a, b) => a - b);
  const rank = sorted.filter((r) => r <= rating).length / sorted.length; // 0..1 percentile
  const stars = 1 + rank * 4; // 1..5
  return Math.round(stars * 2) / 2; // nearest half star
}

export function opponentManager(model: Model, team: string): OpponentManager {
  const t = model.teams.find((x) => x.name === team);
  const h = hashSeed(`manager|${team}`);
  const name = `${FIRST[h % FIRST.length]} ${LAST[Math.floor(h / 7) % LAST.length]}`;
  const all = model.teams.map((x) => x.rating);
  const stars = t ? ratingToStars(t.rating, all) : 3;
  const nous =
    stars >= 4.5
      ? "A serial winner, tactically ruthless."
      : stars >= 3.5
        ? "Well-drilled and hard to surprise."
        : stars >= 2.5
          ? "Solid, gets a tune out of his squad."
          : "Still proving himself at this level.";
  return { name, stars, nous };
}
