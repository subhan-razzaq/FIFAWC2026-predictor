// Global app state. Loads the committed model.json, drives the Monte Carlo
// worker, and runs Manager Mode: a match-by-match playthrough where one nation is
// taken through the whole tournament with persistent squad condition. The seed is
// first-class so any run is reproducible and shareable.

import { create } from "zustand";
import {
  enrichMatch,
  extractManagedCards,
  extractManagedMinutes,
  hashSeed,
  managedGroupSchedule,
  playManagedMatch,
  resolveBracketForManaged,
  resolveGroupStage,
  runSingle,
  type EnrichedMatch,
  type GroupStageOutcome,
  type ManagedMatchInfo,
  type MatchResult,
  type Model,
  type MonteCarloResult,
  type Overrides,
  type PlayedManagedMatch,
  type Stage,
  type TeamOdds,
  type TournamentResult,
} from "@weltmeister/sim";
import { getRunner } from "../sim/runner";
import { buildEleven, managedRatings, managedScorers } from "../lib/manage";
import { DEFAULT_TACTICS, type Tactics } from "../lib/tactics";
import {
  applyMatchCards,
  clearServedSuspensions,
  freshCondition,
  isAvailable,
  wipeYellows,
  type PlayerStates,
} from "../lib/cards";
import { depleteStamina, GROUP_REST, KO_REST, recoverStamina } from "../lib/fatigue";

export type Status = "boot" | "ready" | "running" | "done" | "error";
export type Theme = "dark" | "light";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const t = window.localStorage.getItem("wm-theme");
  return t === "light" ? "light" : "dark";
}

// --- Manager Mode (career) types ---------------------------------------------

export type CareerPhase = "setup" | "preMatch" | "result" | "ended";

export interface MatchSettings {
  formation: string;
  eleven: string[];
  tactics: Tactics;
  captain: string;
  penaltyTaker: string;
}

export interface PlayedMatch {
  info: ManagedMatchInfo;
  settings: MatchSettings;
  result: MatchResult;
  enriched: EnrichedMatch;
}

export interface CareerState {
  team: string;
  phase: CareerPhase;
  current: ManagedMatchInfo | null; // the match being prepared
  draft: MatchSettings | null; // working lineup/tactics for `current`
  playerStates: PlayerStates;
  played: PlayedMatch[];
  group: GroupStageOutcome | null;
  outcome: { reached: Stage; isChampion: boolean } | null;
  projection: TeamOdds | null;
  lastResult: PlayedMatch | null;
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

  career: CareerState | null;

  theme: Theme;
  toggleTheme: () => void;

  init: () => Promise<void>;
  setSeed: (label: string) => void;
  randomizeSeed: () => void;
  setRuns: (n: number) => void;
  run: (newSeed: boolean) => Promise<void>;
  runSimulation: (overrides?: Overrides) => Promise<void>;
  runReveal: (overrides?: Overrides) => Promise<void>;

  // Manager Mode
  startCareer: (team: string) => void;
  setDraft: (patch: Partial<MatchSettings>) => void;
  setFormation: (formation: string) => void;
  setEleven: (eleven: string[]) => void;
  playCurrentMatch: () => void;
  continueCareer: () => void;
  resetCareer: () => void;
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

// --- Manager Mode helpers -----------------------------------------------------

function initStates(model: Model, team: string): PlayerStates {
  const states: PlayerStates = {};
  for (const p of model.squads[team]!.players) states[p.name] = freshCondition();
  return states;
}

/** Build a default match plan (lineup, tactics, captain, pk) for an upcoming
 * fixture, excluding suspended players and preferring the previous picks. */
function defaultSettings(
  model: Model,
  team: string,
  states: PlayerStates,
  formation: string,
  prefer: string[],
): MatchSettings {
  const squad = model.squads[team]!;
  const exclude = new Set(squad.players.filter((p) => !isAvailable(states, p.name)).map((p) => p.name));
  const eleven = buildEleven(squad, formation, { prefer, exclude });
  const inXi = new Set(eleven);
  const captain = inXi.has(squad.captain) ? squad.captain : eleven[0]!;
  const penaltyTaker = inXi.has(squad.penalty_taker) ? squad.penalty_taker : eleven[10] ?? eleven[0]!;
  return { formation, eleven, tactics: { ...DEFAULT_TACTICS }, captain, penaltyTaker };
}

/** Overrides for the managed team built from the current draft + squad condition. */
function draftOverrides(model: Model, team: string, draft: MatchSettings, states: PlayerStates): Overrides {
  const r = managedRatings(model, team, draft.eleven, draft.formation, draft.tactics, states);
  return {
    ratings: { [team]: { atk: r.atk, def: r.def } },
    scorers: { [team]: managedScorers(model.squads[team]!, draft.eleven, draft.penaltyTaker, states) },
  };
}

const KO_STAGES = new Set<Stage>(["R32", "R16", "QF", "SF", "third_place", "final"]);

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

