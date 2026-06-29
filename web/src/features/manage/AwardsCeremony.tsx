// The closing ceremony. Once a run ends we hand out the individual awards, each one
// a faux-3D trophy beside the winner's photo, then lay out the team of the
// tournament on a pitch. Every winner is computed from the manager's real run.

import { motion } from "framer-motion";
import type { Model } from "@weltmeister/sim";
import type { PlayedMatch } from "../../store/store";
import { computeAwards, type AwardWinner } from "../../lib/awards";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { AwardTrophy } from "./AwardTrophy";
import { FORMATIONS } from "../../lib/manage";

const RING: Record<string, string> = {
  GK: "var(--gold)",
  DF: "var(--usa-blue)",
  MF: "var(--mex-green)",
  FW: "var(--can-red)",
};

function AwardCard({
  title,
  kind,
  metal,
  winner,
  delay,
}: {
  title: string;
  kind: "boot" | "ball" | "glove" | "young";
  metal?: "gold" | "silver";
  winner?: AwardWinner;
  delay: number;
}) {
  if (!winner) return null;
  return (
    <motion.div
      className="award-card flat-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="award-card__trophy">
        <AwardTrophy kind={kind} metal={metal} size={92} />
      </div>
      <div className="award-card__win">
        <span className="award-card__face">
          <PlayerAvatar photo={winner.photo} name={winner.player} />
        </span>
        <div className="award-card__copy">
          <div className="eyebrow">{title}</div>
          <div className="award-card__name anton">{winner.player}</div>
          <div className="award-card__detail mono">{winner.detail}</div>
        </div>
      </div>
    </motion.div>
  );
}

export function AwardsCeremony({ model, team, played }: { model: Model; team: string; played: PlayedMatch[] }) {
  if (played.length === 0) return null;
  const awards = computeAwards(model, team, played);
  const f = FORMATIONS["4-3-3"]!;

  return (
    <div className="awards">
      <div className="awards__head">
        <span className="eyebrow">Tournament awards</span>
        <h3 className="anton">The honours</h3>
      </div>

      <div className="awards__grid">
        <AwardCard title="Golden Boot" kind="boot" winner={awards.goldenBoot} delay={0.05} />
        <AwardCard title="Golden Ball" kind="ball" winner={awards.goldenBall} delay={0.15} />
        <AwardCard title="Golden Glove" kind="glove" winner={awards.goldenGlove} delay={0.25} />
        <AwardCard title="Best Young Player" kind="young" metal="silver" winner={awards.youngPlayer} delay={0.35} />
      </div>

      {awards.teamOfTournament.length >= 11 && (
        <div className="awards__totw">
          <span className="eyebrow">Team of the tournament</span>
          <div className="awards__pitch">
            <svg viewBox="0 0 100 130" className="awards__pitch-lines" preserveAspectRatio="none" aria-hidden>
              <rect x="1" y="1" width="98" height="128" fill="none" stroke="rgba(246,244,239,0.16)" />
              <line x1="1" y1="65" x2="99" y2="65" stroke="rgba(246,244,239,0.16)" />
              <circle cx="50" cy="65" r="11" fill="none" stroke="rgba(246,244,239,0.16)" />
            </svg>
            {awards.teamOfTournament.map((slot, i) => {
              const pos = f.slots[i] ?? { x: 50, y: 50 };
              return (
                <div key={slot.player} className="awards__totw-player" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                  <span className="awards__totw-face" style={{ borderColor: RING[slot.pos] ?? "var(--steel)" }}>
                    <PlayerAvatar photo={slot.photo} name={slot.player} />
                    <span className="awards__totw-rating mono">{slot.rating.toFixed(1)}</span>
                  </span>
                  <span className="awards__totw-name">{lastName(slot.player)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}
