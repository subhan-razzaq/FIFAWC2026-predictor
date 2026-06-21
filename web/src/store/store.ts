// Global app state. Loads the committed model.json, drives the Monte Carlo
// worker, and holds the manage-mode overrides. The seed is first-class so any
// run is reproducible and shareable.

import { create } from "zustand";
import {
  hashSeed,
  runSingle,
  type Model,
  type MonteCarloResult,
  type Overrides,
  type TournamentResult,
} from "@weltmeister/sim";
import { getRunner } from "../sim/runner";

export type Status = "boot" | "ready" | "running" | "done" | "error";
export type Theme = "dark" | "light";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const t = window.localStorage.getItem("wm-theme");
  return t === "light" ? "light" : "dark";
}

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
  manageResult: MonteCarloResult | null;
  manageRunning: boolean;
  manageProgress: number;

  theme: Theme;
  toggleTheme: () => void;

  init: () => Promise<void>;
  setSeed: (label: string) => void;
  randomizeSeed: () => void;
  setRuns: (n: number) => void;
  runSimulation: (overrides?: Overrides) => Promise<void>;
  runReveal: (overrides?: Overrides) => Promise<void>;
  runManage: (overrides: Overrides) => Promise<void>;
}

const DEFAULT_RUNS = 10000;

function readSeedFromUrl(): { seed: number; label: string } {
  if (typeof window === "undefined") return { seed: 2026, label: "2026" };
  const s = new URLSearchParams(window.location.search).get("seed");
  if (!s) return { seed: 2026, label: "2026" };
  return { seed: hashSeed(s), label: s };
}

function writeSeedToUrl(label: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", label);
  window.history.replaceState(null, "", url.toString());
}

export const useStore = create<StoreState>((set, get) => ({
  model: null,
  status: "boot",
  error: null,
  progress: 0,

  seed: readSeedFromUrl().seed,
  seedLabel: readSeedFromUrl().label,
  runs: DEFAULT_RUNS,

  result: null,
  baseline: null,
  single: null,

  manage: { team: null, eleven: [], formation: "4-3-3", attackBias: 0 },
  manageResult: null,
  manageRunning: false,
  manageProgress: 0,

  theme: readTheme(),
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    if (typeof window !== "undefined") window.localStorage.setItem("wm-theme", next);
    set({ theme: next });
  },

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

  setSeed: (label) => {
    writeSeedToUrl(label.trim() || "2026");
    set({ seedLabel: label, seed: hashSeed(label.trim() || "2026") });
  },

  randomizeSeed: () => {
    const n = Math.floor(Math.random() * 1_000_000);
    writeSeedToUrl(String(n));
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

  // A single tournament is ~1ms, so run it on the main thread for an instant
  // bracket rather than queueing it behind the Monte Carlo on the worker.
  runReveal: async (overrides) => {
    const { model, seed } = get();
    if (!model) return;
    const single = runSingle(model, seed, overrides);
    set({ single });
  },

  runManage: async (overrides) => {
    const { model, seed, runs } = get();
    if (!model) return;
    set({ manageRunning: true, manageProgress: 0 });
    try {
      const runner = getRunner();
      // ensure a like-for-like default-squad baseline at the same seed and runs
      if (!get().baseline) {
        const base = await runner.montecarlo(model, runs, seed, undefined);
        set({ baseline: base });
      }
      const managed = await runner.montecarlo(model, runs, seed, overrides, (d, t) =>
        set({ manageProgress: d / t }),
      );
      set({ manageResult: managed, manageRunning: false, manageProgress: 1 });
    } catch (err) {
      set({ manageRunning: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
