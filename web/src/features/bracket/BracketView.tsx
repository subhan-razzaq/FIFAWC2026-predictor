import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/store";
import { buildBracket, type KoNode } from "../../lib/bracketLayout";
import { BracketMatch } from "./BracketMatch";
import { Trophy } from "./Trophy";
import "./bracket.css";

const STAGE_MS = 900;
const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BracketView() {
  const model = useStore((s) => s.model);
  const single = useStore((s) => s.single);
  const seedLabel = useStore((s) => s.seedLabel);
  const runReveal = useStore((s) => s.runReveal);

  const [stage, setStage] = useState(5);
  const timers = useRef<number[]>([]);

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of model?.teams ?? []) m.set(t.name, t.group);
    return m;
  }, [model]);

  const layout = useMemo(() => (single ? buildBracket(single) : null), [single]);

  // generate the reveal on first visit if we do not have one yet
  useEffect(() => {
    if (!single) void runReveal();
  }, [single, runReveal]);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  const play = () => {
    clearTimers();
    if (reduceMotion()) {
      setStage(5);
      return;
    }
    setStage(0);
    for (let s = 1; s <= 5; s++) {
      timers.current.push(window.setTimeout(() => setStage(s), s * STAGE_MS));
    }
  };

  // play the sequence whenever a new tournament is revealed
  useEffect(() => {
    if (layout) play();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const reveal = async () => {
    await runReveal();
  };

  if (!layout) {
    return (
      <div className="wrap">
        <div className="section-head">
          <h2>Live bracket</h2>
        </div>
        <p className="mono" style={{ color: "var(--text-faint)" }}>
          building the bracket…
        </p>
      </div>
    );
  }

  const renderCol = (nodes: KoNode[], round: number, label: string, side: "left" | "right") => (
    <div className="ko-col">
      <div className="ko-col__label mono">{label}</div>
      <div className="ko-col__nodes">
        {nodes.map((n, i) => (
          <BracketMatch
            key={`${label}-${i}`}
            node={n}
            side={side}
            groupOf={groupOf}
            filled={stage >= round}
            decided={stage > round}
          />
        ))}
      </div>
    </div>
  );

  const championGroup = groupOf.get(layout.champion);

  return (
    <div className="wrap bracket-wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">The 48 to 1, one seeded run</div>
          <h2>Live bracket</h2>
        </div>
        <div className="bracket-controls">
          <span className="mono bracket-seed">seed {seedLabel}</span>
          <button className="btn btn--ghost" onClick={() => play()}>
            Replay
          </button>
          <button className="btn" onClick={() => void reveal()}>
            New run
          </button>
        </div>
      </div>

      <div className="bracket" role="figure" aria-label={`Simulated knockout bracket, champion ${layout.champion}`}>
        {renderCol(layout.left.r32, 0, "R32", "left")}
        {renderCol(layout.left.r16, 1, "R16", "left")}
        {renderCol(layout.left.qf, 2, "QF", "left")}
        {renderCol([layout.left.sf], 3, "SF", "left")}

        <div className="ko-center">
          <div className="ko-col__label mono">Final</div>
          <BracketMatch node={layout.final} side="left" groupOf={groupOf} filled={stage >= 4} decided={stage > 4} />
          <Trophy champion={layout.champion} group={championGroup} locked={stage >= 5} />
          <div className="ko-third">
            <div className="ko-col__label mono">Third place</div>
            <BracketMatch node={layout.third} side="left" groupOf={groupOf} filled={stage >= 4} decided={stage > 4} />
          </div>
        </div>

        {renderCol([layout.right.sf], 3, "SF", "right")}
        {renderCol(layout.right.qf, 2, "QF", "right")}
        {renderCol(layout.right.r16, 1, "R16", "right")}
        {renderCol(layout.right.r32, 0, "R32", "right")}
      </div>
    </div>
  );
}
