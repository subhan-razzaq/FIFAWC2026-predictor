// The Live Match Center: a managed game played out minute by minute. The clock
// ticks, goals drop onto a commentary feed as they happen, and the manager can
// stop play at ANY moment (not only half-time) to open a tactical board: a visual
// XI you sub from by tapping, quick approach presets, a shape switch and a live
// attack/defence read-out. On resume, the rest of the half is re-simulated with
// those exact choices, so every change genuinely bites.

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { arrangeEleven, hashSeed, type Model, type SquadPlayer } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import type { CareerState, LiveSub } from "../../store/store";
import { MAX_SUBS } from "../../store/store";
import { TeamBadge } from "../../components/TeamBadge";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { BallIcon, CardIcon, SubIcon } from "../../components/icons";
import { FORMATIONS, managedRatings, ovr } from "../../lib/manage";
import { liveRatings, ratingColor as liveRatingColor, type LiveRating } from "../../lib/liveRatings";
import { mentalityLabel, pacingLabel, pressingLabel, type Tactics } from "../../lib/tactics";
import { isAvailable, type PlayerStates } from "../../lib/cards";
import { depleteStamina, staminaTier } from "../../lib/fatigue";

const BASE_TICK_MS = 240; // real ms per match-minute at 1x (a calmer default pace)
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

// forwards first: managers reach for an attacker when chasing a game
const POS_ORDER = ["FW", "MF", "DF", "GK"] as const;
const POS_LABEL: Record<string, string> = {
  GK: "Goalkeepers",
  DF: "Defenders",
  MF: "Midfielders",
  FW: "Forwards",
};

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

// signature of the manager's setup, so resuming only re-simulates the rest of the
// half when something genuinely changed (no free re-rolls on a peek).
function setupSig(l: NonNullable<CareerState["live"]>): string {
  return `${l.subs.map((s) => s.on).join(",")}|${l.formation}|${l.tactics.mentality},${l.tactics.pressing},${l.tactics.pacing}`;
}

interface FeedItem {
  minute: number;
  kind: "period" | "goal" | "sub" | "card" | "commentary" | "pen";
  side?: "home" | "away";
  // tie-break ordering within the same minute (used for the shootout sequence)
  order?: number;
  // goal payload
  scorer?: string;
  assist?: string;
  goalKind?: "open" | "penalty" | "own";
  // sub payload
  on?: string;
  off?: string;
  // card payload
  player?: string;
  cardType?: "yellow" | "red";
  // period label / commentary line
  text?: string;
  // a descriptive commentary line for a goal or a card
  note?: string;
  // penalty shootout payload
  pen?: { taker: string; scored: boolean; tally: string };
}

