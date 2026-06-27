// Encode a whole-bracket prediction into a short, shareable token and back.
//
// A prediction is twelve group orders plus a set of knockout winners. We pack it
// into 44 bytes - one version byte, one byte per group (each finishing slot is a
// 2-bit index into that group's alphabetical roster), then one byte per knockout
// tie (0 unpicked, 1 home, 2 away) walked in the engine's fixed match order. The
// bytes go out as URL-safe base64, so a complete bracket rides in ~60 characters
// of a `?b=` query. Decoding is defensive: any malformed token returns null and
// the UI simply falls back to a fresh bracket.

import { FINAL, QF, R16, R32, SF, type Model } from "@weltmeister/sim";
import { resolveBracket, seedR32 } from "./predictBracket";

const VERSION = 1;
const N_GROUPS = 12;
const MATCH_ORDER: number[] = [
  ...R32.map((s) => s.match),
  ...R16.map((r) => r.match),
  ...QF.map((r) => r.match),
  ...SF.map((r) => r.match),
  FINAL.match,
];
const TOKEN_BYTES = 1 + N_GROUPS + MATCH_ORDER.length;

export interface SharedPrediction {
  order: Record<string, string[]>;
  picks: Record<number, string>;
}

function sortedGroups(model: Model): string[] {
  return [...new Set(model.teams.map((t) => t.group))].sort();
}

/** A group's roster in a fixed, model-derived order, so both ends agree. */
function canonicalRoster(model: Model, group: string): string[] {
  return model.teams
    .filter((t) => t.group === group)
    .map((t) => t.name)
    .sort();
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): Uint8Array | null {
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((token.length + 3) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function encodePrediction(model: Model, order: Record<string, string[]>, picks: Record<number, string>): string {
  const groups = sortedGroups(model);
  const bytes = new Uint8Array(TOKEN_BYTES);
  bytes[0] = VERSION;

  groups.forEach((g, i) => {
    const roster = canonicalRoster(model, g);
    const ord = order[g] ?? roster;
    let byte = 0;
    for (let p = 0; p < 4; p++) {
      const idx = roster.indexOf(ord[p] ?? roster[p]!);
      byte |= (Math.max(0, idx) & 3) << (p * 2);
    }
    bytes[1 + i] = byte;
  });

  const seed = seedR32(model, order);
  const { part } = resolveBracket(seed, picks);
  MATCH_ORDER.forEach((m, k) => {
    const w = picks[m];
    const pt = part[m];
    bytes[1 + N_GROUPS + k] = w === undefined ? 0 : w === pt?.home ? 1 : w === pt?.away ? 2 : 0;
  });

  return toBase64Url(bytes);
}

export function decodePrediction(model: Model, token: string): SharedPrediction | null {
  const bytes = fromBase64Url(token);
  if (!bytes || bytes.length < TOKEN_BYTES || bytes[0] !== VERSION) return null;

  const groups = sortedGroups(model);
  const order: Record<string, string[]> = {};
  for (let i = 0; i < N_GROUPS; i++) {
    const g = groups[i];
    if (!g) return null;
    const roster = canonicalRoster(model, g);
    if (roster.length !== 4) return null;
    const byte = bytes[1 + i]!;
    const idxs = [byte & 3, (byte >> 2) & 3, (byte >> 4) & 3, (byte >> 6) & 3];
    if (new Set(idxs).size !== 4) return null; // must be a permutation of 0..3
    order[g] = idxs.map((ix) => roster[ix]!);
  }

  const seed = seedR32(model, order);
  let picks: Record<number, string> = {};
  for (let k = 0; k < MATCH_ORDER.length; k++) {
    const m = MATCH_ORDER[k]!;
    const code = bytes[1 + N_GROUPS + k]!;
    const { part } = resolveBracket(seed, picks);
    const pt = part[m];
    if (code === 1 && pt?.home) picks = { ...picks, [m]: pt.home };
    else if (code === 2 && pt?.away) picks = { ...picks, [m]: pt.away };
  }

  return { order, picks };
}

/** A full share URL for the current prediction, pointing back at this page. */
export function predictionShareUrl(model: Model, order: Record<string, string[]>, picks: Record<number, string>): string {
  const token = encodePrediction(model, order, picks);
  const url = new URL(window.location.href);
  url.searchParams.set("b", token);
  return url.toString();
}
