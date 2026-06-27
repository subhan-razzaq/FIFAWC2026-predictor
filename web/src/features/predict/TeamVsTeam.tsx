// Team vs Team: pick two nations, call the scoreline, and read the exact odds of
// it landing. Everything below the picker is the same Dixon-Coles fit the engine
// uses, so the markets (W/D/L, both teams to score, totals, clean sheets) and the
// scoreline heatmap all agree with the rest of the app. The "play it out" button
// rolls one full match through the real simulator for a bit of broadcast theatre.

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Rng,
  SimContext,
  simulateKnockout,
  type GoalEvent,
  type Model,
} from "@weltmeister/sim";
import { createPredictor, scoreProb, scoreRank } from "../../lib/predict";
import { ProbBar } from "../../components/ProbBar";
import { ScoreHeatmap } from "../../components/ScoreHeatmap";
import { TeamBadge } from "../../components/TeamBadge";
import { CountUp } from "../../components/CountUp";
import { teamCode } from "../../lib/teamCode";
import { oddsPct, pct } from "../../lib/format";

// marquee ties to kick the predictor off with one tap, kept to teams in the field
const MARQUEE: [string, string][] = [
  ["Spain", "France"],
  ["Brazil", "Argentina"],
  ["England", "Germany"],
  ["Mexico", "United States"],
  ["Netherlands", "Portugal"],
];

const EASE = [0.16, 1, 0.3, 1] as const;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

