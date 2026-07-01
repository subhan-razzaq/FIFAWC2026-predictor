// The closing ceremony. Once a run ends we hand out the tournament's individual
// awards, each one a faux-3D trophy beside the winner's photo, then lay out the team
// of the tournament on a pitch. Winners are computed across the WHOLE competition: a
// full simulation of every match on the run's seed, with the manager's actual results
// spliced in, so the Golden Boot can belong to any nation, not just the user's.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { runSingle, type Model } from "@weltmeister/sim";
import type { PlayedMatch } from "../../store/store";
import { type AwardWinner } from "../../lib/awards";
import { competitionAwards, competitionBracket } from "../../lib/competition";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { TeamBadge } from "../../components/TeamBadge";
import { AwardTrophy } from "./AwardTrophy";
import { ResultsBracket } from "./ResultsBracket";
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

export function AwardsCeremony({
  model,
  seed,
  played,
  groupOf,
}: {
  model: Model;
  seed: number;
  played: PlayedMatch[];
  groupOf: Map<string, string>;
}) {
  // a full tournament on this seed (with the manager's real results spliced in) gives
  // every nation's scorers and ratings, so the awards span the whole competition
  const { awards, bracket } = useMemo(() => {
    const full = runSingle(model, seed);
    return { awards: competitionAwards(model, seed, full, played), bracket: competitionBracket(full, played) };
  }, [model, seed, played]);
  if (played.length === 0) return null;
  const f = FORMATIONS["4-3-3"]!;
  const hasKnockouts = Object.values(bracket.slots).some((s) => s.played);

  return (
    <div className="awards">
      {(bracket.champion || bracket.third) && (
        <div className="podium">
          <div className="eyebrow">Final standings</div>
          <div className="podium__row">
            {bracket.runnerUp && <PodiumStep place={2} team={bracket.runnerUp} groupOf={groupOf} />}
            {bracket.champion && <PodiumStep place={1} team={bracket.champion} groupOf={groupOf} />}
            {bracket.third && <PodiumStep place={3} team={bracket.third} groupOf={groupOf} />}
          </div>
        </div>
      )}

      {hasKnockouts && (
        <div className="awards__bracket">
          <div className="eyebrow">The road to the final</div>
          <ResultsBracket bracket={bracket} groupOf={groupOf} />
        </div>
      )}

      <div className="awards__head">
        <span className="eyebrow">Tournament awards · the whole World Cup</span>
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
                <div key={`${slot.player}-${i}`} className="awards__totw-player" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                  <span className="awards__totw-face" style={{ borderColor: RING[slot.pos] ?? "var(--steel)" }}>
                    <span className="awards__totw-clip">
                      <PlayerAvatar photo={slot.photo} name={slot.player} />
                    </span>
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

function PodiumStep({ place, team, groupOf }: { place: 1 | 2 | 3; team: string; groupOf: Map<string, string> }) {
  const label = place === 1 ? "Champions" : place === 2 ? "Runners-up" : "Third place";
  return (
    <motion.div
      className={`podium__step podium__step--${place}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: place === 1 ? 0.1 : place === 2 ? 0.25 : 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="podium__medal mono">{place}</div>
      <TeamBadge team={team} group={groupOf.get(team)} size={place === 1 ? 44 : 34} />
      <div className="podium__team anton">{team}</div>
      <div className="podium__label eyebrow">{label}</div>
      <div className="podium__block" />
    </motion.div>
  );
}

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}
