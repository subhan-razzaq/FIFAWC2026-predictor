// Deterministic seeded pseudo-random number generator.
//
// The whole simulation is driven by a seed so a bracket is reproducible and
// shareable: the same seed and the same model always produce the same result.
// We use mulberry32, a small fast 32-bit generator, and splitmix32 to derive
// independent per-run seeds from one base seed.

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Mix a 32-bit seed so nearby base seeds give well-separated streams. */
export function splitmix32(seed: number): number {
  let z = (seed + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** Derive the seed for run `index` from a base seed. */
export function deriveSeed(base: number, index: number): number {
  return splitmix32((base ^ 0x85ebca6b) + index * 0x9e3779b9);
}

/** Hash an arbitrary string to a 32-bit seed (for human-friendly seed strings). */
export function hashSeed(input: string | number): number {
  if (typeof input === "number") return input >>> 0;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
