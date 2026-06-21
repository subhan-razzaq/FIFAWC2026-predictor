// Global app state. Loads the committed model.json, drives the Monte Carlo
// worker, and holds the manage-mode overrides. The seed is first-class so any
// run is reproducible and shareable.

import { create } from "zustand";
import { hashSeed, type Model, type MonteCarloResult, type Overrides, type TournamentResult } from "@weltmeister/sim";
import { getRunner } from "../sim/runner";

export type Status = "boot" | "ready" | "running" | "done" | "error";

export interface ManageState {
  team: string | null;
  // current chosen eleven and formation for the managed team
  eleven: string[];
  formation: string;
  attackBias: number; // -1 defensive .. +1 attacking (the tactical slider)
}

interface StoreState {
  model: Model | null;
  status: Status;
  error: string | null;
  progress: number;

  seed: number;
  seedLabel: string;
  runs: number;

  result: MonteCarloResult | null;
  baseline: MonteCarloResult | null; // the default-squad run, for manage comparison
  single: TournamentResult | null;

  manage: ManageState;

  init: () => Promise<void>;
  setSeed: (label: string) => void;
  randomizeSeed: () => void;
  setRuns: (n: number) => void;
  runSimulation: (overrides?: Overrides) => Promise<void>;
  runReveal: (overrides?: Overrides) => Promise<void>;
}

const DEFAULT_RUNS = 20000;

export const useStore = create<StoreState>((set, get) => ({
  model: null,
  status: "boot",
  error: null,
  progress: 0,

  seed: 2026,
  seedLabel: "2026",
  runs: DEFAULT_RUNS,

  result: null,
  baseline: null,
  single: null,

  manage: { team: null, eleven: [], formation: "4-3-3", attackBias: 0 },

  init: async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/model.json`);
      if (!res.ok) throw new Error(`could not load model.json (${res.status})`);
      const model = (await res.json()) as Model;
      set({ model, status: "ready" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  },

  setSeed: (label) => set({ seedLabel: label, seed: hashSeed(label.trim() || "2026") }),

  randomizeSeed: () => {
    const n = Math.floor(Math.random() * 1_000_000);
    set({ seedLabel: String(n), seed: n });
  },

  setRuns: (n) => set({ runs: n }),

  runSimulation: async (overrides) => {
    const { model, seed, runs } = get();
    if (!model) return;
    set({ status: "running", progress: 0, error: null });
    try {
      const result = await getRunner().montecarlo(model, runs, seed, overrides, (done, total) =>
        set({ progress: done / total }),
      );
      // keep the default (no-override) run as the manage-mode baseline
      const patch: Partial<StoreState> = { result, status: "done", progress: 1 };
      if (!overrides) patch.baseline = result;
      set(patch);
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  },

  runReveal: async (overrides) => {
    const { model, seed } = get();
    if (!model) return;
    const single = await getRunner().single(model, seed, overrides);
    set({ single });
  },
}));