// Small monochrome control glyphs (currentColor), drawn rather than emoji so the
// toolbar reads the same on the gold primary and the ghost buttons.
function PlayGlyph() {
  return (
    <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden focusable="false">
      <path d="M0 0 L9 5.5 L0 11 Z" fill="currentColor" />
    </svg>
  );
}
function PauseGlyph() {
  return (
    <svg width="8" height="11" viewBox="0 0 8 11" aria-hidden focusable="false">
      <rect x="0" width="2.6" height="11" fill="currentColor" />
      <rect x="5.4" width="2.6" height="11" fill="currentColor" />
    </svg>
  );
}
function SwapGlyph() {
  return (
    <svg width="13" height="12" viewBox="0 0 13 12" aria-hidden focusable="false">
      <path d="M3.4 0 L6 3 H4.3 V9.2 H2.5 V3 H0.8 Z" fill="currentColor" />
      <path d="M9.6 12 L7 9 H8.7 V2.8 H10.5 V9 H12.2 Z" fill="currentColor" />
    </svg>
  );
}
function ChevronGlyph() {
  return (
    <svg width="6" height="9" viewBox="0 0 6 9" aria-hidden focusable="false">
      <path d="M0.6 0.6 L5 4.5 L0.6 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
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
  const [flash, setFlash] = useState<{ side: "home" | "away"; text: string; kind: "goal" | "yellow" | "red" } | null>(null);
  const minuteRef = useRef(0);
  const prevGoalsRef = useRef(0);
  const prevCardsRef = useRef(0);
  const snapRef = useRef("");

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
      setFlash({ side: last.side ?? "home", text: last.player, kind: "goal" });
      const id = window.setTimeout(() => setFlash(null), 1500);
      prevGoalsRef.current = total;
      return () => window.clearTimeout(id);
    }
    prevGoalsRef.current = total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // bookings flash onto the board the same way goals do, as the clock reaches them
  const revealedCards = live ? live.cards.filter((c) => c.minute <= clock) : [];
  useEffect(() => {
    if (!live) return;
    if (revealedCards.length > prevCardsRef.current && revealedCards.length > 0) {
      const last = revealedCards.reduce((a, b) => (b.minute >= a.minute ? b : a), revealedCards[0]!);
      setFlash({ side: last.side ?? "home", text: last.player, kind: last.type === "red" ? "red" : "yellow" });
      const id = window.setTimeout(() => setFlash(null), 1400);
      prevCardsRef.current = revealedCards.length;
      return () => window.clearTimeout(id);
    }
    prevCardsRef.current = revealedCards.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCards.length]);

  // keyboard shortcuts during live play: Space pauses, S opens the board, 1/2/4 set
  // the speed. Ignored while typing in a control or once the board/full-time is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (phase !== "live" || ftReached) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!adjusting) setPlaying((p) => !p);
      } else if (e.key === "s" || e.key === "S") {
        if (!adjusting && live && clock < 90) {
          snapRef.current = setupSig(live);
          setPlaying(false);
          setAdjusting(true);
        }
      } else if (e.key === "1") setSpeed(1);
      else if (e.key === "2") setSpeed(2);
      else if (e.key === "4") setSpeed(4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, ftReached, adjusting, clock, live]);

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
  const feed = buildFeed(live, clock, ftReached);

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
          <div className="lmc__transport">
            <button
              className="btn btn--ghost lmc__ctrl"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause the match" : "Resume the match"}
            >
              {playing ? <PauseGlyph /> : <PlayGlyph />}
              {playing ? "Pause" : "Resume"}
            </button>
            <div className="lmc__speedbox">
              <span className="lmc__ctrl-label mono">Speed</span>
              <div className="lmc__speeds" role="group" aria-label="Playback speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    className={`group-tab ${speed === s ? "active" : ""}`}
                    style={{ width: "auto", padding: "0 11px" }}
                    onClick={() => setSpeed(s)}
                    aria-pressed={speed === s}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <button
              className="btn btn--ghost lmc__ctrl"
              onClick={skipFor(half, segEnd, minuteRef, setClock, setPlaying, goToHalftime, setFtReached)}
            >
              {half === 1 ? "Skip to half-time" : "Skip to full-time"}
              <ChevronGlyph />
            </button>
            <span className="lmc__kbd mono" aria-hidden>
              Space pause · S subs
            </span>
          </div>
          <button
            className="btn lmc__adjust"
            onClick={openAdjust}
            disabled={!canAdjust}
            title={canAdjust ? "Pause the match and open the tactical board" : "Changes reopen after extra time kicks off"}
          >
            <SwapGlyph />
            Subs &amp; tactics
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
              title={phase === "halftime" ? "Half-time team talk" : `${clock}′ · Subs & tactics`}
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
                Full-time · see the result →
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
  flash: { side: "home" | "away"; text: string; kind: "goal" | "yellow" | "red" } | null;
}) {
  const goals = live.goals.filter((g) => g.minute <= clock);
  const homeScorers = goals.filter((g) => g.side === "home");
  const awayScorers = goals.filter((g) => g.side === "away");
  const pct = Math.max(0, Math.min(100, (clock / (live.endClock || 90)) * 100));

  return (
    <div className="lmc__board flat-card">
      <div className="lmc__side">
        <TeamBadge team={live.home} group={groupOf.get(live.home)} size={34} />
        <div className="lmc__ident">
          <span className="lmc__team anton">{live.home}</span>
          <ScorerList goals={homeScorers} side="home" />
        </div>
      </div>
      <div className="lmc__center">
        <motion.div key={`${homeScore}-${awayScore}`} className="lmc__score anton" initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 16 }}>
          {homeScore}<span className="lmc__colon">:</span>{awayScore}
        </motion.div>
        <div className="lmc__clock mono">{clock}&prime;</div>
        <div className="lmc__phase eyebrow">{phaseLabel}</div>
      </div>
      <div className="lmc__side lmc__side--away">
        <div className="lmc__ident lmc__ident--away">
          <span className="lmc__team anton">{live.away}</span>
          <ScorerList goals={awayScorers} side="away" />
        </div>
        <TeamBadge team={live.away} group={groupOf.get(live.away)} size={34} />
      </div>

      <div className="lmc__progress" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.text + flash.side + flash.kind}
            className={`lmc__flash lmc__flash--${flash.kind} ${flash.side === "home" ? "left" : "right"}`}
            initial={{ opacity: 0, scale: 0.6, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 360, damping: 18 }}
          >
            {flash.kind === "goal" ? <BallIcon size={15} /> : <CardIcon kind={flash.kind} size={16} />}
            <span className="lmc__flash-word anton">
              {flash.kind === "goal" ? "Goal" : flash.kind === "red" ? "Red card" : "Booked"}
            </span>
            <span className="lmc__flash-who mono">{flash.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Goalscorers listed under each team, the way a broadcast lower-third reads them.
function ScorerList({ goals, side }: { goals: NonNullable<CareerState["live"]>["goals"]; side: "home" | "away" }) {
  if (goals.length === 0) return null;
  return (
    <ul className={`lmc__scorers ${side === "away" ? "is-away" : ""}`}>
      {goals.map((g, i) => {
        const tag = g.kind === "penalty" ? " (P)" : g.kind === "own" ? " (OG)" : "";
        return (
          <li key={`${g.player}-${g.minute}-${i}`} className="lmc__scorer">
            <BallIcon size={9} />
            <span className="lmc__scorer-name">{lastName(g.player)}{tag}</span>
            <span className="lmc__scorer-min mono">{g.minute}&prime;</span>
          </li>
        );
      })}
    </ul>
  );
}

function CommentaryFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="lmc__feed">
      {feed.length === 0 ? (
        <div className="lmc__feed-empty mono">Kick-off coming up, the match is about to start…</div>
      ) : (
        <AnimatePresence initial={false}>
          {feed.map((f) => {
            const key = `${f.minute}-${f.kind}-${f.order ?? ""}-${f.scorer ?? f.player ?? f.on ?? f.pen?.taker ?? f.text ?? ""}`;
            if (f.kind === "period" || f.kind === "commentary") {
              return (
                <motion.div
                  key={key}
                  layout
                  className={`lmc__ev ${f.kind === "commentary" ? "lmc__ev--commentary" : "lmc__ev--period"}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                >
                  <span className="lmc__ev-min mono">{f.minute}&prime;</span>
                  <span className="lmc__ev-period-label">{f.text}</span>
                </motion.div>
              );
            }
            if (f.kind === "pen" && f.pen) {
              const fromLeft = f.side === "home";
              return (
                <motion.div
                  key={key}
                  layout
                  className={`lmc__ev lmc__ev--pen is-${f.side}`}
                  initial={{ opacity: 0, x: fromLeft ? -12 : 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="lmc__ev-cell lmc__ev-cell--home">
                    {f.side === "home" && <PenContent f={f} side="home" />}
                  </span>
                  <span className="lmc__ev-min mono">{f.pen.tally}</span>
                  <span className="lmc__ev-cell lmc__ev-cell--away">
                    {f.side === "away" && <PenContent f={f} side="away" />}
                  </span>
                </motion.div>
              );
            }
            const fromLeft = f.side === "home";
            return (
              <motion.div
                key={key}
                layout
                className={`lmc__ev-wrap is-${f.side}`}
                initial={{ opacity: 0, x: fromLeft ? -12 : 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={`lmc__ev lmc__ev--${f.kind} is-${f.side}`}>
                  <span className="lmc__ev-cell lmc__ev-cell--home">
                    {f.side === "home" && <EventContent f={f} side="home" />}
                  </span>
                  <span className="lmc__ev-min mono">{f.minute}&prime;</span>
                  <span className="lmc__ev-cell lmc__ev-cell--away">
                    {f.side === "away" && <EventContent f={f} side="away" />}
                  </span>
                </div>
                {f.note && <div className="lmc__ev-note">{f.note}</div>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}

// One commentary entry, mirrored so the icon always sits toward the centre line.
function EventContent({ f, side }: { f: FeedItem; side: "home" | "away" }) {
  let body: JSX.Element;
  let icon: JSX.Element;
  if (f.kind === "goal") {
    const tag = f.goalKind === "penalty" ? " (pen)" : f.goalKind === "own" ? " (o.g.)" : "";
    body = (
      <span className="lmc__ev-txt">
        <span className="lmc__ev-name">
          {f.scorer}
          {tag}
        </span>
        {f.assist && <span className="lmc__ev-assist">{f.assist}</span>}
      </span>
    );
    icon = (
      <span className="lmc__ev-ic lmc__ev-ic--goal">
        <BallIcon size={14} />
      </span>
    );
  } else if (f.kind === "card") {
    body = (
      <span className="lmc__ev-txt">
        <span className="lmc__ev-name">{f.player}</span>
        <span className="lmc__ev-assist">{f.cardType === "red" ? "Sent off" : "Booked"}</span>
      </span>
    );
    icon = (
      <span className="lmc__ev-ic">
        <CardIcon kind={f.cardType ?? "yellow"} size={15} />
      </span>
    );
  } else {
    body = (
      <span className="lmc__ev-txt">
        <span className="lmc__ev-name lmc__ev-on">{f.on}</span>
        <span className="lmc__ev-assist">{f.off}</span>
      </span>
    );
    icon = (
      <span className="lmc__ev-ic">
        <SubIcon size={13} />
      </span>
    );
  }
  return side === "home" ? (
    <>
      {body}
      {icon}
    </>
  ) : (
    <>
      {icon}
      {body}
    </>
  );
}

// One penalty in a shootout: the taker, and whether it was scored or saved.
function PenContent({ f, side }: { f: FeedItem; side: "home" | "away" }) {
  const scored = f.pen?.scored;
  const body = (
    <span className="lmc__ev-txt">
      <span className="lmc__ev-name">{f.pen ? lastName(f.pen.taker) : ""}</span>
      <span className={`lmc__ev-assist ${scored ? "pen-scored" : "pen-missed"}`}>{scored ? "Scored" : "Saved"}</span>
    </span>
  );
  const icon = <span className={`lmc__ev-ic lmc__pen-ic ${scored ? "is-scored" : "is-missed"}`}>{scored ? "●" : "○"}</span>;
  return side === "home" ? (
    <>
      {body}
      {icon}
    </>
  ) : (
    <>
      {icon}
      {body}
    </>
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

  // bench split by line (GK / DF / MF / FW), best first within each, so a manager
  // reads it like a real team sheet rather than one long list.
  const benchByPos = useMemo(() => {
    const groups: Record<string, SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
    for (const p of squad.players) {
      if (live.start.eleven.includes(p.name) || broughtOn.has(p.name) || !isAvailable(career.playerStates, p.name)) continue;
      (groups[p.group] ?? groups.MF!).push(p);
    }
    for (const k of POS_ORDER) groups[k]!.sort((a, b) => b.ability - a.ability);
    return groups;
  }, [squad, live.start.eleven, broughtOn, career.playerStates]);
  const benchCount = POS_ORDER.reduce((n, k) => n + benchByPos[k]!.length, 0);

  const subsLeft = MAX_SUBS - live.subs.length;
  // the starter picked to come off, used to read each replacement as an upgrade,
  // a downgrade, or an out-of-position gamble.
  const offPlayer = selectedOff ? byName.get(selectedOff) : undefined;
  const offOvr = offPlayer ? ovr(offPlayer.ability) : null;
  const base = model.teams.find((x) => x.name === team)!;
  const r = managedRatings(model, team, onPitch, live.formation, t, midStates);
  const dAtk = r.atk - base.atk;
  const dDef = r.def - base.def;
  const tiredCount = onPitch.filter((n) => (midStates[n]?.stamina ?? 100) < 50).length;

  // half-time read: how the matchup, the scoreline and fatigue actually stack up.
  // Score is taken as it stands at this minute, never the full-time total, so
  // pausing early never spoils goals the clock has not reached yet.
  const oppTeam = model.teams.find((x) => x.name === live.info.opponent);
  const homeAt = live.goals.filter((g) => g.side === "home" && g.minute <= minute).length;
  const awayAt = live.goals.filter((g) => g.side === "away" && g.minute <= minute).length;
  const myGoals = live.managedSide === "home" ? homeAt : awayAt;
  const oppGoals = live.managedSide === "home" ? awayAt : homeAt;
  const tips = buildInsights(r.atk, r.def, oppTeam?.atk ?? 1, oppTeam?.def ?? 1, myGoals, oppGoals, tiredCount);

  // live, in-running player ratings so the manager can spot who is struggling
  const ratings = useMemo(
    () =>
      liveRatings({
        eleven: onPitch,
        byName,
        goals: live.goals.filter((g) => g.minute <= minute),
        cards: live.cards.filter((c) => c.side === live.managedSide && c.minute <= minute),
        team,
        teamGoals: myGoals,
        oppGoals,
        clock: minute,
      }),
    [onPitch, byName, live.goals, live.cards, live.managedSide, team, myGoals, oppGoals, minute],
  );

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
            {live.home} {homeAt} – {awayAt} {live.away}
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
            <span className="eyebrow">{selectedOff ? "Now pick who comes on ▸" : "Your XI · tap a player to take off"}</span>
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
            ratings={ratings}
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
            {benchCount === 0 ? (
              <div className="mono lmc__note">No players available.</div>
            ) : (
              POS_ORDER.map((pos) => {
                const players = benchByPos[pos]!;
                if (players.length === 0) return null;
                const match = !!offPlayer && offPlayer.group === pos;
                return (
                  <div key={pos} className="lmc__bench-group">
                    <div className="lmc__bench-pos">
                      <span>{POS_LABEL[pos]}</span>
                      {match && <span className="lmc__bench-like mono">like-for-like</span>}
                    </div>
                    {players.map((p) => {
                      let subtitle = p.club;
                      let tone: "" | "up" | "down" | "warn" = "";
                      if (offPlayer && offOvr != null) {
                        if (offPlayer.group !== p.group) {
                          subtitle = "Out of position";
                          tone = "warn";
                        } else {
                          const d = ovr(p.ability) - offOvr;
                          subtitle = d > 0 ? `+${d} rating` : d < 0 ? `${d} rating` : "Like for like";
                          tone = d > 0 ? "up" : d < 0 ? "down" : "";
                        }
                      }
                      return (
                        <BenchChip
                          key={p.name}
                          name={p.name}
                          photo={p.photo}
                          subtitle={subtitle}
                          tone={tone}
                          rating={ovr(p.ability)}
                          stamina={career.playerStates[p.name]?.stamina ?? 100}
                          disabled={!selectedOff || subsLeft <= 0}
                          onClick={() => pickOn(p.name)}
                        />
                      );
                    })}
                  </div>
                );
              })
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
  ratings,
}: {
  onPitch: string[];
  formation: string;
  byName: Map<string, { group: string; number?: number; ability: number; photo?: string | null }>;
  midStates: PlayerStates;
  broughtOn: Set<string>;
  selectedOff: string | null;
  onPick: (name: string) => void;
  ratings: Map<string, LiveRating>;
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
        const lr = ratings.get(name);
        return (
          <button
            key={`${name}-${i}`}
            type="button"
            className={`pitch__player lmc-pp ${sel ? "sel" : ""} ${inc ? "inc" : ""}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            disabled={inc}
            onClick={() => onPick(name)}
            title={inc ? `${name} (just came on)` : `Take off ${name}${lr ? ` · rating ${lr.rating.toFixed(1)}` : ""}`}
          >
            <span className="pitch__avatar-wrap">
              <span className="pitch__dot" style={{ borderColor: RING[p?.group ?? "MF"] ?? "var(--steel)" }}>
                <PlayerAvatar photo={p?.photo} name={name} />
              </span>
              <em className="lmc-pp__ovr">{ovr(p?.ability ?? 0.5)}</em>
              {lr && (
                <em className="lmc-pp__rating mono" style={{ background: liveRatingColor(lr.rating) }}>
                  {lr.rating.toFixed(1)}
                </em>
              )}
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
  photo,
  subtitle,
  tone,
  rating,
  stamina,
  disabled,
  onClick,
}: {
  name: string;
  photo?: string | null;
  subtitle: string;
  tone: "" | "up" | "down" | "warn";
  rating: number;
  stamina: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const tier = staminaTier(stamina);
  return (
    <button type="button" className="lmc-bchip" disabled={disabled} onClick={onClick} title={name}>
      <span className="lmc-bchip__face">
        <PlayerAvatar photo={photo} name={name} />
      </span>
      <span className="lmc-bchip__ovr">{rating}</span>
      <span className="lmc-bchip__body">
        <span className="lmc-bchip__name">{lastName(name)}</span>
        <span className={`lmc-bchip__sub ${tone}`}>{subtitle}</span>
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

function buildFeed(
  live: NonNullable<CareerState["live"]>,
  clock: number,
  ftReached: boolean,
): FeedItem[] {
  const items: FeedItem[] = [{ minute: 0, kind: "period", text: "Kick-off" }];
  for (const g of live.goals) {
    if (g.minute > clock) continue;
    const goalKind = g.kind === "own" ? "own" : g.kind === "penalty" ? "penalty" : "open";
    items.push({
      minute: g.minute,
      kind: "goal",
      side: g.side,
      scorer: g.player,
      assist: g.assist,
      goalKind,
      note: goalNote(live, g.player, g.assist, goalKind, g.minute),
    });
  }
  for (const s of live.subs as LiveSub[]) {
    if (s.minute > clock) continue;
    items.push({ minute: s.minute, kind: "sub", side: live.managedSide, on: s.on, off: s.off });
  }
  for (const cd of live.cards) {
    if (cd.minute > clock) continue;
    const cardType = cd.type === "red" ? "red" : "yellow";
    items.push({
      minute: cd.minute,
      kind: "card",
      side: cd.side,
      player: cd.player,
      cardType,
      note: cardNote(live, cd.player, cardType, cd.minute),
    });
  }
  for (const c of liveCommentary(live, clock)) items.push(c);
  if (clock >= 45) items.push({ minute: 45, kind: "period", text: "Half-time" });
  if (live.afterExtraTime && clock >= 90) items.push({ minute: 90, kind: "period", text: "Into extra time" });
  if (ftReached) {
    items.push({ minute: live.endClock, kind: "period", text: "Full-time" });
    // a shootout is played out kick by kick once full time is reached
    if (live.shootout) {
      items.push({ minute: live.endClock, kind: "period", text: "Penalty shootout" });
      for (const p of shootoutFeed(live)) items.push(p);
      items.push({ minute: live.endClock, kind: "period", text: `${live.winner} win the shootout ${live.shootout.home}-${live.shootout.away}` });
    }
  }
  return items.sort((a, b) => b.minute - a.minute || rank(b) - rank(a) || (b.order ?? 0) - (a.order ?? 0));
}

function rank(f: FeedItem): number {
  return f.kind === "goal" ? 4 : f.kind === "card" ? 3 : f.kind === "pen" ? 3 : f.kind === "sub" ? 2 : f.kind === "commentary" ? 1 : 0;
}

// --- descriptive commentary lines (deterministic from the event identity) -----

const GOAL_LINES = [
  "buries it low into the corner, the keeper had no chance.",
  "rifles it home from the edge of the box.",
  "rises highest to power a header past the keeper.",
  "slots it coolly past the goalkeeper.",
  "smashes it into the roof of the net.",
  "turns and fires it into the bottom corner.",
  "finishes off a flowing move in style.",
  "steals in at the back post to tap it home.",
];
const PEN_GOAL_LINES = ["sends the keeper the wrong way from the spot.", "tucks the penalty away with no fuss.", "blasts the penalty straight down the middle."];
const OWN_GOAL_LINES = ["turns it into his own net under pressure.", "deflects it past his own keeper, agonising."];
const YELLOW_LINES = ["goes into the book for a cynical challenge.", "is booked for a late, clumsy tackle.", "picks up a yellow for dissent.", "is cautioned for a tactical foul."];
const RED_LINES = ["is sent off, down to ten men now.", "sees red and it changes everything.", "gets his marching orders after a reckless lunge.", "is shown a straight red, the bench is furious."];

function pickLine(arr: string[], live: NonNullable<CareerState["live"]>, salt: string): string {
  const idx = hashSeed(`${live.home}|${live.away}|${live.resimCount}|${salt}`) % arr.length;
  return arr[idx]!;
}

function goalNote(live: NonNullable<CareerState["live"]>, scorer: string, assist: string | undefined, kind: "open" | "penalty" | "own", minute: number): string {
  const who = lastName(scorer);
  if (kind === "own") return `${who} ${pickLine(OWN_GOAL_LINES, live, `og${minute}`)}`;
  if (kind === "penalty") return `${who} ${pickLine(PEN_GOAL_LINES, live, `pen${minute}`)}`;
  const line = pickLine(GOAL_LINES, live, `g${minute}${scorer}`);
  return assist ? `${who} ${line} Set up by ${lastName(assist)}.` : `${who} ${line}`;
}

function cardNote(live: NonNullable<CareerState["live"]>, player: string, type: "yellow" | "red", minute: number): string {
  const who = lastName(player);
  return `${who} ${pickLine(type === "red" ? RED_LINES : YELLOW_LINES, live, `${type}${minute}${player}`)}`;
}

// --- penalty shootout, played kick by kick ------------------------------------

/** Reconstruct a plausible, deterministic kick-by-kick shootout that ends on the
 * recorded final tally, so the feed walks through every penalty. */
function shootoutFeed(live: NonNullable<CareerState["live"]>): FeedItem[] {
  const out: FeedItem[] = [];
  if (!live.shootout) return out;
  const homeSeq = makeSequence(live, "home", live.shootout.home);
  const awaySeq = makeSequence(live, "away", live.shootout.away);
  // our own takers are known; for the opponent we name the kicks by team
  const ourSide = live.managedSide;
  const ourTakers = live.start.eleven;
  let h = 0;
  let a = 0;
  const rounds = Math.max(homeSeq.length, awaySeq.length);
  let order = 0; // later kicks get a higher order so they sort to the top within the minute
  const endClock = live.endClock;
  const takerName = (side: "home" | "away", idx: number): string => {
    if (side === ourSide && ourTakers.length) return ourTakers[(ourTakers.length - 1 - (idx % ourTakers.length))]!;
    return side === "home" ? live.home : live.away;
  };
  for (let i = 0; i < rounds; i++) {
    if (i < homeSeq.length) {
      const scored = homeSeq[i]!;
      if (scored) h += 1;
      out.push({ minute: endClock, kind: "pen", side: "home", order: ++order, pen: { taker: takerName("home", i), scored, tally: `${h}-${a}` } });
    }
    if (i < awaySeq.length) {
      const scored = awaySeq[i]!;
      if (scored) a += 1;
      out.push({ minute: endClock, kind: "pen", side: "away", order: ++order, pen: { taker: takerName("away", i), scored, tally: `${h}-${a}` } });
    }
  }
  return out;
}

/** A deterministic make/miss sequence that converts exactly `made` of its kicks,
 * padded with a save or two so the shootout reads realistically. */
function makeSequence(live: NonNullable<CareerState["live"]>, side: "home" | "away", made: number): boolean[] {
  const misses = hashSeed(`pens|${live.home}|${live.away}|${side}|${live.resimCount}`) % 2;
  const seq: boolean[] = [];
  for (let i = 0; i < made; i++) seq.push(true);
  for (let i = 0; i < misses; i++) seq.push(false);
  if (misses > 0 && seq.length > 2) {
    const pos = 1 + (hashSeed(`pos|${side}|${live.resimCount}`) % (seq.length - 1));
    seq.splice(pos, 0, seq.pop()!);
  }
  return seq;
}

const ATMOSPHERE = [
  "End to end stuff here, the crowd are loving it.",
  "A lull in the play as both sides catch their breath.",
  "Good pressure now, the manager is up off the bench.",
  "Half a chance there, flashed across the face of goal.",
  "The keeper claims it confidently under pressure.",
  "Patient build-up, probing for an opening.",
  "A crunching tackle wins it back and the fans roar.",
  "Tempo rising as the hour mark approaches.",
  "A free-kick in a dangerous area, bodies in the box.",
  "Sloppy in possession there, almost punished.",
  "The bench is shouting instructions, push them higher.",
  "A booming clearance and the move breaks down.",
];

/** Deterministic atmosphere lines sprinkled through the half, so the feed keeps
 * ticking between the real events. Seeded off the match and re-sim count so a
 * replay reads the same. Lines that would collide with a goal minute are skipped. */
function liveCommentary(live: NonNullable<CareerState["live"]>, clock: number): FeedItem[] {
  const out: FeedItem[] = [];
  const segStart = live.half === 2 ? 45 : 0;
  const goalMins = new Set(live.goals.map((g) => g.minute));
  const seed = hashSeed(`commentary|${live.home}|${live.away}|${live.half}|${live.resimCount}`);
  for (let m = segStart + 6; m <= Math.min(clock, live.endClock - 2); m += 8) {
    if (goalMins.has(m) || goalMins.has(m - 1) || goalMins.has(m + 1)) continue;
    const idx = hashSeed(`${seed}|${m}`) % ATMOSPHERE.length;
    out.push({ minute: m, kind: "commentary", text: ATMOSPHERE[idx] });
  }
  return out;
}
