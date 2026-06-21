// Poisson scoreline sampling with the Dixon-Coles low-score correction.
//
// A match scoreline is drawn from the full Dixon-Coles distribution rather than
// two independent Poissons, so the 0-0, 1-0, 0-1, and 1-1 cells carry the fitted
// dependence. We build the normalized scoreline CDF once per distinct
// (lambda_home, lambda_away) pair and cache it, since across thousands of runs the
// same fixtures recur with identical expected goals. That keeps 50k tournaments
// fast without giving up exactness.

import type { Rng } from "./rng";

const MAX_GOALS = 10;
const W = MAX_GOALS + 1;

const FACT: number[] = (() => {
  const f = [1];
  for (let i = 1; i <= MAX_GOALS; i++) f[i] = f[i - 1]! * i;
  return f;
})();

export function poissonPmf(lambda: number): Float64Array {
  const out = new Float64Array(W);
  const e = Math.exp(-lambda);
  let lp = 1;
  for (let k = 0; k <= MAX_GOALS; k++) {
    out[k] = (e * lp) / FACT[k]!;
    lp *= lambda;
  }
  return out;
}

/** Dixon-Coles dependence factor for the four corrected low-score cells. */
export function dcTau(x: number, y: number, lamH: number, lamA: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lamH * lamA * rho;
  if (x === 0 && y === 1) return 1 + lamH * rho;
  if (x === 1 && y === 0) return 1 + lamA * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

const cdfCache = new Map<number, Float64Array>();

function cacheKey(lamH: number, lamA: number, rho: number): number {
  // quantize so near-identical lambdas share a cached CDF
  const kh = Math.round(lamH * 40);
  const ka = Math.round(lamA * 40);
  const kr = Math.round((rho + 1) * 200);
  return (kh * 4096 + ka) * 1024 + kr;
}

/** Build (and cache) the flattened, normalized Dixon-Coles scoreline CDF. */
export function scorelineCdf(lamH: number, lamA: number, rho: number): Float64Array {
  const key = cacheKey(lamH, lamA, rho);
  const hit = cdfCache.get(key);
  if (hit) return hit;

  const ph = poissonPmf(lamH);
  const pa = poissonPmf(lamA);
  const cells = new Float64Array(W * W);
  let total = 0;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < W; y++) {
      let p = ph[x]! * pa[y]!;
      if (x <= 1 && y <= 1) p *= dcTau(x, y, lamH, lamA, rho);
      cells[x * W + y] = p;
      total += p;
    }
  }
  // normalize into a CDF in place
  let acc = 0;
  const inv = 1 / total;
  for (let i = 0; i < cells.length; i++) {
    acc += cells[i]! * inv;
    cells[i] = acc;
  }
  cells[cells.length - 1] = 1; // guard against rounding
  cdfCache.set(key, cells);
  return cells;
}

/** Sample a scoreline [homeGoals, awayGoals] from the Dixon-Coles distribution. */
export function sampleScore(rng: Rng, lamH: number, lamA: number, rho: number): [number, number] {
  const cdf = scorelineCdf(lamH, lamA, rho);
  const u = rng.next();
  // linear scan is fine for 121 cells and is branch-predictable
  let i = 0;
  while (i < cdf.length - 1 && cdf[i]! < u) i++;
  return [Math.floor(i / W), i % W];
}

/** Normalized Dixon-Coles joint scoreline probabilities P[x][y] (not cumulative). */
export function scorelineGrid(lamH: number, lamA: number, rho: number, maxGoals = 6): number[][] {
  const ph = poissonPmf(lamH);
  const pa = poissonPmf(lamA);
  const grid: number[][] = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x++) {
    const row: number[] = [];
    for (let y = 0; y <= maxGoals; y++) {
      let p = ph[x]! * pa[y]!;
      if (x <= 1 && y <= 1) p *= dcTau(x, y, lamH, lamA, rho);
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  for (const row of grid) for (let y = 0; y < row.length; y++) row[y]! /= total;
  return grid;
}

/** Win / draw / loss probabilities from the Dixon-Coles scoreline grid. */
export function outcomeProbs(lamH: number, lamA: number, rho: number): [number, number, number] {
  const ph = poissonPmf(lamH);
  const pa = poissonPmf(lamA);
  let home = 0;
  let draw = 0;
  let away = 0;
  let total = 0;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < W; y++) {
      let p = ph[x]! * pa[y]!;
      if (x <= 1 && y <= 1) p *= dcTau(x, y, lamH, lamA, rho);
      total += p;
      if (x > y) home += p;
      else if (x === y) draw += p;
      else away += p;
    }
  }
  return [home / total, draw / total, away / total];
}

/** Sample a single Poisson count (Knuth), used for extra-time goals. */
export function samplePoisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

/** Clear the scoreline cache (call after ratings change, e.g. in manage mode). */
export function clearScorelineCache(): void {
  cdfCache.clear();
}
