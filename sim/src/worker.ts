// Web Worker entry. The Monte Carlo runs off the main thread so the UI never
// blocks, streaming progress back for the count-up animations. The same module is
// safe to import in non-worker contexts (it only wires up handlers when a worker
// scope is present).

import { runMonteCarlo, type MonteCarloResult } from "./montecarlo";
import { gradeBracket, type BracketGrade, type BracketPrediction } from "./grade";
import { simulateTournament, type TournamentInput } from "./tournament";
import { SimContext, type Overrides } from "./context";
import { Rng, hashSeed } from "./rng";
import type { Model, TournamentResult } from "./types";

export type WorkerRequest =
  | { type: "montecarlo"; model: Model; runs: number; seed: number; overrides?: Overrides; id?: number }
  | { type: "single"; model: Model; seed: number; overrides?: Overrides; id?: number }
  | { type: "gradebracket"; model: Model; prediction: BracketPrediction; runs: number; seed: number; id?: number };

export type WorkerResponse =
  | { type: "progress"; done: number; total: number; id?: number }
  | { type: "result"; result: MonteCarloResult; id?: number }
  | { type: "single"; result: TournamentResult; id?: number }
  | { type: "grade"; result: BracketGrade; id?: number }
  | { type: "error"; message: string; id?: number };

/** Run one seeded tournament, for the deterministic bracket reveal. */
export function runSingle(model: Model, seed: number, overrides?: Overrides): TournamentResult {
  const ctx = new SimContext(model, overrides ?? {});
  const input: TournamentInput = {
    fixtures: model.fixtures,
    fifa: new Map(model.teams.map((t) => [t.name, t.fifa_rank])),
  };
  return simulateTournament(ctx, new Rng(seed >>> 0), input);
}

export function handleRequest(
  req: WorkerRequest,
  post: (msg: WorkerResponse) => void,
): void {
  try {
    if (req.type === "single") {
      post({ type: "single", result: runSingle(req.model, req.seed, req.overrides), id: req.id });
      return;
    }
    if (req.type === "gradebracket") {
      const result = gradeBracket(req.model, req.prediction, {
        runs: req.runs,
        seed: req.seed,
        onProgress: (done, total) => post({ type: "progress", done, total, id: req.id }),
      });
      post({ type: "grade", result, id: req.id });
      return;
    }
    const result = runMonteCarlo(req.model, {
      runs: req.runs,
      seed: req.seed,
      overrides: req.overrides,
      onProgress: (done, total) => post({ type: "progress", done, total, id: req.id }),
    });
    post({ type: "result", result, id: req.id });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err), id: req.id });
  }
}

export { hashSeed };
