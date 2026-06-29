// Encode a whole-bracket prediction into a short, shareable token and back.
//
// A prediction is twelve group orders, the choice of which eight third-placed
// teams advance, and a set of knockout winners. We pack it into a version byte,
// one byte per group (each finishing slot is a 2-bit index into that group's
// alphabetical roster), a two-byte mask of the qualifying-third groups, then one
// byte per knockout tie (0 unpicked, 1 home, 2 away) walked in the engine's fixed
// match order. The bytes go out as URL-safe base64, so a complete bracket rides in
// ~60 characters of a `?b=` query. Decoding is defensive: a malformed token
// returns null and the UI falls back to a fresh bracket. Older version-1 tokens
// (no thirds mask) still decode, defaulting the thirds to the strongest by rating.

import { FINAL, QF, R16, R32, SF, type Model } from "@weltmeister/sim";
import { defaultQualifiedThirds, resolveBracket, seedR32 } from "./predictBracket";

const VERSION = 2;
const N_GROUPS = 12;
const MATCH_ORDER: number[] = [
  ...R32.map((s) => s.match),
  ...R16.map((r) => r.match),
  ...QF.map((r) => r.match),
  ...SF.map((r) => r.match),
  FINAL.match,
];
const THIRDS_BYTES = 2; // a 12-bit mask, one bit per group
const TOKEN_BYTES_V1 = 1 + N_GROUPS + MATCH_ORDER.length;
const TOKEN_BYTES = 1 + N_GROUPS + THIRDS_BYTES + MATCH_ORDER.length;

export interface SharedPrediction {
  order: Record<string, string[]>;
  picks: Record<number, string>;
  thirds: string[];
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

export function encodePrediction(
  model: Model,
  order: Record<string, string[]>,
  picks: Record<number, string>,
  thirds: string[],
): string {
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

  // 12-bit mask of which groups' thirds advance, big bit first
  const chosen = new Set(thirds);
  let mask = 0;
  groups.forEach((g, i) => {
    if (chosen.has(g)) mask |= 1 << i;
  });
  bytes[1 + N_GROUPS] = (mask >> 8) & 0xff;
  bytes[1 + N_GROUPS + 1] = mask & 0xff;

  const seed = seedR32(model, order, thirds);
  const { part } = resolveBracket(seed, picks);
  MATCH_ORDER.forEach((m, k) => {
    const w = picks[m];
    const pt = part[m];
    bytes[1 + N_GROUPS + THIRDS_BYTES + k] = w === undefined ? 0 : w === pt?.home ? 1 : w === pt?.away ? 2 : 0;
  });

  return toBase64Url(bytes);
}

export function decodePrediction(model: Model, token: string): SharedPrediction | null {
  const bytes = fromBase64Url(token);
  if (!bytes) return null;
  const version = bytes[0];
  const hasThirds = version === VERSION;
  // accept the current format, or the older v1 token that carried no thirds mask
  if (hasThirds) {
    if (bytes.length < TOKEN_BYTES) return null;
  } else if (version === 1) {
    if (bytes.length < TOKEN_BYTES_V1) return null;
  } else {
    return null;
  }

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

  let thirds = defaultQualifiedThirds(model, order);
  let matchOffset = 1 + N_GROUPS;
  if (hasThirds) {
    const mask = (bytes[1 + N_GROUPS]! << 8) | bytes[1 + N_GROUPS + 1]!;
    const picked = groups.filter((_, i) => (mask & (1 << i)) !== 0);
    if (picked.length === 8) thirds = picked; // otherwise keep the rating default
    matchOffset = 1 + N_GROUPS + THIRDS_BYTES;
  }

  const seed = seedR32(model, order, thirds);
  let picks: Record<number, string> = {};
  for (let k = 0; k < MATCH_ORDER.length; k++) {
    const m = MATCH_ORDER[k]!;
    const code = bytes[matchOffset + k]!;
    const { part } = resolveBracket(seed, picks);
    const pt = part[m];
    if (code === 1 && pt?.home) picks = { ...picks, [m]: pt.home };
    else if (code === 2 && pt?.away) picks = { ...picks, [m]: pt.away };
  }

  return { order, picks, thirds };
}

/** A full share URL for the current prediction, pointing back at this page. */
export function predictionShareUrl(
  model: Model,
  order: Record<string, string[]>,
  picks: Record<number, string>,
  thirds: string[],
): string {
  const token = encodePrediction(model, order, picks, thirds);
  const url = new URL(window.location.href);
  url.searchParams.set("b", token);
  return url.toString();
}
