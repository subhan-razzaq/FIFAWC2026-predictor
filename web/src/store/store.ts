// Global app state. Loads the committed model.json, drives the Monte Carlo
// worker, and runs Manager Mode: a match-by-match playthrough where one nation is
// taken through the whole tournament with persistent squad condition. The seed is
// first-class so any run is reproducible and shareable.

import { create } from "zustand";
import {
  arrangeEleven,
  deriveSeed,
  enrichMatch,
  extractManagedCards,
  extractManagedMinutes,
  hashSeed,
  managedGroupSchedule,
  resolveBracketForManaged,
  resolveGroupStage,
  runSingle,
  simulateLiveSegment,
  simulateLiveShootout,
  type EnrichedMatch,
  type GoalEvent,
  type GroupStageOutcome,
  type ManagedMatchInfo,
  type MatchEvent,
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
import { counterAttackRisk, DEFAULT_TACTICS, type Tactics } from "../lib/tactics";
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

export type CareerPhase = "setup" | "preMatch" | "live" | "halftime" | "result" | "ended";

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

/** A half-time (or in-running) substitution the manager made. */
export interface LiveSub {
  minute: number;
  off: string;
  on: string;
}

/** The in-progress live match: the score and timeline so far, which half is on,
 * and the manager's running substitutions. Goals are precomputed per half but
 * revealed minute by minute by the Live Match Center. */
export interface LiveMatchState {
  info: ManagedMatchInfo;
  start: MatchSettings; // the XI / shape / tactics that kicked off
  managedSide: "home" | "away";
  home: string;
  away: string;
  goals: MatchEvent[]; // accumulated goal events (both sides), minute-stamped
  homeGoals: number;
  awayGoals: number;
  half: 1 | 2;
  endClock: number; // final-whistle minute for the current half (45, 90 or 120)
  fullTime: number; // the match's final whistle once known (90 or 120)
  subs: LiveSub[];
  tactics: Tactics; // the tactics currently in force (may change at half-time)
  formation: string; // the shape in force (may change at half-time)
  afterExtraTime: boolean;
  shootout?: { home: number; away: number; winner: string };
  winner?: string;
  secondHalfPlayed: boolean;
}

export interface CareerState {
  team: string;
  phase: CareerPhase;
  current: ManagedMatchInfo | null; // the match being prepared
  draft: MatchSettings | null; // working lineup/tactics for `current`
  live: LiveMatchState | null; // the match in progress, if any
  playerStates: PlayerStates;
  played: PlayedMatch[];
  group: GroupStageOutcome | null;
  outcome: { reached: Stage; isChampion: boolean } | null;
  projection: TeamOdds | null;
  lastResult: PlayedMatch | null;
}

export const MAX_HALFTIME_SUBS = 3;

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
  // live match lifecycle
  kickOff: () => void;
  goToHalftime: () => void;
  halftimeSub: (off: string, on: string) => void;
  undoHalftimeSub: (on: string) => void;
  setHalftimeTactics: (patch: Partial<Tactics>) => void;
  setHalftimeFormation: (formation: string) => void;
  resumeSecondHalf: () => void;
  finishMatch: () => void;
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

/**
 * Build the match overrides for one segment: the managed team's tactics/fatigue
 * adjusted attack/defence and scorer model, plus the counter-attack tax handed to
 * the opponent when the manager over-commits. `eleven` is whoever is on the pitch
 * for this segment, `states` the squad condition at the start of it.
 */
function buildLiveOverrides(
  model: Model,
  team: string,
  opponent: string,
  eleven: string[],
  formation: string,
  tactics: Tactics,
  penaltyTaker: string,
  states: PlayerStates,
): Overrides {
  const r = managedRatings(model, team, eleven, formation, tactics, states);
  const ratings: Record<string, { atk: number; def: number }> = { [team]: { atk: r.atk, def: r.def } };
  const risk = counterAttackRisk(tactics.mentality);
  if (risk > 0) {
    const opp = model.teams.find((t) => t.name === opponent);
    if (opp) ratings[opponent] = { atk: opp.atk + risk, def: opp.def };
  }
  return {
    ratings,
    scorers: { [team]: managedScorers(model.squads[team]!, eleven, penaltyTaker, states) },
  };
}

const KO_STAGES = new Set<Stage>(["R32", "R16", "QF", "SF", "third_place", "final"]);

/** Squad condition after playing `minutes` this match, by player position group. */
function depleteForMinutes(
  states: PlayerStates,
  minutes: Map<string, number>,
  byName: Map<string, { group: string }>,
): PlayerStates {
  const next: PlayerStates = { ...states };
  for (const [name, mins] of minutes) {
    const grp = byName.get(name)?.group ?? "MF";
    const cur = next[name] ?? freshCondition();
    next[name] = { ...cur, stamina: depleteStamina(cur.stamina, mins, grp) };
  }
  return next;
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
        live: null,
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

  // --- live match lifecycle ---------------------------------------------------
  // A managed match is played in segments so half-time decisions are real: the
  // first half is simulated at kick-off with the chosen XI/tactics; the manager
  // then makes up to three changes; the second half (and any extra time / pens) is
  // simulated AFTERWARDS with the updated lineup, tactics and mid-match fatigue.

  kickOff: () => {
    const { model, seed } = get();
    const c = get().career;
    if (!model || !c || !c.current || !c.draft) return;

    const info = c.current;
    const team = c.team;
    const home = info.isHome ? team : info.opponent;
    const away = info.isHome ? info.opponent : team;
    const managedSide: "home" | "away" = info.isHome ? "home" : "away";
    const spec = { home, away, stage: info.stage, hostHome: info.hostHome, hostAway: info.hostAway };
    const base = deriveSeed(seed, info.matchNo);

    const ov = buildLiveOverrides(
      model, team, info.opponent, c.draft.eleven, c.draft.formation, c.draft.tactics, c.draft.penaltyTaker, c.playerStates,
    );
    const h1 = simulateLiveSegment(model, ov, deriveSeed(base, 11), spec, 0, 45);

    set({
      career: {
        ...c,
        phase: "live",
        live: {
          info,
          start: { ...c.draft, tactics: { ...c.draft.tactics } },
          managedSide,
          home,
          away,
          goals: h1.goals,
          homeGoals: h1.homeGoals,
          awayGoals: h1.awayGoals,
          half: 1,
          endClock: 45,
          fullTime: 90,
          subs: [],
          tactics: { ...c.draft.tactics },
          formation: c.draft.formation,
          afterExtraTime: false,
          secondHalfPlayed: false,
        },
      },
    });
  },

  goToHalftime: () => {
    const c = get().career;
    if (!c || !c.live || c.live.half !== 1 || c.phase !== "live") return;
    set({ career: { ...c, phase: "halftime" } });
  },

  halftimeSub: (off, on) => {
    const c = get().career;
    if (!c || !c.live || c.phase !== "halftime") return;
    const live = c.live;
    if (live.subs.length >= MAX_HALFTIME_SUBS) return;
    const subbedOff = new Set(live.subs.map((s) => s.off));
    const broughtOn = new Set(live.subs.map((s) => s.on));
    // `off` must be a starter still on the pitch; `on` a genuine bench player.
    if (!live.start.eleven.includes(off) || subbedOff.has(off)) return;
    if (live.start.eleven.includes(on) || broughtOn.has(on)) return;
    set({ career: { ...c, live: { ...live, subs: [...live.subs, { minute: 45, off, on }] } } });
  },

  undoHalftimeSub: (on) => {
    const c = get().career;
    if (!c || !c.live || c.phase !== "halftime") return;
    set({ career: { ...c, live: { ...c.live, subs: c.live.subs.filter((s) => s.on !== on) } } });
  },

  setHalftimeTactics: (patch) => {
    const c = get().career;
    if (!c || !c.live || c.phase !== "halftime") return;
    set({ career: { ...c, live: { ...c.live, tactics: { ...c.live.tactics, ...patch } } } });
  },

  setHalftimeFormation: (formation) => {
    const c = get().career;
    if (!c || !c.live || c.phase !== "halftime") return;
    set({ career: { ...c, live: { ...c.live, formation } } });
  },

  resumeSecondHalf: () => {
    const { model, seed } = get();
    const c = get().career;
    if (!model || !c || !c.live || c.phase !== "halftime") return;
    const live = c.live;
    const team = c.team;
    const info = live.info;
    const spec = { home: live.home, away: live.away, stage: info.stage, hostHome: info.hostHome, hostAway: info.hostAway };
    const base = deriveSeed(seed, info.matchNo);

    // mid-match fatigue: every starter has played 45'; the players coming on are fresh.
    const byName = new Map(model.squads[team]!.players.map((p) => [p.name, p]));
    const h1Minutes = new Map<string, number>();
    for (const name of live.start.eleven) h1Minutes.set(name, 45);
    const statesH2 = depleteForMinutes(c.playerStates, h1Minutes, byName);

    // the XI on the pitch for the second half, after the substitutions, arranged
    // into whatever shape is now in force (the manager may have switched at the break)
    const swapped = live.start.eleven.map((n) => live.subs.find((s) => s.off === n)?.on ?? n);
    const elevenH2 = arrangeEleven(model.squads[team]!, swapped, live.formation);

    const ovH2 = buildLiveOverrides(
      model, team, info.opponent, elevenH2, live.formation, live.tactics, live.start.penaltyTaker, statesH2,
    );
    const h2 = simulateLiveSegment(model, ovH2, deriveSeed(base, 22), spec, 45, 90);

    let goals = [...live.goals, ...h2.goals];
    let homeGoals = live.homeGoals + h2.homeGoals;
    let awayGoals = live.awayGoals + h2.awayGoals;
    let endClock = 90;
    let fullTime = 90;
    let afterExtraTime = false;
    let shootout: { home: number; away: number; winner: string } | undefined;
    let winner: string | undefined;

    const isKO = KO_STAGES.has(info.stage);
    if (isKO && homeGoals === awayGoals) {
      afterExtraTime = true;
      const et = simulateLiveSegment(model, ovH2, deriveSeed(base, 33), spec, 90, 120);
      goals = [...goals, ...et.goals];
      homeGoals += et.homeGoals;
      awayGoals += et.awayGoals;
      endClock = 120;
      fullTime = 120;
    }
    if (isKO) {
      if (homeGoals > awayGoals) winner = live.home;
      else if (awayGoals > homeGoals) winner = live.away;
      else {
        shootout = simulateLiveShootout(model, ovH2, deriveSeed(base, 44), live.home, live.away);
        winner = shootout.winner;
      }
    }

    set({
      career: {
        ...c,
        phase: "live",
        live: {
          ...live,
          goals,
          homeGoals,
          awayGoals,
          half: 2,
          endClock,
          fullTime,
          afterExtraTime,
          ...(shootout ? { shootout } : {}),
          ...(winner ? { winner } : {}),
          secondHalfPlayed: true,
        },
      },
    });
  },

  finishMatch: () => {
    const { model, seed } = get();
    const c = get().career;
    if (!model || !c || !c.live || !c.live.secondHalfPlayed) return;
    const live = c.live;
    const team = c.team;
    const info = live.info;

    const scorers: GoalEvent[] = [...live.goals]
      .sort((a, b) => a.minute - b.minute)
      .map((e) => ({ team: e.team, player: e.player, kind: e.kind ?? "open", ...(e.assist ? { assist: e.assist } : {}) }));
    const result: MatchResult = {
      home: live.home,
      away: live.away,
      homeGoals: live.homeGoals,
      awayGoals: live.awayGoals,
      stage: info.stage,
      scorers,
    };
    if (live.afterExtraTime) result.afterExtraTime = true;
    if (live.shootout) result.shootout = live.shootout;
    if (live.winner) result.winner = live.winner;

    // canonical timeline: the live goals at their real minutes plus the manager's
    // own substitutions, so the post-match detail is exactly what played out.
    const enriched = enrichMatch({
      model,
      match: result,
      seed,
      elevenOverride: { [team]: live.start.eleven },
      formationOverride: { [team]: live.start.formation },
      captainOverride: { [team]: live.start.captain },
      penaltyOverride: { [team]: live.start.penaltyTaker },
      providedGoalEvents: live.goals,
      subsOverride: { [team]: live.subs.map((s) => ({ minute: s.minute, off: s.off, on: s.on })) },
    });

    // squad condition from the SAME events the timeline shows
    let states: PlayerStates = { ...c.playerStates };
    const minutes = extractManagedMinutes(enriched, team, live.afterExtraTime);
    const byName = new Map(model.squads[team]!.players.map((p) => [p.name, p]));
    states = depleteForMinutes(states, minutes, byName);
    const suspendedForThis = Object.keys(states).filter((n) => c.playerStates[n]?.suspendedNext);
    states = clearServedSuspensions(states, suspendedForThis);
    const cards = extractManagedCards(enriched, team);
    states = applyMatchCards(states, cards.yellows, cards.reds);
    if (info.stage === "QF") states = wipeYellows(states);

    const playedMatch: PlayedMatch = { info, settings: live.start, result, enriched };
    set({
      career: {
        ...c,
        phase: "result",
        live: null,
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
