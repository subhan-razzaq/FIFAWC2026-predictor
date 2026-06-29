// Play the whole bracket: drag every group into your predicted order, then click
// your way through a real Round-of-32-to-final knockout tree seeded from those
// groups. The model then runs tens of thousands of tournaments and grades the
// call - the odds of each pick, of the whole bracket, and whether it beats the
// favourites. Every number on the report card is a real Monte Carlo frequency.

import { useEffect, useMemo, useState } from "react";
import { motion, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import type { BracketGrade, BracketPrediction, Model } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import { getRunner } from "../../sim/runner";
import { TeamBadge } from "../../components/TeamBadge";
import { CountUp } from "../../components/CountUp";
import { groupColor } from "../../design/colors";
import { teamCode } from "../../lib/teamCode";
import { oddsPct } from "../../lib/format";
import {
  TREE,
  autoFillBracket,
  championOf,
  deepPicks,
  defaultQualifiedThirds,
  resolveBracket,
  seedR32,
  type Side,
} from "../../lib/predictBracket";
import { decodePrediction, predictionShareUrl } from "../../lib/predictShare";

const STORE_KEY = "wm-predict-v1";

interface SavedDraft {
  snapshot: string;
  order: Record<string, string[]>;
  picks: Record<number, string>;
  thirds?: string[];
}

interface InitialState {
  order: Record<string, string[]>;
  picks: Record<number, string>;
  thirds: string[];
  fromShare: boolean;
}

/** Restore a prediction from a shared `?b=` link, then local storage, then defaults. */
function loadInitial(model: Model, defaultOrder: Record<string, string[]>): InitialState {
  if (typeof window !== "undefined") {
    const token = new URLSearchParams(window.location.search).get("b");
    if (token) {
      const decoded = decodePrediction(model, token);
      if (decoded) return { ...decoded, fromShare: true };
    }
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedDraft;
        if (saved.snapshot === model.meta.snapshot_date && saved.order) {
          const order = saved.order;
          const thirds = saved.thirds?.length === 8 ? saved.thirds : defaultQualifiedThirds(model, order);
          return { order, picks: saved.picks ?? {}, thirds, fromShare: false };
        }
      }
    } catch {
      /* corrupt storage: fall through to defaults */
    }
  }
  return { order: defaultOrder, picks: {}, thirds: defaultQualifiedThirds(model, defaultOrder), fromShare: false };
}

const EASE = [0.16, 1, 0.3, 1] as const;
const STEPS = ["Groups", "Knockouts", "Report"] as const;

function oneInWords(n: number): string {
  if (!isFinite(n) || n <= 0) return "astronomical";
  if (n < 1000) return `1 in ${Math.round(n)}`;
  const units: [number, string][] = [
    [1e15, "quadrillion"],
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
  ];
  for (const [v, name] of units) {
    if (n >= v) return `1 in ${(n / v).toFixed(n / v < 10 ? 1 : 0)} ${name}`;
  }
  return `1 in ${Math.round(n).toLocaleString()}`;
}

interface GroupBlock {
  group: string;
  teams: string[]; // model rating order, the sensible default
}

