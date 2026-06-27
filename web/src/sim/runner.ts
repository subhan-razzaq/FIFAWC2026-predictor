// Promise-based wrapper around the Monte Carlo Web Worker. Routes responses by
// request id so several calls can be in flight, and forwards progress.

import type {
  BracketGrade,
  BracketPrediction,
  Model,
  MonteCarloResult,
  Overrides,
  TournamentResult,
  WorkerRequest,
  WorkerResponse,
} from "@weltmeister/sim";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  onProgress?: (done: number, total: number) => void;
};

export class SimRunner {
  private worker: Worker;
  private id = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL("./mc.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const id = msg.id ?? -1;
      const p = this.pending.get(id);
      if (!p) return;
      if (msg.type === "progress") {
        p.onProgress?.(msg.done, msg.total);
      } else if (msg.type === "result") {
        this.pending.delete(id);
        p.resolve(msg.result);
      } else if (msg.type === "single") {
        this.pending.delete(id);
        p.resolve(msg.result);
      } else if (msg.type === "grade") {
        this.pending.delete(id);
        p.resolve(msg.result);
      } else if (msg.type === "error") {
        this.pending.delete(id);
        p.reject(new Error(msg.message));
      }
    };
  }

  montecarlo(
    model: Model,
    runs: number,
    seed: number,
    overrides: Overrides | undefined,
    onProgress?: (done: number, total: number) => void,
  ): Promise<MonteCarloResult> {
    const id = ++this.id;
    const req: WorkerRequest = { type: "montecarlo", model, runs, seed, overrides, id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.worker.postMessage(req);
    });
  }

  single(model: Model, seed: number, overrides?: Overrides): Promise<TournamentResult> {
    const id = ++this.id;
    const req: WorkerRequest = { type: "single", model, seed, overrides, id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage(req);
    });
  }

  gradeBracket(
    model: Model,
    prediction: BracketPrediction,
    runs: number,
    seed: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<BracketGrade> {
    const id = ++this.id;
    const req: WorkerRequest = { type: "gradebracket", model, prediction, runs, seed, id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.worker.postMessage(req);
    });
  }
}

let singleton: SimRunner | undefined;
export function getRunner(): SimRunner {
  if (!singleton) singleton = new SimRunner();
  return singleton;
}
