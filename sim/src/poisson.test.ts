import { describe, expect, it } from "vitest";
import { outcomeProbs, samplePoisson, sampleScore } from "./poisson";
import { Rng, deriveSeed } from "./rng";

describe("rng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("derives well-separated streams", () => {
    const s0 = deriveSeed(42, 0);
    const s1 = deriveSeed(42, 1);
    expect(s0).not.toEqual(s1);
  });
});

describe("poisson and dixon-coles", () => {
  it("outcome probabilities sum to 1", () => {
    const [h, d, a] = outcomeProbs(1.6, 1.1, -0.06);
    expect(h + d + a).toBeCloseTo(1, 10);
    expect(h).toBeGreaterThan(a); // more expected goals at home
  });

  it("equal lambdas give symmetric win probabilities", () => {
    const [h, , a] = outcomeProbs(1.3, 1.3, -0.05);
    expect(h).toBeCloseTo(a, 10);
  });

  it("sampleScore is reproducible and non-negative", () => {
    const r1 = new Rng(99);
    const r2 = new Rng(99);
    for (let i = 0; i < 100; i++) {
      const a = sampleScore(r1, 1.5, 1.2, -0.06);
      const b = sampleScore(r2, 1.5, 1.2, -0.06);
      expect(a).toEqual(b);
      expect(a[0]).toBeGreaterThanOrEqual(0);
      expect(a[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it("sampled Poisson mean approximates lambda", () => {
    const r = new Rng(3);
    const lambda = 1.4;
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += samplePoisson(r, lambda);
    expect(sum / n).toBeCloseTo(lambda, 1);
  });

  it("sampled scoreline mean approximates lambda", () => {
    const r = new Rng(5);
    let sh = 0;
    let sa = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const [x, y] = sampleScore(r, 1.7, 1.0, -0.06);
      sh += x;
      sa += y;
    }
    expect(sh / n).toBeCloseTo(1.7, 1);
    expect(sa / n).toBeCloseTo(1.0, 1);
  });
});
