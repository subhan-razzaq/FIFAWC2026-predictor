// The Live Match Center: a managed game played out minute by minute. The clock
// ticks, goals drop onto a commentary feed as they happen, and the manager can
// stop play at ANY moment (not only half-time) to open a tactical board: a visual
// XI you sub from by tapping, quick approach presets, a shape switch and a live
// attack/defence read-out. On resume, the rest of the half is re-simulated with
// those exact choices, so every change genuinely bites.

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { arrangeEleven, type Model } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import type { CareerState, LiveSub } from "../../store/store";
import { MAX_SUBS } from "../../store/store";
import { TeamBadge } from "../../components/TeamBadge";
import { FORMATIONS, managedRatings } from "../../lib/manage";
import { mentalityLabel, pacingLabel, pressingLabel, type Tactics } from "../../lib/tactics";
import { isAvailable, type PlayerStates } from "../../lib/cards";
import { depleteStamina, staminaTier } from "../../lib/fatigue";

const BASE_TICK_MS = 130; // real ms per match-minute at 1x
const SPEEDS = [1, 2, 4];

const TIER_COLOR: Record<string, string> = {
  fresh: "var(--mex-green)",
  ok: "var(--fifa-teal)",
  tired: "var(--fifa-orange)",
  spent: "var(--fifa-red)",
};

// the same position ring the pre-match pitch and match lineup use
const RING: Record<string, string> = {
  GK: "var(--gold)",
  DF: "var(--usa-blue)",
  MF: "var(--mex-green)",
  FW: "var(--can-red)",
};

/** A player's overall rating on a familiar 40-99 scale, from the model's ability. */
function ovr(ability: number): number {
  return Math.max(40, Math.min(99, Math.round(49 + ability * 50)));
}

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

const PRESETS: { label: string; t: Tactics }[] = [
  { label: "Park bus", t: { mentality: -1, pressing: 0.15, pacing: 0.2 } },
  { label: "Contain", t: { mentality: -0.4, pressing: 0.35, pacing: 0.4 } },
  { label: "Balanced", t: { mentality: 0, pressing: 0.5, pacing: 0.5 } },
  { label: "Attack", t: { mentality: 0.5, pressing: 0.7, pacing: 0.75 } },
  { label: "All-out", t: { mentality: 1, pressing: 0.9, pacing: 0.9 } },
];

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface FeedItem {
  minute: number;
  kind: "period" | "goal" | "sub";
  text: string;
  side?: "home" | "away";
}