  career: null,

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

  run: async (newSeed) => {
    if (newSeed) {
      const n = Math.floor(Math.random() * 1_000_000);
      writeSeedToUrl(String(n));
      set({ seed: n, seedLabel: String(n) });
    }
    await get().runReveal();
    await get().runSimulation();
  },

  runSimulation: async (overrides) => {
    const { model, seed, runs } = get();
    if (!model) return;
    set({ status: "running", progress: 0, error: null });
    try {
      const result = await getRunner().montecarlo(model, runs, seed, overrides, (done, total) =>
        set({ progress: done / total }),
      );
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
    const single = runSingle(model, seed, overrides);
    set({ single });
  },

  // --- Manager Mode actions ---------------------------------------------------

  startCareer: (team) => {
    const { model } = get();
    if (!model) return;
    const states = initStates(model, team);
    const schedule = managedGroupSchedule(model, team);
    const current = schedule[0]!;
    const draft = defaultSettings(model, team, states, model.squads[team]!.formation, model.squads[team]!.projected_eleven);
    set({
      career: {
        team,
        phase: "preMatch",
        current,
        draft,
        playerStates: states,
        played: [],
        group: null,
        outcome: null,
        projection: get().baseline?.teams.find((t) => t.team === team) ?? null,
        lastResult: null,
      },
    });
    // a one-time baseline run gives the pre-tournament projection and the grade
    // benchmark; reuse it if we already have one for this seed.
    if (!get().baseline) {
      const { seed, runs } = get();
      void getRunner()
        .montecarlo(model, runs, seed, undefined)
        .then((base) => {
          set({ baseline: base });
          const c = get().career;
          if (c) set({ career: { ...c, projection: base.teams.find((t) => t.team === c.team) ?? null } });
        })
        .catch(() => {});
    }
  },

  setDraft: (patch) => {
    const c = get().career;
    if (!c || !c.draft) return;
    set({ career: { ...c, draft: { ...c.draft, ...patch } } });
  },

  setFormation: (formation) => {
    const { model } = get();
    const c = get().career;
    if (!model || !c || !c.draft) return;
    const squad = model.squads[c.team]!;
    const exclude = new Set(squad.players.filter((p) => !isAvailable(c.playerStates, p.name)).map((p) => p.name));
    const eleven = buildEleven(squad, formation, { prefer: c.draft.eleven, exclude });
    const inXi = new Set(eleven);
    const captain = inXi.has(c.draft.captain) ? c.draft.captain : eleven[0]!;
    const penaltyTaker = inXi.has(c.draft.penaltyTaker) ? c.draft.penaltyTaker : eleven[10] ?? eleven[0]!;
    set({ career: { ...c, draft: { ...c.draft, formation, eleven, captain, penaltyTaker } } });
  },

  setEleven: (eleven) => {
    const c = get().career;
    if (!c || !c.draft) return;
    const inXi = new Set(eleven);
    const captain = inXi.has(c.draft.captain) ? c.draft.captain : eleven[0]!;
    const penaltyTaker = inXi.has(c.draft.penaltyTaker) ? c.draft.penaltyTaker : eleven[10] ?? eleven[0]!;
    set({ career: { ...c, draft: { ...c.draft, eleven, captain, penaltyTaker } } });
  },

  playCurrentMatch: () => {
    const { model, seed } = get();
    const c = get().career;
    if (!model || !c || !c.current || !c.draft) return;

    const info = c.current;
    const overrides = draftOverrides(model, c.team, c.draft, c.playerStates);
    const result = playManagedMatch(model, seed, c.team, info, overrides);
    const enriched = enrichMatch({
      model,
      match: result,
      seed,
      elevenOverride: { [c.team]: c.draft.eleven },
      formationOverride: { [c.team]: c.draft.formation },
      captainOverride: { [c.team]: c.draft.captain },
      penaltyOverride: { [c.team]: c.draft.penaltyTaker },
    });

    // update squad condition from the SAME events the timeline shows
    let states: PlayerStates = { ...c.playerStates };
    const minutes = extractManagedMinutes(enriched, c.team, result.afterExtraTime);
    const byName = new Map(model.squads[c.team]!.players.map((p) => [p.name, p]));
    for (const [name, mins] of minutes) {
      const grp = byName.get(name)?.group ?? "MF";
      const cur = states[name] ?? freshCondition();
      states[name] = { ...cur, stamina: depleteStamina(cur.stamina, mins, grp) };
    }
    // players banned for this match have now served it
    const suspendedForThis = Object.keys(states).filter((n) => c.playerStates[n]?.suspendedNext);
    states = clearServedSuspensions(states, suspendedForThis);
    // new bookings from this match
    const cards = extractManagedCards(enriched, c.team);
    states = applyMatchCards(states, cards.yellows, cards.reds);
    // FIFA: accumulated yellows are wiped after the quarter-finals
    if (info.stage === "QF") states = wipeYellows(states);

    const playedMatch: PlayedMatch = { info, settings: c.draft, result, enriched };
    set({
      career: {
        ...c,
        phase: "result",
        playerStates: states,
        played: [...c.played, playedMatch],
        lastResult: playedMatch,
      },
    });
  },

  continueCareer: () => {
    const { model, seed } = get();
    const c = get().career;
    if (!model || !c) return;

    // rest recovery between matches
    const lastStage = c.played[c.played.length - 1]?.info.stage ?? "group";
    const rest = lastStage === "group" ? GROUP_REST : KO_REST;
    let states: PlayerStates = {};
    for (const [name, cond] of Object.entries(c.playerStates)) {
      states[name] = { ...cond, stamina: recoverStamina(cond.stamina, rest) };
    }

    const groupPlayed = c.played.filter((p) => p.info.stage === "group").length;

    // still in the group stage: line up the next fixture
    if (groupPlayed < 3) {
      const schedule = managedGroupSchedule(model, c.team);
      const next = schedule[groupPlayed]!;
      const draft = defaultSettings(model, c.team, states, c.draft?.formation ?? model.squads[c.team]!.formation, c.draft?.eleven ?? model.squads[c.team]!.projected_eleven);
      set({ career: { ...c, phase: "preMatch", current: next, draft, playerStates: states, lastResult: null } });
      return;
    }

    // group stage finished: resolve the table, then walk the bracket
    const groupResults = c.played.filter((p) => p.info.stage === "group").map((p) => p.result);
    const group = c.group ?? resolveGroupStage(model, seed, c.team, groupResults);
    if (!group.advanced) {
      set({ career: { ...c, phase: "ended", current: null, draft: null, group, playerStates: states, outcome: { reached: "group", isChampion: false } } });
      return;
    }

    const koPlayed: PlayedManagedMatch[] = c.played
      .filter((p) => KO_STAGES.has(p.info.stage))
      .map((p) => ({ matchNo: p.info.matchNo, result: p.result }));
    const status = resolveBracketForManaged(model, seed, group.standings, group.thirds, c.team, koPlayed);

    if (status.status === "pending") {
      const current: ManagedMatchInfo = {
        matchNo: status.matchNo,
        stage: status.stage,
        opponent: status.opponent,
        isHome: status.isHome,
        hostHome: status.hostHome,
        hostAway: status.hostAway,
      };
      const draft = defaultSettings(model, c.team, states, c.draft?.formation ?? model.squads[c.team]!.formation, c.draft?.eleven ?? model.squads[c.team]!.projected_eleven);
      set({ career: { ...c, phase: "preMatch", current, draft, group, playerStates: states, lastResult: null } });
      return;
    }

    const reached: Stage = status.status === "champion" ? "final" : status.stage;
    set({
      career: {
        ...c,
        phase: "ended",
        current: null,
        draft: null,
        group,
        playerStates: states,
        outcome: { reached, isChampion: status.status === "champion" },
      },
    });
  },

  resetCareer: () => set({ career: null }),
}));
