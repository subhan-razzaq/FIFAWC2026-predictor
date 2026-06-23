// The Live Match Center: a managed game played out minute by minute rather than
// revealed all at once. The clock ticks, goals drop onto a commentary feed as
// they happen, and at half-time the match pauses on a full tactical board — a
// visual XI you sub from by tapping, quick mentality presets, a shape switch and
// a live attack/defence read-out — before the second half is simulated with those
// exact choices.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { arrangeEleven, type Model } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import type { CareerState, LiveSub } from "../../store/store";
import { MAX_HALFTIME_SUBS } from "../../store/store";
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

  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [ftReached, setFtReached] = useState(false);
  const minuteRef = useRef(0);

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
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, half]);

  // run the clock
  useEffect(() => {
    if (phase !== "live" || !playing) return;
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
  }, [phase, half, playing, speed]);

  const skip = () => {
    minuteRef.current = segEnd;
    setClock(segEnd);
    setPlaying(false);
    if (half === 1) goToHalftime();
    else setFtReached(true);
  };

  if (!live) return null;

  const revealed = live.goals.filter((g) => g.minute <= clock);
  const homeScore = revealed.filter((g) => g.side === "home").length;
  const awayScore = revealed.filter((g) => g.side === "away").length;
  const phaseLabel =
    phase === "halftime"
      ? "Half-time"
      : ftReached
        ? "Full-time"
        : clock >= 90
          ? "Extra time"
          : half === 1
            ? "First half"
            : "Second half";

  const feed = buildFeed(live, clock, ftReached, phase === "halftime");

  return (
    <div className="lmc">
      <Scoreboard
        live={live}
        groupOf={groupOf}
        homeScore={homeScore}
        awayScore={awayScore}
        clock={Math.min(clock, endClock)}
        phaseLabel={phaseLabel}
      />

      {phase === "live" && !ftReached && (
        <div className="lmc__controls">
          <button className="btn btn--ghost" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Resume"}
          </button>
          <div className="lmc__speeds">
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
          <button className="btn btn--ghost" onClick={skip}>
            {half === 1 ? "Skip to half-time" : "Skip to full-time"}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {phase === "halftime" ? (
          <motion.div
            key="halftime"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28 }}
          >
            <HalftimePanel model={model} career={career} live={live} />
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

function Scoreboard({
  live,
  groupOf,
  homeScore,
  awayScore,
  clock,
  phaseLabel,
}: {
  live: NonNullable<CareerState["live"]>;
  groupOf: Map<string, string>;
  homeScore: number;
  awayScore: number;
  clock: number;
  phaseLabel: string;
}) {
  return (
    <div className="lmc__board flat-card">
      <div className="lmc__side">
        <TeamBadge team={live.home} group={groupOf.get(live.home)} size={34} />
        <span className="lmc__team anton">{live.home}</span>
      </div>
      <div className="lmc__center">
        <motion.div key={`${homeScore}-${awayScore}`} className="lmc__score anton" initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
          {homeScore}<span className="lmc__colon">:</span>{awayScore}
        </motion.div>
        <div className="lmc__clock mono">{clock}&prime;</div>
        <div className="lmc__phase eyebrow">{phaseLabel}</div>
      </div>
      <div className="lmc__side lmc__side--away">
        <span className="lmc__team anton">{live.away}</span>
        <TeamBadge team={live.away} group={groupOf.get(live.away)} size={34} />
      </div>
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

// --- half-time tactical board ------------------------------------------------

function HalftimePanel({
  model,
  career,
  live,
}: {
  model: Model;
  career: CareerState;
  live: NonNullable<CareerState["live"]>;
}) {
  const halftimeSub = useStore((s) => s.halftimeSub);
  const undoHalftimeSub = useStore((s) => s.undoHalftimeSub);
  const setHalftimeTactics = useStore((s) => s.setHalftimeTactics);
  const setHalftimeFormation = useStore((s) => s.setHalftimeFormation);
  const resumeSecondHalf = useStore((s) => s.resumeSecondHalf);

  const team = career.team;
  const squad = model.squads[team]!;
  const [selectedOff, setSelectedOff] = useState<string | null>(null);
  const [showFine, setShowFine] = useState(false);

  const t = live.tactics;
  const broughtOn = useMemo(() => new Set(live.subs.map((s) => s.on)), [live.subs]);

  const byName = useMemo(() => new Map(squad.players.map((p) => [p.name, p])), [squad]);

  // mid-match condition: starters have run 45'; the bench is as rested as it was.
  const midStates = useMemo(() => {
    const m: PlayerStates = {};
    for (const [name, c] of Object.entries(career.playerStates)) m[name] = { ...c };
    for (const name of live.start.eleven) {
      const grp = byName.get(name)?.group ?? "MF";
      const cur = m[name] ?? { stamina: 100, yellows: 0, suspendedNext: false };
      m[name] = { ...cur, stamina: depleteStamina(cur.stamina, 45, grp) };
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [career.playerStates, live.start.eleven, byName]);

  // the XI on the pitch now, arranged into the current shape and grouped by line.
  const onPitch = useMemo(() => {
    const swapped = live.start.eleven.map((n) => live.subs.find((s) => s.off === n)?.on ?? n);
    return arrangeEleven(squad, swapped, live.formation);
  }, [squad, live.start.eleven, live.subs, live.formation]);

  const lines = useMemo(() => {
    const f = FORMATIONS[live.formation] ?? FORMATIONS["4-3-3"]!;
    const out: Record<string, string[]> = { GK: [], DF: [], MF: [], FW: [] };
    onPitch.forEach((name, i) => {
      const pos = f.slots[i]?.pos ?? byName.get(name)?.group ?? "MF";
      out[pos]!.push(name);
    });
    return out;
  }, [onPitch, live.formation, byName]);

  const bench = useMemo(
    () =>
      squad.players
        .filter((p) => !live.start.eleven.includes(p.name) && !broughtOn.has(p.name) && isAvailable(career.playerStates, p.name))
        .sort((a, b) => b.ability - a.ability),
    [squad, live.start.eleven, broughtOn, career.playerStates],
  );

  const subsLeft = MAX_HALFTIME_SUBS - live.subs.length;

  // live attack / defence with these changes, versus the team's default rating
  const base = model.teams.find((x) => x.name === team)!;
  const r = managedRatings(model, team, onPitch, live.formation, t, midStates);
  const dAtk = r.atk - base.atk;
  const dDef = r.def - base.def;
  const tiredCount = onPitch.filter((n) => (midStates[n]?.stamina ?? 100) < 50).length;

  const pickOff = (name: string) => {
    if (broughtOn.has(name)) return; // a player who just came on can't be hooked
    setSelectedOff((cur) => (cur === name ? null : name));
  };
  const pickOn = (name: string) => {
    if (subsLeft <= 0) return;
    if (!selectedOff) return;
    halftimeSub(selectedOff, name);
    setSelectedOff(null);
  };
  const applyPreset = (p: Tactics) => setHalftimeTactics(p);
  const activePreset = PRESETS.reduce((best, p) =>
    Math.abs(p.t.mentality - t.mentality) < Math.abs(best.t.mentality - t.mentality) ? p : best,
  );

  return (
    <div className="lmc__ht">
      <div className="lmc__ht-head">
        <div>
          <div className="eyebrow">Half-time team talk</div>
          <div className="lmc__ht-score anton">
            {live.home} {live.homeGoals} – {live.awayGoals} {live.away}
          </div>
        </div>
        <div className="lmc__readout">
          <Readout label="Attack" value={r.atk} delta={dAtk} />
          <Readout label="Defence" value={r.def} delta={dDef} />
        </div>
      </div>

      {(r.mismatches.length > 0 || tiredCount > 0 || t.mentality > 0.33) && (
        <div className="lmc__flags">
          {r.mismatches.length > 0 && <span className="lmc__flag warn">⚠ {r.mismatches.length} out of position</span>}
          {tiredCount > 0 && <span className="lmc__flag tired">▼ {tiredCount} tiring (under 50%)</span>}
          {t.mentality > 0.33 && <span className="lmc__flag push">▲ Exposed on the counter</span>}
        </div>
      )}

      <div className="lmc__ht-grid">
        <div className="lmc__pitchcol">
          <div className="lmc__col-head">
            <span className="eyebrow">Your XI — tap a player to take off</span>
            <span className="mono lmc__subs-left">{subsLeft} sub{subsLeft === 1 ? "" : "s"} left</span>
          </div>
          <div className="lmc__pitch">
            {(["FW", "MF", "DF", "GK"] as const).map((linePos) => (
              <div key={linePos} className="lmc__pitch-line">
                {lines[linePos]!.map((name) => (
                  <PlayerCard
                    key={name}
                    name={name}
                    number={byName.get(name)?.number ?? 0}
                    pos={byName.get(name)?.group ?? linePos}
                    stamina={midStates[name]?.stamina ?? 100}
                    incoming={broughtOn.has(name)}
                    selectable={!broughtOn.has(name)}
                    selected={selectedOff === name}
                    onClick={() => pickOff(name)}
                  />
                ))}
              </div>
            ))}
          </div>
          {live.subs.length > 0 && (
            <ul className="lmc__sublist mono">
              {live.subs.map((s) => (
                <li key={s.on}>
                  <span className="lmc__sub-on">▲ {s.on}</span> for {s.off}
                  <button className="lmc__sub-undo" onClick={() => undoHalftimeSub(s.on)} aria-label={`Undo ${s.on}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lmc__benchcol">
          <div className="lmc__col-head">
            <span className="eyebrow">{selectedOff ? `Bring on for ${selectedOff}` : "Bench"}</span>
          </div>
          <div className={`lmc__bench ${selectedOff && subsLeft > 0 ? "armed" : ""}`}>
            {bench.length === 0 ? (
              <div className="mono lmc__note">No outfield options available.</div>
            ) : (
              bench.map((p) => (
                <PlayerCard
                  key={p.name}
                  name={p.name}
                  number={p.number ?? 0}
                  pos={p.group}
                  stamina={career.playerStates[p.name]?.stamina ?? 100}
                  bench
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
              onClick={() => applyPreset(p.t)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {showFine && (
          <div className="lmc__sliders">
            <Slider label="Mentality" value={t.mentality} min={-1} max={1} step={0.1} read={mentalityLabel(t.mentality)} onChange={(v) => setHalftimeTactics({ mentality: v })} />
            <Slider label="Pressing" value={t.pressing} min={0} max={1} step={0.05} read={pressingLabel(t.pressing)} onChange={(v) => setHalftimeTactics({ pressing: v })} />
            <Slider label="Pacing" value={t.pacing} min={0} max={1} step={0.05} read={pacingLabel(t.pacing)} onChange={(v) => setHalftimeTactics({ pacing: v })} />
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
              onClick={() => setHalftimeFormation(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <button className="btn lmc__resume" onClick={resumeSecondHalf}>
        Start the second half →
      </button>
    </div>
  );
}

function PlayerCard({
  name,
  number,
  pos,
  stamina,
  incoming,
  bench,
  selectable = true,
  selected = false,
  disabled = false,
  onClick,
}: {
  name: string;
  number: number;
  pos: string;
  stamina: number;
  incoming?: boolean;
  bench?: boolean;
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tier = staminaTier(stamina);
  return (
    <button
      type="button"
      className={`lmc-pc ${selected ? "sel" : ""} ${incoming ? "inc" : ""} ${bench ? "bench" : ""} ${!selectable && !bench ? "locked" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={name}
    >
      <span className="lmc-pc__num mono">{number || "–"}</span>
      <span className="lmc-pc__body">
        <span className="lmc-pc__name">{name}</span>
        <span className="lmc-pc__meta mono">
          {pos}
          {incoming ? " · on" : ""}
        </span>
        <span className="lmc-pc__bar">
          <span className="lmc-pc__bar-fill" style={{ width: `${Math.round(stamina)}%`, background: TIER_COLOR[tier] }} />
        </span>
      </span>
    </button>
  );
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
  if (kind === "own") return `Own goal! ${player} turns it into his own net — it counts for ${team}.`;
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
  const items: FeedItem[] = [{ minute: 0, kind: "period", text: "Kick-off — we are under way." }];
  for (const g of live.goals) {
    if (g.minute > clock) continue;
    items.push({ minute: g.minute, kind: "goal", side: g.side, text: goalText(g.player, g.assist, g.kind, g.team) });
  }
  for (const s of live.subs as LiveSub[]) {
    if (s.minute > clock) continue;
    items.push({ minute: s.minute, kind: "sub", side: live.managedSide, text: `Substitution: ${s.on} on for ${s.off}.` });
  }
  if (clock >= 45) items.push({ minute: 45, kind: "period", text: atHalftime ? "Half-time." : "Half-time whistle." });
  if (live.afterExtraTime && clock >= 90) items.push({ minute: 90, kind: "period", text: "Level after 90 — into extra time." });
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