export function LiveMatchCenter({
  model,
  career,
  groupOf,
}: {
  model: Model;
  career: CareerState;
  groupOf: Map<string, string>;
}) {
  const phase = career.phase;
  const live = career.live;
  const goToHalftime = useStore((s) => s.goToHalftime);
  const finishMatch = useStore((s) => s.finishMatch);
  const resumeSecondHalf = useStore((s) => s.resumeSecondHalf);
  const commitLiveChanges = useStore((s) => s.commitLiveChanges);

  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [ftReached, setFtReached] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [flash, setFlash] = useState<{ side: "home" | "away"; text: string } | null>(null);
  const minuteRef = useRef(0);
  const prevGoalsRef = useRef(0);

  const half = live?.half ?? 1;
  const endClock = live?.endClock ?? 45;
  const segStart = half === 1 ? 0 : 45;
  const segEnd = half === 1 ? 45 : endClock;

  // reset the clock whenever a new half starts
  useEffect(() => {
    if (phase !== "live") return;
    minuteRef.current = segStart;
    setClock(segStart);
    setFtReached(false);
    setAdjusting(false);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, half]);

  // run the clock (paused while adjusting)
  useEffect(() => {
    if (phase !== "live" || !playing || adjusting) return;
    const end = () => {
      if (half === 1) goToHalftime();
      else {
        setPlaying(false);
        setFtReached(true);
      }
    };
    if (reduceMotion()) {
      minuteRef.current = segEnd;
      setClock(segEnd);
      end();
      return;
    }
    const id = window.setInterval(() => {
      minuteRef.current += 1;
      const m = minuteRef.current;
      setClock(m);
      if (m >= segEnd) {
        window.clearInterval(id);
        end();
      }
    }, BASE_TICK_MS / speed);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, half, playing, speed, adjusting]);

  // goal flash
  const revealed = live ? live.goals.filter((g) => g.minute <= clock) : [];
  const homeScore = revealed.filter((g) => g.side === "home").length;
  const awayScore = revealed.filter((g) => g.side === "away").length;
  const total = homeScore + awayScore;
  useEffect(() => {
    if (!live) return;
    if (total > prevGoalsRef.current && total > 0) {
      const last = revealed.reduce((a, b) => (b.minute >= a.minute ? b : a), revealed[0]!);
      setFlash({ side: last.side ?? "home", text: last.player });
      const id = window.setTimeout(() => setFlash(null), 1500);
      prevGoalsRef.current = total;
      return () => window.clearTimeout(id);
    }
    prevGoalsRef.current = total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  if (!live) return null;

  const phaseLabel =
    phase === "halftime"
      ? "Half-time"
      : adjusting
        ? "Paused"
        : ftReached
          ? "Full-time"
          : clock >= 90
            ? "Extra time"
            : half === 1
              ? "First half"
              : "Second half";

  const canAdjust = phase === "live" && !ftReached && clock < 90;
  const boardOpen = phase === "halftime" || adjusting;
  const feed = buildFeed(live, clock, ftReached, phase === "halftime");

  // signature of the manager's setup, so resuming only re-simulates the rest of
  // the half when something genuinely changed (no free re-rolls on a peek).
  const setupSig = (l: NonNullable<CareerState["live"]>) =>
    `${l.subs.map((s) => s.on).join(",")}|${l.formation}|${l.tactics.mentality},${l.tactics.pressing},${l.tactics.pacing}`;
  const snapRef = useRef("");

  const openAdjust = () => {
    snapRef.current = setupSig(live);
    setPlaying(false);
    setAdjusting(true);
  };
  const closeAdjust = () => {
    if (setupSig(live) !== snapRef.current) commitLiveChanges(minuteRef.current);
    setAdjusting(false);
    setPlaying(true);
  };

  return (
    <div className="lmc">
      <Scoreboard
        live={live}
        groupOf={groupOf}
        homeScore={homeScore}
        awayScore={awayScore}
        clock={Math.min(clock, endClock)}
        phaseLabel={phaseLabel}
        flash={flash}
      />

      {phase === "live" && !ftReached && !adjusting && (
        <div className="lmc__controls">
          <button className="btn btn--ghost" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Resume"}
          </button>
          <div className="lmc__speeds" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={`group-tab ${speed === s ? "active" : ""}`}
                style={{ width: "auto", padding: "0 10px" }}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <button className="btn lmc__adjust" onClick={openAdjust} disabled={!canAdjust} title={canAdjust ? "" : "Changes reopen after extra time kicks off"}>
            Subs &amp; tactics
          </button>
          <button className="btn btn--ghost" onClick={skipFor(half, segEnd, minuteRef, setClock, setPlaying, goToHalftime, setFtReached)}>
            {half === 1 ? "Skip to half-time" : "Skip to full-time"}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {boardOpen ? (
          <motion.div
            key="board"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <TacticalBoard
              model={model}
              career={career}
              live={live}
              minute={phase === "halftime" ? 45 : clock}
              title={phase === "halftime" ? "Half-time team talk" : `${clock}′ — Subs & tactics`}
              primaryLabel={phase === "halftime" ? "Start the second half →" : "Back to the match →"}
              onPrimary={phase === "halftime" ? resumeSecondHalf : closeAdjust}
            />
          </motion.div>
        ) : (
          <motion.div
            key="playout"
            className="lmc__playout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <CommentaryFeed feed={feed} />
            {ftReached && (
              <button className="btn lmc__finish" onClick={finishMatch}>
                Full-time — see the result →
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// a small factory so the skip handler closure stays readable in JSX
function skipFor(
  half: number,
  segEnd: number,
  minuteRef: MutableRefObject<number>,
  setClock: (n: number) => void,
  setPlaying: (b: boolean) => void,
  goToHalftime: () => void,
  setFtReached: (b: boolean) => void,
) {
  return () => {
    minuteRef.current = segEnd;
    setClock(segEnd);
    setPlaying(false);
    if (half === 1) goToHalftime();
    else setFtReached(true);
  };
}

function Scoreboard({
  live,
  groupOf,
  homeScore,
  awayScore,
  clock,
  phaseLabel,
  flash,
}: {
  live: NonNullable<CareerState["live"]>;
  groupOf: Map<string, string>;
  homeScore: number;
  awayScore: number;
  clock: number;
  phaseLabel: string;
  flash: { side: "home" | "away"; text: string } | null;
}) {
  return (
    <div className="lmc__board flat-card">
      <div className="lmc__side">
        <TeamBadge team={live.home} group={groupOf.get(live.home)} size={34} />
        <span className="lmc__team anton">{live.home}</span>
      </div>
      <div className="lmc__center">
        <motion.div key={`${homeScore}-${awayScore}`} className="lmc__score anton" initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 16 }}>
          {homeScore}<span className="lmc__colon">:</span>{awayScore}
        </motion.div>
        <div className="lmc__clock mono">{clock}&prime;</div>
        <div className="lmc__phase eyebrow">{phaseLabel}</div>
      </div>
      <div className="lmc__side lmc__side--away">
        <span className="lmc__team anton">{live.away}</span>
        <TeamBadge team={live.away} group={groupOf.get(live.away)} size={34} />
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.text + flash.side}
            className={`lmc__flash ${flash.side === "home" ? "left" : "right"}`}
            initial={{ opacity: 0, scale: 0.6, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 360, damping: 18 }}
          >
            <span className="lmc__flash-word anton">GOAL</span>
            <span className="lmc__flash-who mono">{flash.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CommentaryFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="lmc__feed">
      {feed.length === 0 ? (
        <div className="lmc__feed-empty mono">The match is under way…</div>
      ) : (
        <AnimatePresence initial={false}>
          {feed.map((f) => (
            <motion.div
              key={`${f.minute}-${f.kind}-${f.text}`}
              layout
              className={`lmc__event lmc__event--${f.kind}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
            >
              <span className="lmc__event-min mono">{f.minute}&prime;</span>
              <span className="lmc__event-text">{f.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

// --- the tactical board (half-time or any in-running pause) -------------------

function TacticalBoard({
  model,
  career,
  live,
  minute,
  title,
  primaryLabel,
  onPrimary,
}: {
  model: Model;
  career: CareerState;
  live: NonNullable<CareerState["live"]>;
  minute: number;
  title: string;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  const liveSub = useStore((s) => s.liveSub);
  const undoLiveSub = useStore((s) => s.undoLiveSub);
  const setLiveTactics = useStore((s) => s.setLiveTactics);
  const setLiveFormation = useStore((s) => s.setLiveFormation);

  const team = career.team;
  const squad = model.squads[team]!;
  const [selectedOff, setSelectedOff] = useState<string | null>(null);
  const [showFine, setShowFine] = useState(false);

  const t = live.tactics;
  const broughtOn = useMemo(() => new Set(live.subs.map((s) => s.on)), [live.subs]);
  const byName = useMemo(() => new Map(squad.players.map((p) => [p.name, p])), [squad]);

  // condition at this minute (starters worn by the minutes they've logged)
  const midStates = useMemo(() => {
    const m: PlayerStates = {};
    for (const [name, c] of Object.entries(career.playerStates)) m[name] = { ...c };
    const played = new Map<string, number>();
    for (const name of live.start.eleven) {
      const sub = live.subs.find((s) => s.off === name);
      played.set(name, Math.max(0, sub ? Math.min(sub.minute, minute) : minute));
    }
    for (const s of live.subs) if (s.minute <= minute) played.set(s.on, Math.max(0, minute - s.minute));
    for (const [name, mins] of played) {
      const grp = byName.get(name)?.group ?? "MF";
      const cur = m[name] ?? { stamina: 100, yellows: 0, suspendedNext: false };
      m[name] = { ...cur, stamina: depleteStamina(cur.stamina, mins, grp) };
    }
    return m;
  }, [career.playerStates, live.start.eleven, live.subs, minute, byName]);

  const onPitch = useMemo(() => {
    const swapped = live.start.eleven.map((n) => live.subs.find((s) => s.off === n)?.on ?? n);
    return arrangeEleven(squad, swapped, live.formation);
  }, [squad, live.start.eleven, live.subs, live.formation]);

  const bench = useMemo(
    () =>
      squad.players
        .filter((p) => !live.start.eleven.includes(p.name) && !broughtOn.has(p.name) && isAvailable(career.playerStates, p.name))
        .sort((a, b) => b.ability - a.ability),
    [squad, live.start.eleven, broughtOn, career.playerStates],
  );

  const subsLeft = MAX_SUBS - live.subs.length;
  const base = model.teams.find((x) => x.name === team)!;
  const r = managedRatings(model, team, onPitch, live.formation, t, midStates);
  const dAtk = r.atk - base.atk;
  const dDef = r.def - base.def;
  const tiredCount = onPitch.filter((n) => (midStates[n]?.stamina ?? 100) < 50).length;

  // half-time read: how the matchup, the scoreline and fatigue actually stack up
  const oppTeam = model.teams.find((x) => x.name === live.info.opponent);
  const myGoals = live.managedSide === "home" ? live.homeGoals : live.awayGoals;
  const oppGoals = live.managedSide === "home" ? live.awayGoals : live.homeGoals;
  const tips = buildInsights(r.atk, r.def, oppTeam?.atk ?? 1, oppTeam?.def ?? 1, myGoals, oppGoals, tiredCount);

  const pickOff = (name: string) => {
    if (broughtOn.has(name)) return;
    setSelectedOff((cur) => (cur === name ? null : name));
  };
  const pickOn = (name: string) => {
    if (subsLeft <= 0 || !selectedOff) return;
    liveSub(selectedOff, name, minute);
    setSelectedOff(null);
  };
  const activePreset = PRESETS.reduce((best, p) =>
    Math.abs(p.t.mentality - t.mentality) < Math.abs(best.t.mentality - t.mentality) ? p : best,
  );

  return (
    <div className="lmc__ht">
      <div className="lmc__ht-head">
        <div>
          <div className="eyebrow">{title}</div>
          <div className="lmc__ht-score anton">
            {live.home} {live.homeGoals} – {live.awayGoals} {live.away}
          </div>
        </div>
        <div className="lmc__readout">
          <Readout label="Attack" value={r.atk} delta={dAtk} />
          <Readout label="Defence" value={r.def} delta={dDef} />
        </div>
      </div>

      <ul className="lmc__insights">
        {tips.map((tip, i) => (
          <li key={i} className={`lmc__insight ${tip.tone}`}>
            <span className="lmc__insight-dot" aria-hidden />
            {tip.text}
          </li>
        ))}
      </ul>

      <div className="lmc__ht-grid">
        <div className="lmc__pitchcol">
          <div className="lmc__col-head">
            <span className="eyebrow">{selectedOff ? "Now pick who comes on ▸" : "Your XI — tap a player to take off"}</span>
            <span className="mono lmc__subs-left">{subsLeft} sub{subsLeft === 1 ? "" : "s"} left</span>
          </div>
          <SubPitch
            onPitch={onPitch}
            formation={live.formation}
            byName={byName}
            midStates={midStates}
            broughtOn={broughtOn}
            selectedOff={selectedOff}
            onPick={pickOff}
          />
          {live.subs.length > 0 && (
            <ul className="lmc__sublist mono">
              {live.subs.map((s) => (
                <li key={s.on}>
                  <span className="lmc__sub-min">{s.minute}&prime;</span>
                  <span className="lmc__sub-on">▲ {s.on}</span> for {s.off}
                  <button className="lmc__sub-undo" onClick={() => undoLiveSub(s.on)} aria-label={`Undo ${s.on}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lmc__benchcol">
          <div className="lmc__col-head">
            <span className="eyebrow">{selectedOff ? `On for ${selectedOff}` : "Bench"}</span>
          </div>
          <div className={`lmc__bench ${selectedOff && subsLeft > 0 ? "armed" : ""}`}>
            {bench.length === 0 ? (
              <div className="mono lmc__note">No outfield options available.</div>
            ) : (
              bench.map((p) => (
                <BenchChip
                  key={p.name}
                  name={p.name}
                  pos={p.group}
                  rating={ovr(p.ability)}
                  stamina={career.playerStates[p.name]?.stamina ?? 100}
                  disabled={!selectedOff || subsLeft <= 0}
                  onClick={() => pickOn(p.name)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="lmc__tactics">
        <div className="lmc__col-head">
          <span className="eyebrow">Approach</span>
          <button className="lmc__finetune mono" onClick={() => setShowFine((v) => !v)}>
            {showFine ? "Hide fine-tune" : "Fine-tune"}
          </button>
        </div>
        <div className="lmc__presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`group-tab ${activePreset.label === p.label ? "active" : ""}`}
              style={{ width: "auto", padding: "0 12px" }}
              onClick={() => setLiveTactics(p.t)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {showFine && (
          <div className="lmc__sliders">
            <Slider label="Mentality" value={t.mentality} min={-1} max={1} step={0.1} read={mentalityLabel(t.mentality)} onChange={(v) => setLiveTactics({ mentality: v })} />
            <Slider label="Pressing" value={t.pressing} min={0} max={1} step={0.05} read={pressingLabel(t.pressing)} onChange={(v) => setLiveTactics({ pressing: v })} />
            <Slider label="Pacing" value={t.pacing} min={0} max={1} step={0.05} read={pacingLabel(t.pacing)} onChange={(v) => setLiveTactics({ pacing: v })} />
          </div>
        )}

        <div className="lmc__col-head" style={{ marginTop: "var(--s-3)" }}>
          <span className="eyebrow">Shape</span>
        </div>
        <div className="lmc__presets">
          {Object.keys(FORMATIONS).map((f) => (
            <button
              key={f}
              className={`group-tab ${f === live.formation ? "active" : ""}`}
              style={{ width: "auto", padding: "0 10px" }}
              onClick={() => setLiveFormation(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <button className="btn lmc__resume" onClick={onPrimary}>
        {primaryLabel}
      </button>
    </div>
  );
}

// The XI laid out on a pitch, exactly like the pre-match team sheet and the match
// lineup elsewhere. Tap a player to take them off.
function SubPitch({
  onPitch,
  formation,
  byName,
  midStates,
  broughtOn,
  selectedOff,
  onPick,
}: {
  onPitch: string[];
  formation: string;
  byName: Map<string, { group: string; number?: number; ability: number }>;
  midStates: PlayerStates;
  broughtOn: Set<string>;
  selectedOff: string | null;
  onPick: (name: string) => void;
}) {
  const f = FORMATIONS[formation] ?? FORMATIONS["4-3-3"]!;
  return (
    <div className="pitch lmc__subpitch" role="group" aria-label="Your eleven">
      <svg viewBox="0 0 100 100" className="pitch__lines" aria-hidden preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--line)" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="var(--line)" />
        <circle cx="50" cy="50" r="9" fill="none" stroke="var(--line)" />
        <rect x="30" y="0" width="40" height="14" fill="none" stroke="var(--line)" />
        <rect x="30" y="86" width="40" height="14" fill="none" stroke="var(--line)" />
      </svg>
      {onPitch.map((name, i) => {
        const slot = f.slots[i] ?? { x: 50, y: 50, pos: "MF" as const };
        const p = byName.get(name);
        const stamina = midStates[name]?.stamina ?? 100;
        const tier = staminaTier(stamina);
        const inc = broughtOn.has(name);
        const sel = selectedOff === name;
        return (
          <button
            key={`${name}-${i}`}
            type="button"
            className={`pitch__player lmc-pp ${sel ? "sel" : ""} ${inc ? "inc" : ""}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            disabled={inc}
            onClick={() => onPick(name)}
            title={inc ? `${name} (just came on)` : `Take off ${name}`}
          >
            <span className="pitch__avatar-wrap">
              <span className="pitch__dot" style={{ borderColor: RING[p?.group ?? "MF"] ?? "var(--steel)" }}>
                <svg className="pitch__sil" viewBox="0 0 40 40" aria-hidden>
                  <circle cx="20" cy="15.5" r="7" fill="rgba(246,244,239,0.86)" />
                  <path d="M7 39 a13 13 0 0 1 26 0 Z" fill="rgba(246,244,239,0.86)" />
                </svg>
              </span>
              <em className="lmc-pp__ovr">{ovr(p?.ability ?? 0.5)}</em>
            </span>
            <span className="pitch__stamina" aria-label={`stamina ${Math.round(stamina)}`}>
              <span className={`pitch__stamina-fill tier-${tier}`} style={{ width: `${stamina}%` }} />
            </span>
            <span className="pitch__name">{lastName(name)}</span>
          </button>
        );
      })}
    </div>
  );
}

function BenchChip({
  name,
  pos,
  rating,
  stamina,
  disabled,
  onClick,
}: {
  name: string;
  pos: string;
  rating: number;
  stamina: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const tier = staminaTier(stamina);
  return (
    <button type="button" className="lmc-bchip" disabled={disabled} onClick={onClick} title={name}>
      <span className="lmc-bchip__ovr">{rating}</span>
      <span className="lmc-bchip__body">
        <span className="lmc-bchip__name">{lastName(name)}</span>
        <span className="lmc-bchip__pos mono">{pos}</span>
      </span>
      <span className="lmc-bchip__dot" style={{ background: TIER_COLOR[tier] }} aria-hidden />
    </button>
  );
}

interface Insight {
  text: string;
  tone: "good" | "bad" | "neutral";
}

/** Translate the live matchup, the scoreline and fatigue into a manager's read. */
function buildInsights(
  myAtk: number,
  myDef: number,
  oppAtk: number,
  oppDef: number,
  myGoals: number,
  oppGoals: number,
  tired: number,
): Insight[] {
  const out: Insight[] = [];
  if (myAtk - oppDef > 0.12) out.push({ tone: "good", text: `Your attack (${myAtk.toFixed(2)}) is getting at their back line (${oppDef.toFixed(2)}). Keep coming.` });
  else if (oppAtk - myDef > 0.12) out.push({ tone: "bad", text: `Their attack (${oppAtk.toFixed(2)}) is outgunning your defence (${myDef.toFixed(2)}). Shore it up.` });
  else out.push({ tone: "neutral", text: `Tight game: your ${myAtk.toFixed(2)} attack against their ${oppDef.toFixed(2)} defence.` });

  if (myGoals < oppGoals) out.push({ tone: "bad", text: `Behind by ${oppGoals - myGoals}. You need more bodies forward to rescue it.` });
  else if (myGoals > oppGoals) out.push({ tone: "good", text: `${myGoals - oppGoals} to the good. Tighten up and it is yours.` });
  else out.push({ tone: "neutral", text: `All square. One decisive change could settle it.` });

  if (tired >= 2) out.push({ tone: "bad", text: `${tired} players are running on empty. Fresh legs would lift the press.` });
  return out;
}

function Readout({ label, value, delta }: { label: string; value: number; delta: number }) {
  const color = delta >= 0.005 ? "var(--mex-green)" : delta <= -0.005 ? "var(--fifa-red)" : "var(--text-faint)";
  return (
    <div className="lmc-ro">
      <span className="lmc-ro__label mono">{label}</span>
      <span className="lmc-ro__val anton">{value.toFixed(2)}</span>
      <span className="lmc-ro__delta mono" style={{ color }}>
        {delta >= 0 ? "+" : ""}
        {delta.toFixed(2)}
      </span>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  read,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  read: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="manage-slider">
      <span className="mono">
        {label} <em>{read}</em>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function goalText(player: string, assist: string | undefined, kind: string | undefined, team: string): string {
  if (kind === "own") return `Own goal! ${player} turns it into his own net, it counts for ${team}.`;
  if (kind === "penalty") return `GOAL! ${player} steps up and buries the penalty for ${team}.`;
  const lead = `GOAL! ${player} finds the net for ${team}`;
  return assist ? `${lead}, teed up by ${assist}.` : `${lead}.`;
}

function buildFeed(
  live: NonNullable<CareerState["live"]>,
  clock: number,
  ftReached: boolean,
  atHalftime: boolean,
): FeedItem[] {
  const items: FeedItem[] = [{ minute: 0, kind: "period", text: "Kick-off, we are under way." }];
  for (const g of live.goals) {
    if (g.minute > clock) continue;
    items.push({ minute: g.minute, kind: "goal", side: g.side, text: goalText(g.player, g.assist, g.kind, g.team) });
  }
  for (const s of live.subs as LiveSub[]) {
    if (s.minute > clock) continue;
    items.push({ minute: s.minute, kind: "sub", side: live.managedSide, text: `Substitution: ${s.on} on for ${s.off}.` });
  }
  if (clock >= 45) items.push({ minute: 45, kind: "period", text: atHalftime ? "Half-time." : "Half-time whistle." });
  if (live.afterExtraTime && clock >= 90) items.push({ minute: 90, kind: "period", text: "Level after 90, into extra time." });
  if (ftReached) {
    items.push({ minute: live.endClock, kind: "period", text: "Full-time." });
    if (live.shootout) {
      items.push({
        minute: live.endClock,
        kind: "period",
        text: `Penalty shootout: ${live.home} ${live.shootout.home}–${live.shootout.away} ${live.away}. ${live.winner} go through.`,
      });
    }
  }
  return items.sort((a, b) => b.minute - a.minute || rank(b) - rank(a));
}

function rank(f: FeedItem): number {
  return f.kind === "goal" ? 2 : f.kind === "sub" ? 1 : 0;
}