export function WholeBracket({ model }: { model: Model }) {
  const reduce = useReducedMotion();
  const runs = useStore((s) => s.runs);
  const seed = useStore((s) => s.seed);

  const blocks = useMemo<GroupBlock[]>(() => {
    const byGroup = new Map<string, { name: string; rating: number }[]>();
    for (const t of model.teams) {
      const arr = byGroup.get(t.group) ?? [];
      arr.push({ name: t.name, rating: t.rating });
      byGroup.set(t.group, arr);
    }
    return [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, arr]) => ({ group, teams: [...arr].sort((x, y) => y.rating - x.rating).map((t) => t.name) }));
  }, [model]);

  // restore a shared (?b=) or saved bracket once, before first paint
  const initial = useMemo(
    () => loadInitial(model, Object.fromEntries(blocks.map((b) => [b.group, [...b.teams]]))),
    [model, blocks],
  );

  const [order, setOrder] = useState<Record<string, string[]>>(initial.order);
  const [picks, setPicks] = useState<Record<number, string>>(initial.picks);
  const [thirds, setThirds] = useState<string[]>(initial.thirds);
  // a shared or in-progress bracket lands straight on the knockouts canvas
  const [step, setStep] = useState(Object.keys(initial.picks).length > 0 ? 1 : 0);
  const [fromShare] = useState(initial.fromShare);

  const [grade, setGrade] = useState<BracketGrade | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of model.teams) m.set(t.name, t.group);
    return m;
  }, [model]);

  const ratingOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of model.teams) m.set(t.name, t.rating);
    return m;
  }, [model]);

  // the twelve third-placed teams from the current group orders, strongest first
  const thirdCandidates = useMemo(
    () =>
      blocks
        .map((b) => ({ group: b.group, team: order[b.group]?.[2] ?? "" }))
        .sort((a, b) => (ratingOf.get(b.team) ?? 0) - (ratingOf.get(a.team) ?? 0)),
    [blocks, order, ratingOf],
  );

  // the R32 reseeds whenever the predicted group orders or the qualifying thirds change
  const seedMatches = useMemo(() => seedR32(model, order, thirds), [model, order, thirds]);
  const thirdsComplete = thirds.length === 8;
  const { part, picks: cleanPicks } = useMemo(() => resolveBracket(seedMatches, picks), [seedMatches, picks]);

  // a change to the groups can invalidate downstream winners; prune them
  useEffect(() => {
    setPicks((prev) => resolveBracket(seedMatches, prev).picks);
  }, [seedMatches]);

  // a shared bracket is now the working draft, so drop the (long) token from the
  // address bar; edits stay saved locally and "Copy link" rebuilds a fresh URL
  useEffect(() => {
    if (!fromShare || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("b")) {
      url.searchParams.delete("b");
      window.history.replaceState(null, "", url.toString());
    }
  }, [fromShare]);

  // keep the working bracket across refreshes and trips to other pages
  useEffect(() => {
    try {
      const draft: SavedDraft = { snapshot: model.meta.snapshot_date, order, picks: cleanPicks, thirds };
      window.localStorage.setItem(STORE_KEY, JSON.stringify(draft));
    } catch {
      /* storage full or unavailable: keep playing without a save */
    }
  }, [model, order, cleanPicks, thirds]);

  const champion = championOf(cleanPicks);
  const complete = champion !== undefined;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(predictionShareUrl(model, order, cleanPicks, thirds));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: no-op */
    }
  };

  // --- editing actions --------------------------------------------------------

  const reorderGroup = (group: string, next: string[]) => {
    setOrder((prev) => ({ ...prev, [group]: next }));
    setGrade(null);
  };

  const move = (group: string, i: number, dir: -1 | 1) => {
    setOrder((prev) => {
      const arr = [...prev[group]!];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      return { ...prev, [group]: arr };
    });
    setGrade(null);
  };

  const resetGroups = () => {
    const fresh = Object.fromEntries(blocks.map((b) => [b.group, [...b.teams]]));
    setOrder(fresh);
    setThirds(defaultQualifiedThirds(model, fresh));
    setGrade(null);
  };

  // toggle a group's third-placed team in or out of the eight qualifiers, never
  // letting the selection climb past eight
  const toggleThird = (group: string) => {
    setThirds((prev) => {
      if (prev.includes(group)) return prev.filter((g) => g !== group);
      if (prev.length >= 8) return prev;
      return [...prev, group].sort();
    });
    setGrade(null);
  };

  const bestThirds = () => {
    setThirds(defaultQualifiedThirds(model, order));
    setGrade(null);
  };

  const pickWinner = (matchNo: number, team: string) => {
    setPicks((prev) => resolveBracket(seedMatches, { ...prev, [matchNo]: team }).picks);
    setGrade(null);
  };

  const fillFavourites = () => {
    setPicks(autoFillBracket(model, seedMatches));
    setGrade(null);
  };

  const clearBracket = () => {
    setPicks({});
    setGrade(null);
  };

  // --- run --------------------------------------------------------------------

  const run = async () => {
    if (!complete) return;
    const { finalFour, finalists } = deepPicks(part);
    const prediction: BracketPrediction = { groupOrder: order, finalFour, finalists, champion: champion! };
    setRunning(true);
    setProgress(0);
    setStep(2);
    try {
      const g = await getRunner().gradeBracket(model, prediction, runs, seed, (done, total) =>
        setProgress(done / total),
      );
      setGrade(g);
    } finally {
      setRunning(false);
    }
  };

  // --- step panels ------------------------------------------------------------

  const groupsPanel = (
    <div>
      <div className="pred-substep-head">
        <p className="mono pred-hint">
          Drag each team into your predicted finishing order, 1st at the top. The top two (green) advance directly.
        </p>
        <button className="btn btn--ghost" onClick={resetGroups}>
          Reset to model order
        </button>
      </div>
      <div className="pred-groups">
        {blocks.map((b) => (
          <div key={b.group} className="pred-group flat-card">
            <div className="pred-group__head">
              <span className="pred-group__chip" style={{ background: groupColor(b.group) }}>
                {b.group}
              </span>
              <span className="eyebrow">Group {b.group}</span>
            </div>
            <Reorder.Group
              axis="y"
              values={order[b.group]!}
              onReorder={(next) => reorderGroup(b.group, next)}
              className="pred-group__list"
              as="ul"
            >
              {order[b.group]!.map((team, i) => (
                <GroupRow
                  key={team}
                  team={team}
                  index={i}
                  group={b.group}
                  onMove={(dir) => move(b.group, i, dir)}
                />
              ))}
            </Reorder.Group>
          </div>
        ))}
      </div>

      <div className="pred-thirds">
        <div className="pred-substep-head">
          <div>
            <span className="eyebrow">Best third-placed teams</span>
            <p className="mono pred-hint">
              Eight of the twelve third-placed teams reach the Round of 32. Pick the eight you back. Chosen{" "}
              <b className={thirdsComplete ? "pred-thirds__count is-ok" : "pred-thirds__count"}>{thirds.length}</b> of 8.
            </p>
          </div>
          <button className="btn btn--ghost" onClick={bestThirds}>
            Best eight by rating
          </button>
        </div>
        <div className="pred-thirds__grid">
          {thirdCandidates.map(({ group, team }) => {
            const on = thirds.includes(group);
            return (
              <button
                key={group}
                type="button"
                className={`pred-third ${on ? "is-on" : ""}`}
                onClick={() => toggleThird(group)}
                disabled={!on && thirds.length >= 8}
                aria-pressed={on}
              >
                <span className="pred-third__chip" style={{ background: groupColor(group) }}>
                  {group}
                </span>
                <TeamBadge team={team} size={18} />
                <span className="pred-third__name">{team}</span>
                <span className="pred-third__mark" aria-hidden>
                  {on ? "✓" : "+"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const knockoutsPanel = (
    <div>
      <div className="pred-substep-head">
        <p className="mono pred-hint">
          Click the winner of every tie, Round of 32 up to the final. Your eight chosen third-placed teams fill their
          official Annex C slots.
        </p>
        <div className="pred-bracket-ctl">
          <button className="btn btn--ghost" onClick={fillFavourites}>
            Fill with favourites
          </button>
          <button className="btn btn--ghost" onClick={() => void copyShareLink()} disabled={Object.keys(cleanPicks).length === 0}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          <button className="btn btn--ghost" onClick={clearBracket}>
            Clear
          </button>
        </div>
      </div>
      <KnockoutBracket part={part} picks={cleanPicks} onPick={pickWinner} groupOf={groupOf} champion={champion} reduce={!!reduce} />
    </div>
  );

  return (
    <div className="pred-bracket-mode">
      {fromShare && (
        <div className="pred-shared-note mono">
          <span className="pred-shared-note__dot" aria-hidden />
          You&rsquo;re viewing a shared bracket. Change any pick to make it your own, then run it.
        </div>
      )}
      <ol className="pred-steps mono">
        {STEPS.map((s, i) => (
          <li key={s} className={`${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}>
            <span className="pred-steps__n">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && groupsPanel}
      {step === 1 && knockoutsPanel}

      {step < 2 && (
        <div className="pred-nav">
          <button className="btn btn--ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          {step === 0 ? (
            <button
              className="btn"
              onClick={() => setStep(1)}
              disabled={!thirdsComplete}
              title={thirdsComplete ? "" : "Pick exactly eight third-placed teams"}
            >
              {thirdsComplete ? "Next: build the bracket" : `Pick ${8 - thirds.length} more third-placed team${8 - thirds.length === 1 ? "" : "s"}`}
            </button>
          ) : (
            <button className="btn" onClick={() => void run()} disabled={!complete || running} title={complete ? "" : "Pick a champion first"}>
              {complete ? "Run my prediction" : "Finish the bracket"}
            </button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="pred-report">
          {running || !grade ? (
            <div className="pred-running flat-card">
              <div className="pred-running__spinner" aria-hidden />
              <h3 className="anton">Simulating {runs.toLocaleString()} tournaments</h3>
              <div className="pred-running__bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mono">Scoring your bracket against every reality the model rolls&hellip;</p>
            </div>
          ) : (
            <GradeReport
              grade={grade}
              groupOf={groupOf}
              reduce={!!reduce}
              copied={copied}
              onShare={() => void copyShareLink()}
              onEdit={() => setStep(1)}
              onRerun={() => void run()}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- group ordering row (drag handle + arrows) --------------------------------

function GroupRow({
  team,
  index,
  group,
  onMove,
}: {
  team: string;
  index: number;
  group: string;
  onMove: (dir: -1 | 1) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={team}
      dragListener={false}
      dragControls={controls}
      className="pred-group__row"
      whileDrag={{ scale: 1.04, zIndex: 2 }}
    >
      <span
        className="pred-group__handle"
        onPointerDown={(e) => controls.start(e)}
        role="button"
        aria-label={`Drag ${team}`}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span className={`pred-group__rank mono ${index < 2 ? "is-advancing" : ""}`}>{index + 1}</span>
      <TeamBadge team={team} group={group} size={20} />
      <span className="pred-group__name">{team}</span>
      <span className="pred-group__moves">
        <button onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${team} up`}>
          ▲
        </button>
        <button onClick={() => onMove(1)} disabled={index === 3} aria-label={`Move ${team} down`}>
          ▼
        </button>
      </span>
    </Reorder.Item>
  );
}

// --- the clickable knockout bracket -------------------------------------------

function KnockoutBracket({
  part,
  picks,
  onPick,
  groupOf,
  champion,
  reduce,
}: {
  part: Record<number, Side>;
  picks: Record<number, string>;
  onPick: (matchNo: number, team: string) => void;
  groupOf: Map<string, string>;
  champion?: string;
  reduce: boolean;
}) {
  const col = (matches: number[], label: string) => (
    <div className="pbk-col">
      <div className="pbk-col__label mono">{label}</div>
      <div className="pbk-col__nodes">
        {matches.map((m) => (
          <MatchCell key={m} matchNo={m} side={part[m]} winner={picks[m]} onPick={onPick} groupOf={groupOf} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="pbk" role="group" aria-label="Knockout bracket, click a team to advance them">
      {col(TREE.left.r32, "R32")}
      {col(TREE.left.r16, "R16")}
      {col(TREE.left.qf, "QF")}
      {col([TREE.left.sf], "SF")}

      <div className="pbk-center">
        <div className="pbk-col__label mono">Final</div>
        <MatchCell matchNo={TREE.final} side={part[TREE.final]} winner={picks[TREE.final]} onPick={onPick} groupOf={groupOf} big />
        <motion.div
          className={`pbk-trophy ${champion ? "is-set" : ""}`}
          initial={false}
          animate={reduce ? {} : champion ? { scale: [0.9, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <TrophyMark />
          {champion ? (
            <span className="pbk-trophy__name">
              <TeamBadge team={champion} group={groupOf.get(champion)} size={22} />
              {champion}
            </span>
          ) : (
            <span className="pbk-trophy__name pbk-trophy__name--pending mono">pick a champion</span>
          )}
        </motion.div>
      </div>

      {col([TREE.right.sf], "SF")}
      {col(TREE.right.qf, "QF")}
      {col(TREE.right.r16, "R16")}
      {col(TREE.right.r32, "R32")}
    </div>
  );
}

function MatchCell({
  matchNo,
  side,
  winner,
  onPick,
  groupOf,
  big,
}: {
  matchNo: number;
  side?: Side;
  winner?: string;
  onPick: (matchNo: number, team: string) => void;
  groupOf: Map<string, string>;
  big?: boolean;
}) {
  return (
    <div className={`pbk-match ${big ? "pbk-match--big" : ""}`}>
      <TeamSlot team={side?.home} matchNo={matchNo} winner={winner} onPick={onPick} groupOf={groupOf} big={big} />
      <TeamSlot team={side?.away} matchNo={matchNo} winner={winner} onPick={onPick} groupOf={groupOf} big={big} />
    </div>
  );
}

function TeamSlot({
  team,
  matchNo,
  winner,
  onPick,
  groupOf,
  big,
}: {
  team?: string;
  matchNo: number;
  winner?: string;
  onPick: (matchNo: number, team: string) => void;
  groupOf: Map<string, string>;
  big?: boolean;
}) {
  if (!team) {
    return (
      <div className="pbk-slot pbk-slot--tbd">
        <span className="pbk-slot__flag-empty" aria-hidden />
        <span className="pbk-slot__code mono">TBD</span>
      </div>
    );
  }
  const decided = winner !== undefined;
  const isWin = winner === team;
  return (
    <button
      className={`pbk-slot ${decided && isWin ? "is-win" : ""} ${decided && !isWin ? "is-out" : ""}`}
      onClick={() => onPick(matchNo, team)}
      title={`Advance ${team}`}
    >
      <TeamBadge team={team} group={groupOf.get(team)} size={big ? 22 : 18} />
      <span className="pbk-slot__code mono">{big ? team : teamCode(team)}</span>
      {isWin && <span className="pbk-slot__check" aria-hidden>✓</span>}
    </button>
  );
}

function TrophyMark() {
  return (
    <svg className="pbk-trophy__art" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 13v4M9 21h6M10 17h4" />
    </svg>
  );
}

// --- the report card ----------------------------------------------------------

function GradeReport({
  grade,
  groupOf,
  reduce,
  copied,
  onShare,
  onEdit,
  onRerun,
}: {
  grade: BracketGrade;
  groupOf: Map<string, string>;
  reduce: boolean;
  copied: boolean;
  onShare: () => void;
  onEdit: () => void;
  onRerun: () => void;
}) {
  const oneIn = oneInWords(grade.perfectProb > 0 ? 1 / grade.perfectProb : Infinity);
  const sc = grade.scoring;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <div className="pred-grade flat-card keyline-gold">
        <div className="pred-grade__letter">
          <span className="anton">{grade.grade}</span>
          <span className="mono pred-grade__persona">{grade.persona}</span>
        </div>
        <div className="pred-grade__lines">
          <div className="pred-grade__champ">
            <TeamBadge team={grade.champion.team} group={groupOf.get(grade.champion.team)} size={40} />
            <div>
              <div className="anton pred-grade__champ-name">{grade.champion.team}</div>
              <div className="mono pred-grade__champ-sub">
                your champion · <strong>{oddsPct(grade.champion.prob)}</strong> to lift it · #{grade.champion.rank} on the board
              </div>
            </div>
          </div>
          {grade.champion.team !== grade.champion.modal && (
            <div className="mono pred-grade__note">
              the model favours <strong>{grade.champion.modal}</strong> ({oddsPct(grade.champion.modalProb)})
            </div>
          )}
        </div>
        <div className="pred-grade__perfect">
          <span className="eyebrow">Perfect bracket</span>
          <span className="anton pred-grade__perfect-odds">{oneIn}</span>
          <span className="mono">every group order + the title, estimated</span>
        </div>
      </div>

      <div className="pred-stats">
        <Stat value={grade.expectedPositions} max={48} label="expected correct group places" format={(v) => v.toFixed(1)} />
        <Stat value={grade.expectedGroupsExact} label="groups nailed exactly (avg)" format={(v) => v.toFixed(1)} />
        <Stat value={grade.beatChalkProb} label="chance you beat the chalk bracket" format={oddsPct} accent="var(--fifa-teal)" />
        <Stat value={grade.bestCaseScore} max={grade.maxScore} label="your best-case score" format={(v) => Math.round(v).toString()} />
      </div>

      <div className="pred-vs flat-card">
        <span className="eyebrow">Your bracket vs the favourites</span>
        <div className="pred-vs__bars">
          <ScoreBar label="You" value={grade.userExpectedScore} max={grade.maxScore} accent="var(--gold)" />
          <ScoreBar label="Chalk (model favourites)" value={grade.chalkExpectedScore} max={grade.maxScore} accent="var(--steel)" />
        </div>
        <p className="mono pred-vs__note">
          Expected points across {grade.runs.toLocaleString()} simulated tournaments. Scoring: group winner {sc.groupWinner}, runner-up{" "}
          {sc.groupRunnerUp}, 3rd/4th {sc.groupThird}; reach the semis {sc.reachSemi}, the final {sc.reachFinal}; champion {sc.champion}.
        </p>
      </div>

      <div className="flat-card pred-titleboard">
        <span className="eyebrow">The model&rsquo;s title race</span>
        <div className="pred-titleboard__rows">
          {grade.titleBoard.map((t, i) => {
            const yours = t.team === grade.champion.team;
            return (
              <div key={t.team} className={`pred-titlerow ${yours ? "is-yours" : ""}`}>
                <span className="pred-titlerow__rank mono">{i + 1}</span>
                <TeamBadge team={t.team} group={groupOf.get(t.team)} size={20} />
                <span className="pred-titlerow__name">{t.team}</span>
                {yours && <span className="pred-tag pred-tag--bold">your pick</span>}
                <span className="pred-titlerow__bar">
                  <span style={{ width: `${Math.min(100, (t.prob / grade.titleBoard[0]!.prob) * 100)}%` }} />
                </span>
                <span className="mono pred-titlerow__pct">{oddsPct(t.prob)}</span>
              </div>
            );
          })}
        </div>
        {grade.champion.rank > grade.titleBoard.length && (
          <p className="mono pred-titleboard__note">
            your pick {grade.champion.team} sits #{grade.champion.rank} on the board at {oddsPct(grade.champion.prob)}
          </p>
        )}
      </div>

      <div className="pred-deep">
        <div className="flat-card pred-deep__col">
          <span className="eyebrow">Your final four · reach the semis</span>
          {grade.finalFour.map((p) => (
            <OddsLine key={p.team} team={p.team} group={groupOf.get(p.team)} prob={p.prob} />
          ))}
        </div>
        <div className="flat-card pred-deep__col">
          <span className="eyebrow">Your finalists · reach the final</span>
          {grade.finalists.map((p) => (
            <OddsLine key={p.team} team={p.team} group={groupOf.get(p.team)} prob={p.prob} />
          ))}
        </div>
      </div>

      <div className="pred-highlights">
        <Highlight label="Safest pick" body={grade.safestPick.label} value={grade.safestPick.prob} accent="var(--win)" />
        <Highlight label="Biggest gamble" body={grade.biggestGamble.label} value={grade.biggestGamble.prob} accent="var(--loss)" />
      </div>

      <div className="flat-card pred-grouptable">
        <span className="eyebrow">Group by group</span>
        <div className="pred-grouptable__rows">
          {grade.groups.map((g) => (
            <div key={g.group} className="pred-grouprow">
              <span className="pred-group__chip" style={{ background: groupColor(g.group) }}>
                {g.group}
              </span>
              <span className="pred-grouprow__order mono">
                {g.predicted[0]} ▸ {g.predicted[1]}
              </span>
              <span className="pred-grouprow__metrics mono">
                <span title="chance this exact 1-4 order lands">order {oddsPct(g.exactProb)}</span>
                <span title="chance your pick tops the group">· {g.predicted[0]} wins {oddsPct(g.winnerProb)}</span>
              </span>
              {g.matchesModal ? (
                <span className="pred-tag pred-tag--model">model pick</span>
              ) : (
                <span className="pred-tag pred-tag--bold" title={`the model leans ${g.modalOrder[0]} first`}>
                  vs {g.modalOrder[0]}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pred-nav">
        <button className="btn btn--ghost" onClick={onEdit}>
          Tweak my bracket
        </button>
        <div className="pred-nav__group">
          <button className="btn btn--ghost" onClick={onShare}>
            {copied ? "Link copied" : "Share bracket"}
          </button>
          <button className="btn" onClick={onRerun}>
            Re-run
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({
  value,
  max,
  label,
  format,
  accent,
}: {
  value: number;
  max?: number;
  label: string;
  format: (v: number) => string;
  accent?: string;
}) {
  return (
    <div className="pred-stat flat-card">
      <div className="pred-stat__val anton" style={accent ? { color: accent } : undefined}>
        <CountUp value={value} format={format} />
        {max !== undefined && <span className="pred-stat__max mono"> / {max}</span>}
      </div>
      <div className="pred-stat__label mono">{label}</div>
    </div>
  );
}

function ScoreBar({ label, value, max, accent }: { label: string; value: number; max: number; accent: string }) {
  return (
    <div className="pred-scorebar">
      <div className="pred-scorebar__top mono">
        <span>{label}</span>
        <span>{value.toFixed(1)} pts</span>
      </div>
      <div className="pred-scorebar__track">
        <span style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: accent }} />
      </div>
    </div>
  );
}

function OddsLine({ team, group, prob }: { team: string; group?: string; prob: number }) {
  return (
    <div className="pred-oddsline">
      <TeamBadge team={team} group={group} size={22} />
      <span className="pred-oddsline__name">{team}</span>
      <span className="pred-oddsline__bar">
        <span style={{ width: `${Math.min(100, prob * 100)}%` }} />
      </span>
      <span className="mono pred-oddsline__pct">{oddsPct(prob)}</span>
    </div>
  );
}

function Highlight({ label, body, value, accent }: { label: string; body: string; value: number; accent: string }) {
  return (
    <div className="pred-highlight flat-card" style={{ borderTopColor: accent }}>
      <span className="eyebrow">{label}</span>
      <div className="pred-highlight__body">{body}</div>
      <div className="anton pred-highlight__val" style={{ color: accent }}>
        {oddsPct(value)}
      </div>
    </div>
  );
}