function TeamPicker({
  teams,
  value,
  exclude,
  onChange,
  label,
}: {
  teams: { name: string; group: string }[];
  value: string;
  exclude: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const byGroup = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of teams) {
      const arr = m.get(t.group) ?? [];
      arr.push(t.name);
      m.set(t.group, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [teams]);

  return (
    <label className="pred-picker">
      <span className="eyebrow">{label}</span>
      <div className="pred-picker__row">
        <TeamBadge team={value} size={30} />
        <select className="pred-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {byGroup.map(([g, names]) => (
            <optgroup key={g} label={`Group ${g}`}>
              {names.map((n) => (
                <option key={n} value={n} disabled={n === exclude}>
                  {n}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </label>
  );
}

function Stepper({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div className="pred-stepper">
      <span className="pred-stepper__label mono">{label}</span>
      <div className="pred-stepper__ctl">
        <button className="pred-stepper__btn" onClick={() => set(Math.max(0, value - 1))} aria-label={`${label} minus`}>
          −
        </button>
        <span className="pred-stepper__val anton" aria-live="polite">
          {value}
        </span>
        <button className="pred-stepper__btn" onClick={() => set(Math.min(10, value + 1))} aria-label={`${label} plus`}>
          +
        </button>
      </div>
    </div>
  );
}

function Market({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="pred-market flat-card">
      <div className="pred-market__val anton" style={accent ? { color: accent } : undefined}>
        <CountUp value={value} format={(v) => pct(v)} />
      </div>
      <div className="pred-market__label mono">{label}</div>
    </div>
  );
}

interface PlayedOut {
  homeGoals: number;
  awayGoals: number;
  scorers: GoalEvent[];
  afterExtraTime: boolean;
  shootout?: { home: number; away: number; winner: string };
  winner?: string;
}

export function TeamVsTeam({ model }: { model: Model }) {
  const reduce = useReducedMotion();
  const teams = useMemo(
    () => [...model.teams].map((t) => ({ name: t.name, group: t.group, rating: t.rating })),
    [model],
  );
  const ranked = useMemo(() => [...teams].sort((a, b) => b.rating - a.rating), [teams]);

  const [home, setHome] = useState(ranked[0]?.name ?? "");
  const [away, setAway] = useState(ranked[1]?.name ?? "");
  const [hostHome, setHostHome] = useState(false);
  const [hostAway, setHostAway] = useState(false);
  const [predH, setPredH] = useState(2);
  const [predA, setPredA] = useState(1);
  const [played, setPlayed] = useState<PlayedOut | null>(null);
  const [rollSeed, setRollSeed] = useState(1);

  const hosts = useMemo(() => new Set(model.meta.hosts), [model]);
  const homeIsHost = hosts.has(home);
  const awayIsHost = hosts.has(away);

  const marquee = useMemo(() => {
    const names = new Set(teams.map((t) => t.name));
    return MARQUEE.filter(([a, b]) => names.has(a) && names.has(b));
  }, [teams]);

  const pickMatchup = (h: string, a: string) => {
    setHome(h);
    setAway(a);
    setHostHome(false);
    setHostAway(false);
    setPlayed(null);
  };

  const report = useMemo(
    () => createPredictor(model).report(home, away, homeIsHost && hostHome, awayIsHost && hostAway),
    [model, home, away, homeIsHost, awayIsHost, hostHome, hostAway],
  );

  const exact = scoreProb(report.grid, predH, predA);
  const rank = scoreRank(report.grid, predH, predA);
  const decimal = exact > 0 ? 1 / exact : Infinity;
  const oneIn = exact > 0 ? Math.round(1 / exact) : Infinity;
  const calledOutcome = predH > predA ? home : predH < predA ? away : "a draw";

  const swap = () => {
    setHome(away);
    setAway(home);
    setHostHome(hostAway);
    setHostAway(hostHome);
    setPredH(predA);
    setPredA(predH);
    setPlayed(null);
  };

  const playItOut = () => {
    const seed = Math.floor(Math.random() * 1_000_000) + rollSeed;
    setRollSeed((n) => n + 1);
    const ctx = new SimContext(model);
    const r = simulateKnockout(ctx, new Rng(seed), {
      home,
      away,
      stage: "final",
      hostHome: homeIsHost && hostHome,
      hostAway: awayIsHost && hostAway,
    });
    setPlayed({
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      scorers: r.scorers,
      afterExtraTime: Boolean(r.afterExtraTime),
      shootout: r.shootout,
      winner: r.winner,
    });
  };

  return (
    <div className="pred-h2h">
      {marquee.length > 0 && (
        <div className="pred-featured">
          <span className="eyebrow">Marquee ties</span>
          <div className="pred-featured__row">
            {marquee.map(([h, a]) => {
              const active = home === h && away === a;
              return (
                <button
                  key={`${h}-${a}`}
                  className={`pred-featured__chip mono ${active ? "is-on" : ""}`}
                  onClick={() => pickMatchup(h, a)}
                  aria-pressed={active}
                >
                  {teamCode(h)} <span className="pred-featured__v">v</span> {teamCode(a)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="pred-setup flat-card">
        <div className="pred-setup__teams">
          <TeamPicker teams={teams} value={home} exclude={away} onChange={(v) => (setHome(v), setPlayed(null))} label="Home / first" />
          <button className="pred-swap" onClick={swap} title="Swap sides" aria-label="Swap sides">
            ⇄
          </button>
          <TeamPicker teams={teams} value={away} exclude={home} onChange={(v) => (setAway(v), setPlayed(null))} label="Away / second" />
        </div>

        <div className="pred-setup__controls">
          <div className="pred-scoreline">
            <Stepper label={home} value={predH} set={(n) => (setPredH(n), setPlayed(null))} />
            <span className="pred-scoreline__dash anton">–</span>
            <Stepper label={away} value={predA} set={(n) => (setPredA(n), setPlayed(null))} />
          </div>

          {(homeIsHost || awayIsHost) && (
            <div className="pred-venue">
              <span className="eyebrow">Venue</span>
              <div className="pred-venue__toggles">
                {homeIsHost && (
                  <label className="pred-toggle mono">
                    <input type="checkbox" checked={hostHome} onChange={(e) => setHostHome(e.target.checked)} />
                    {home} at home
                  </label>
                )}
                {awayIsHost && (
                  <label className="pred-toggle mono">
                    <input type="checkbox" checked={hostAway} onChange={(e) => setHostAway(e.target.checked)} />
                    {away} at home
                  </label>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <motion.div
        className="pred-verdict flat-card keyline-gold"
        key={`${home}-${away}-${predH}-${predA}-${hostHome}-${hostAway}`}
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="pred-verdict__call">
          <span className="eyebrow">Your call</span>
          <div className="pred-verdict__score">
            <TeamBadge team={home} size={34} />
            <span className="anton pred-verdict__nums">
              {predH} <span className="pred-verdict__dash">–</span> {predA}
            </span>
            <TeamBadge team={away} size={34} />
          </div>
          <div className="mono pred-verdict__teams">
            {home} vs {away}
          </div>
        </div>
        <div className="pred-verdict__odds">
          <div className="pred-verdict__big anton">
            <CountUp value={exact} format={(v) => oddsPct(v)} />
          </div>
          <div className="mono pred-verdict__meta">
            {exact > 0 ? (
              <>
                {oneIn === 1 ? "even money" : `about 1 in ${oneIn.toLocaleString()}`} · decimal {decimal.toFixed(decimal < 10 ? 2 : 0)}
                <br />
                the {ordinal(rank)} most likely scoreline · backs {calledOutcome === "a draw" ? "a draw" : calledOutcome}
              </>
            ) : (
              "off the realistic range for this match"
            )}
          </div>
        </div>
      </motion.div>

      <div className="pred-grids">
        <div className="flat-card pred-panel">
          <span className="eyebrow">Match odds</span>
          <div className="pred-panel__bar">
            <ProbBar win={report.win} draw={report.draw} loss={report.loss} homeLabel={home} awayLabel={away} height={14} />
          </div>
          <div className="mono pred-xg">
            expected goals · {home} <strong>{report.lamH.toFixed(2)}</strong> · {away} <strong>{report.lamA.toFixed(2)}</strong>
          </div>
          <div className="mono pred-modal">
            model&rsquo;s most likely result <strong>{report.modal.x}&ndash;{report.modal.y}</strong> ({pct(report.modal.p)})
          </div>
          <div className="pred-tops">
            {report.topScores.map((c) => {
              const isYours = c.h === predH && c.a === predA;
              return (
                <div key={`${c.h}-${c.a}`} className={`pred-tops__row ${isYours ? "is-yours" : ""}`}>
                  <span className="mono pred-tops__score">
                    {c.h}&ndash;{c.a}
                  </span>
                  <span className="pred-tops__bar">
                    <span style={{ width: `${(c.p / report.topScores[0]!.p) * 100}%` }} />
                  </span>
                  <span className="mono pred-tops__pct">{pct(c.p, 1)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flat-card pred-panel">
          <span className="eyebrow">Scoreline map · your call ringed</span>
          <ScoreHeatmap
            grid={report.grid}
            homeTeam={home}
            awayTeam={away}
            modal={{ x: report.modal.x, y: report.modal.y, p: report.modal.p }}
            actual={{ x: predH, y: predA }}
          />
        </div>
      </div>

      <div className="pred-markets">
        <Market label="Both teams score" value={report.btts} accent="var(--fifa-teal)" />
        <Market label="Over 2.5 goals" value={report.over[1]!.p} accent="var(--fifa-orange)" />
        <Market label="Over 1.5 goals" value={report.over[0]!.p} />
        <Market label="Over 3.5 goals" value={report.over[2]!.p} />
        <Market label={`${home} clean sheet`} value={report.homeCleanSheet} accent="var(--win)" />
        <Market label={`${away} clean sheet`} value={report.awayCleanSheet} accent="var(--win)" />
      </div>

      <div className="pred-playout">
        <div className="pred-playout__head">
          <div>
            <span className="eyebrow">Settle it</span>
            <h3 className="anton">Play the match out</h3>
            <p className="mono pred-playout__note">
              One knockout tie, rolled through the real simulator. Extra time and penalties decide a level game.
            </p>
          </div>
          <button className="btn" onClick={playItOut}>
            {played ? "Roll again" : "Simulate this match"}
          </button>
        </div>

        {played && (
          <motion.div
            className="pred-result flat-card"
            key={rollSeed}
            initial={reduce ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 20 }}
          >
            <div className="pred-result__score">
              <span className="pred-result__side">
                <TeamBadge team={home} size={28} />
                <span>{home}</span>
              </span>
              <span className="anton pred-result__nums">
                {played.homeGoals}&ndash;{played.awayGoals}
              </span>
              <span className="pred-result__side pred-result__side--away">
                <span>{away}</span>
                <TeamBadge team={away} size={28} />
              </span>
            </div>
            <div className="mono pred-result__line">
              {played.shootout
                ? `${played.winner} win ${played.shootout.home}–${played.shootout.away} on penalties`
                : played.afterExtraTime
                  ? `${played.winner} win after extra time`
                  : `${played.winner} win`}
              {played.homeGoals === predH && played.awayGoals === predA ? " · exactly your call" : ""}
            </div>
            {played.scorers.length > 0 && (
              <ul className="pred-result__scorers mono">
                {played.scorers.map((g, i) => (
                  <li key={i}>
                    <TeamBadge team={g.team} size={16} />
                    {g.player}
                    {g.kind === "penalty" ? " (pen)" : g.kind === "own" ? " (og)" : ""}
                    {g.assist ? ` · ${g.assist}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
