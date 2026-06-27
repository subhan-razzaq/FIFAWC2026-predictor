// Head to head: the prediction sandbox. A mode picker fronts two ways to back your
// own call against the model - play the whole bracket and get it graded, or put two
// nations head to head and call the score. The model loaded at boot drives both.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useStore } from "../../store/store";
import { TeamVsTeam } from "./TeamVsTeam";
import { WholeBracket } from "./WholeBracket";
import "./predict.css";

const EASE = [0.16, 1, 0.3, 1] as const;
type Mode = "menu" | "bracket" | "h2h";

export function PredictView() {
  const model = useStore((s) => s.model);
  const status = useStore((s) => s.status);
  const [mode, setMode] = useState<Mode>("menu");
  const reduce = useReducedMotion();

  if (!model) {
    return (
      <div className="wrap pred-wrap">
        <div className="pred-boot mono">
          {status === "error" ? "Could not load the model." : "Loading the model…"}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap pred-wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Head to head · back your own call</div>
          <h2>Make your prediction</h2>
        </div>
        {mode !== "menu" && (
          <button className="btn btn--ghost" onClick={() => setMode("menu")}>
            ← Both modes
          </button>
        )}
      </div>

      {mode === "menu" && (
        <div className="pred-modes">
          <ModeCard
            reduce={!!reduce}
            onClick={() => setMode("bracket")}
            kicker="The full run"
            title="Play the whole bracket"
            blurb="Order all twelve groups, pick your final four, your two finalists and the champion. The model simulates the tournament thousands of times and grades every call - the odds of each pick, the chance of a perfect bracket, and whether your bracket beats the favourites."
            cta="Build a bracket →"
            art={<BracketArt />}
          />
          <ModeCard
            reduce={!!reduce}
            onClick={() => setMode("h2h")}
            kicker="One match"
            title="Team vs Team"
            blurb="Put any two nations against each other and call the exact scoreline. Get the true odds of that result, the win/draw/loss split, both-teams-to-score and totals markets, the full scoreline map, then play the tie out through the real simulator."
            cta="Pick two teams →"
            art={<DuelArt />}
          />
        </div>
      )}

      {mode === "bracket" && <WholeBracket model={model} />}
      {mode === "h2h" && <TeamVsTeam model={model} />}
    </div>
  );
}

function ModeCard({
  kicker,
  title,
  blurb,
  cta,
  art,
  onClick,
  reduce,
}: {
  kicker: string;
  title: string;
  blurb: string;
  cta: string;
  art: JSX.Element;
  onClick: () => void;
  reduce: boolean;
}) {
  return (
    <motion.button
      className="pred-mode flat-card"
      onClick={onClick}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: EASE }}
      whileHover={reduce ? undefined : { y: -4 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
    >
      <div className="pred-mode__art" aria-hidden>
        {art}
      </div>
      <div className="pred-mode__body">
        <span className="eyebrow">{kicker}</span>
        <h3 className="anton">{title}</h3>
        <p>{blurb}</p>
        <span className="pred-mode__cta mono">{cta}</span>
      </div>
    </motion.button>
  );
}

function BracketArt() {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M6 14h16M6 30h16M22 14v16M22 22h12" />
      <path d="M6 50h16M6 66h16M22 50v16M22 58h12" />
      <path d="M34 22v36M34 40h12" />
      <path d="M74 14H58M74 30H58M58 14v16M58 22H46" />
      <path d="M74 50H58M74 66H58M58 50v16M58 58H46" />
      <path d="M46 22v36M46 40H34" />
      <circle cx="40" cy="40" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DuelArt() {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="8" y="22" width="26" height="36" />
      <rect x="46" y="22" width="26" height="36" />
      <line x1="40" y1="14" x2="40" y2="66" strokeDasharray="3 4" />
      <circle cx="40" cy="40" r="6" />
      <path d="M21 22v36M59 22v36" opacity="0.5" />
    </svg>
  );
}
