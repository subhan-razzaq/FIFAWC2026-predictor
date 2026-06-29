// The man in the other dugout. Each nation carries its REAL 2026 World Cup head
// coach and a short read on their actual style, so when you face a side you size up
// the genuine manager. The one-to-five-star rating is derived from the team's fitted
// strength, so a stronger nation reads as a stronger bench.

import { type Model } from "@weltmeister/sim";

export interface OpponentManager {
  name: string;
  stars: number; // 1..5, half-steps allowed (e.g. 3.5)
  nous: string; // a short read on their real coaching style
}

// Real national-team head coaches for the 2026 cycle, with a line on how they set
// their teams up. Keyed by the model's team names.
const MANAGERS: Record<string, { name: string; style: string }> = {
  Algeria: { name: "Vladimir Petkovic", style: "Pragmatic and organised, a back line that holds its shape." },
  Argentina: { name: "Lionel Scaloni", style: "World champions, flexible shapes and ruthless transitions." },
  Australia: { name: "Tony Popovic", style: "Disciplined and hard-running, makes the most of every set piece." },
  Austria: { name: "Ralf Rangnick", style: "Relentless gegenpressing, wins the ball high and goes again." },
  Belgium: { name: "Rudi Garcia", style: "Possession-minded, trusts a golden generation to create." },
  "Bosnia and Herzegovina": { name: "Sergej Barbarez", style: "Front-foot and aggressive, leans on his attackers." },
  Brazil: { name: "Carlo Ancelotti", style: "Calm man-management, lets elite talent express itself." },
  Canada: { name: "Jesse Marsch", style: "High-energy pressing, vertical and direct, fearless." },
  "Cape Verde": { name: "Pedro Leitao Brito", style: "Compact and spirited, dangerous on the counter." },
  Colombia: { name: "Nestor Lorenzo", style: "Balanced and confident, builds through a creative midfield." },
  Croatia: { name: "Zlatko Dalic", style: "Midfield control, patient and tournament-savvy." },
  Curacao: { name: "Dick Advocaat", style: "Vastly experienced, sets a stubborn, compact block." },
  "Czech Republic": { name: "Ivan Hasek", style: "Industrious and direct, strong from wide areas." },
  "DR Congo": { name: "Sebastien Desabre", style: "Energetic and well-drilled, quick into attack." },
  Ecuador: { name: "Sebastian Beccacece", style: "Intense pressing, young legs and high tempo." },
  Egypt: { name: "Hossam Hassan", style: "Passionate and direct, built around his talisman up top." },
  England: { name: "Thomas Tuchel", style: "Tactically meticulous, controls games and tightens the screw." },
  France: { name: "Didier Deschamps", style: "Pragmatic winner, solid block and lethal on the break." },
  Germany: { name: "Julian Nagelsmann", style: "Bold and detailed, positional play with aggressive pressing." },
  Ghana: { name: "Otto Addo", style: "Quick and direct, gets his pacy forwards running." },
  Haiti: { name: "Sebastien Migne", style: "Organised underdog, defends deep and breaks fast." },
  Iran: { name: "Amir Ghalenoei", style: "Defensively solid and physical, hard to break down." },
  Iraq: { name: "Graham Arnold", style: "Well-organised and resilient, drilled to frustrate." },
  "Ivory Coast": { name: "Emerse Fae", style: "Front-foot and brave, attacks with width and pace." },
  Japan: { name: "Hajime Moriyasu", style: "Slick, technical possession with quick combinations." },
  Jordan: { name: "Jamal Sellami", style: "Compact and disciplined, dangerous from set plays." },
  Mexico: { name: "Javier Aguirre", style: "Streetwise and pragmatic, tight at the back." },
  Morocco: { name: "Walid Regragui", style: "Solid block and rapid transitions, semi-final pedigree." },
  Netherlands: { name: "Ronald Koeman", style: "Possession through a back three, controlled build-up." },
  "New Zealand": { name: "Darren Bazeley", style: "Physical and direct, dangerous in the air." },
  Norway: { name: "Stale Solbakken", style: "Direct and vertical, feeds a world-class spearhead." },
  Panama: { name: "Thomas Christiansen", style: "Compact and well-organised, counters with intent." },
  Paraguay: { name: "Gustavo Alfaro", style: "Defensively rugged, disciplined and streetwise." },
  Portugal: { name: "Roberto Martinez", style: "Attack-minded possession, packs the side with flair." },
  Qatar: { name: "Julen Lopetegui", style: "Patient build-up and positional play, technically drilled." },
  "Saudi Arabia": { name: "Herve Renard", style: "High-energy and motivational, presses and plays direct." },
  Scotland: { name: "Steve Clarke", style: "Resolute and organised, a back three and set-piece threat." },
  Senegal: { name: "Pape Thiaw", style: "Powerful and direct, athletic across the pitch." },
  "South Africa": { name: "Hugo Broos", style: "Pragmatic and experienced, fields a youthful, fearless side." },
  "South Korea": { name: "Hong Myung-bo", style: "High tempo and hard-working, presses with energy." },
  Spain: { name: "Luis de la Fuente", style: "Dominant possession and high press, fluid and youthful." },
  Sweden: { name: "Jon Dahl Tomasson", style: "Front-foot and aggressive, gets his forwards firing." },
  Switzerland: { name: "Murat Yakin", style: "Flexible and solid, comfortable in tournament football." },
  Tunisia: { name: "Sami Trabelsi", style: "Organised and combative, defends in numbers." },
  Turkey: { name: "Vincenzo Montella", style: "Technical and progressive, trusts a gifted young core." },
  "United States": { name: "Mauricio Pochettino", style: "High press and intensity, aggressive front-foot football." },
  Uruguay: { name: "Marcelo Bielsa", style: "Frantic man-to-man pressing, all-action and vertical." },
  Uzbekistan: { name: "Timur Kapadze", style: "Disciplined and organised, compact and patient." },
};

function ratingToStars(rating: number, allRatings: number[]): number {
  const sorted = [...allRatings].sort((a, b) => a - b);
  const rank = sorted.filter((r) => r <= rating).length / sorted.length; // 0..1 percentile
  const stars = 1 + rank * 4; // 1..5
  return Math.round(stars * 2) / 2; // nearest half star
}

export function opponentManager(model: Model, team: string): OpponentManager {
  const t = model.teams.find((x) => x.name === team);
  const entry = MANAGERS[team];
  const all = model.teams.map((x) => x.rating);
  const stars = t ? ratingToStars(t.rating, all) : 3;
  return {
    name: entry?.name ?? "Head Coach",
    stars,
    nous: entry?.style ?? "Sets his side up to compete.",
  };
}
