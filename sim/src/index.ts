// WELTMEISTER runtime simulation engine.
// Pure TypeScript, deterministic seeded PRNG, no dependencies in the hot loop.

export const ENGINE_VERSION = "1.0.0";

export * from "./types";
export * from "./rng";
export * from "./poisson";
export * from "./context";
export * from "./match";
export * from "./enrich";
export * from "./group";
export * from "./thirds";
export * from "./bracket";
export * from "./tournament";
export * from "./montecarlo";
export { runSingle, handleRequest } from "./worker";
export type { WorkerRequest, WorkerResponse } from "./worker";
