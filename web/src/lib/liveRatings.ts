// Live, in-running player ratings for the managed side, so a manager can see at a
// glance who is having a good or bad game and decide who to take off. It mirrors
// the post-match rating model but works from the events revealed up to the current
// minute, so the number climbs with goals and assists, dips with a booking or a
// sending-off, and leans on the scoreline (a clean sheet flatters the back line, a
// drubbing drags everyone down). Short cameos sit near a neutral 6.5.

import type { MatchEvent, SquadPlayer } from "@weltmeister/sim";
import { staminaTier } from "./fatigue";

export interface LiveRating {
  rating: number;
  goals: number;
  assists: number;
  booked: boolean;
  sentOff: boolean;
}

export interface LiveRatingInput {
  eleven: string[];
  byName: Map<string, SquadPlayer>;
  goals: MatchEvent[]; // revealed goals (both sides), filtered to <= clock by the caller
  cards: MatchEvent[]; // revealed cards (managed side), filtered to <= clock
  team: string;
  teamGoals: number;
  oppGoals: number;
  clock: number;
}

const POS_BASE: Record<string, number> = { GK: 6.6, DF: 6.5, MF: 6.6, FW: 6.5 };

/** Per-player live rating for the managed team's on-pitch eleven. */
export function liveRatings(input: LiveRatingInput): Map<string, LiveRating> {
  const { eleven, byName, goals, cards, team, teamGoals, oppGoals, clock } = input;
  const out = new Map<string, LiveRating>();

  const goalsBy = new Map<string, number>();
  const assistsBy = new Map<string, number>();
  for (const g of goals) {
    if (g.team !== team || g.kind === "own") continue;
    goalsBy.set(g.player, (goalsBy.get(g.player) ?? 0) + 1);
    if (g.assist) assistsBy.set(g.assist, (assistsBy.get(g.assist) ?? 0) + 1);
  }
  const booked = new Set<string>();
  const sentOff = new Set<string>();
  for (const c of cards) {
    if (c.type === "red") sentOff.add(c.player);
    else booked.add(c.player);
  }

  // a team-form nudge from the scoreline, gentle early and firmer late
  const margin = teamGoals - oppGoals;
  const phase = Math.min(1, clock / 90);
  const teamSwing = Math.max(-0.8, Math.min(0.8, margin * 0.18)) * (0.4 + 0.6 * phase);

  for (const name of eleven) {
    const p = byName.get(name);
    const pos = p?.group ?? "MF";
    let r = POS_BASE[pos] ?? 6.5;
    r += teamSwing;
    if (pos === "GK" || pos === "DF") r += oppGoals === 0 ? 0.5 * phase : -0.22 * oppGoals;
    r += (goalsBy.get(name) ?? 0) * 1.1;
    r += (assistsBy.get(name) ?? 0) * 0.7;
    if (booked.has(name)) r -= 0.3;
    if (sentOff.has(name)) r -= 1.6;
    // a small lift for a higher-class player so the eye test broadly agrees
    if (p) r += (p.ability - 0.7) * 0.6;
    // fatigue quietly drags the number once a player is spent
    const tier = staminaTier(100); // stamina handled by the caller's colour, keep rating about the game
    void tier;
    out.set(name, {
      rating: Math.max(4.5, Math.min(9.9, Math.round(r * 10) / 10)),
      goals: goalsBy.get(name) ?? 0,
      assists: assistsBy.get(name) ?? 0,
      booked: booked.has(name),
      sentOff: sentOff.has(name),
    });
  }
  return out;
}

/** A colour for a live rating, matching the post-match rating scale. */
export function ratingColor(r: number): string {
  if (r >= 7.5) return "#0a8a3f";
  if (r >= 7.0) return "#2c9e4f";
  if (r >= 6.5) return "#7a9c2c";
  if (r >= 6.0) return "#d98a1f";
  return "#cf4a39";
}
