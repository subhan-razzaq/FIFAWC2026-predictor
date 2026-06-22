// End-of-run manager dashboard: an A–F grade relative to the team's own
// expectations, plus top scorer, impact subs and a game-by-game recap.

import { motion } from "framer-motion";
import type { EnrichedMatch, MatchResult, TeamOdds } from "@weltmeister/sim";
import { gradeRun, impactSubs, tournamentScorers } from "../../lib/grade";
import { TeamBadge } from "../../components/TeamBadge";
import { Confetti } from "../../components/Confetti";
import { Trophy } from "../bracket/Trophy";
import { STAGE_LABEL } from "../../lib/format";
import type { PlayedMatch } from "../../store/store";

const STAT_VARIANT = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

interface Props {
  team: string;
  group?: string;
  reached: "group" | "R32" | "R16" | "QF" | "SF" | "third_place" | "final";
  isChampion: boolean;
  projection: TeamOdds | null;
  played: PlayedMatch[];
  onRestart: () => void;
}

export function GradeScreen({ team, group, reached, isChampion, projection, played, onRestart }: Props) {
  const grade = gradeRun(reached, isChampion, projection ?? undefined);
  const results: MatchResult[] = played.map((p) => p.result);
  const enriched: EnrichedMatch[] = played.map((p) => p.enriched);
  const scorers = tournamentScorers(results, team).slice(0, 5);
  const subs = impactSubs(enriched, team);
  const subGoals = subs.reduce((s, x) => s + x.goals, 0);

  return (
    <div className="grade">
      {isChampion && <Confetti count={36} />}
      {isChampion && (
        <div className="grade__trophy">
          <Trophy champion={team} group={group} locked />
        </div>
      )}
      <div className="grade__hero">
        <motion.div
          className={`grade__letter anton ${isChampion ? "champ" : ""}`}
          initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
        >
          {grade.grade}
        </motion.div>
        <div className="grade__hero-copy">
          <div className="grade__head">
            <TeamBadge team={team} group={group} size={30} />
            <span className="anton">{team}</span>
          </div>
          <div className="grade__verdict">{grade.reachedLabel}</div>
          <p className="mono grade__summary">{grade.summary}</p>
          <p className="mono grade__bench">
            Expected depth {grade.expected.toFixed(1)} · achieved {grade.achieved.toFixed(1)} (rounds survived vs the model's projection)
          </p>
        </div>
      </div>

      <motion.div
        className="grade__stats"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
      >
        <motion.div className="grade__stat flat-card" variants={STAT_VARIANT}>
          <div className="eyebrow">Top scorer</div>
          {scorers.length > 0 ? (
            <>
              <div className="grade__stat-big anton">{scorers[0]!.player}</div>
              <div className="mono grade__stat-sub">{scorers[0]!.goals} goals</div>
            </>
          ) : (
            <div className="mono grade__stat-sub">no goals scored</div>
          )}
        </motion.div>
        <motion.div className="grade__stat flat-card" variants={STAT_VARIANT}>
          <div className="eyebrow">Impact subs</div>
          <div className="grade__stat-big anton">{subGoals}</div>
          <div className="mono grade__stat-sub">
            {subGoals === 0 ? "no goals off the bench" : `${subs[0]!.player} led with ${subs[0]!.goals}`}
          </div>
        </motion.div>
        <motion.div className="grade__stat flat-card" variants={STAT_VARIANT}>
          <div className="eyebrow">Matches</div>
          <div className="grade__stat-big anton">{played.length}</div>
          <div className="mono grade__stat-sub">
            {played.filter((p) => didWin(p, team)).length}W · played in this run
          </div>
        </motion.div>
      </motion.div>

      {scorers.length > 1 && (
        <div className="grade__scorers">
          <div className="eyebrow">Your scorers</div>
          {scorers.map((s) => (
            <div key={s.player} className="grade__scorer-row mono">
              <span>{s.player}</span>
              <span>{s.goals}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grade__recap">
        <div className="eyebrow">The road</div>
        {played.map((p, i) => {
          const tg = p.result.home === team ? p.result.homeGoals : p.result.awayGoals;
          const og = p.result.home === team ? p.result.awayGoals : p.result.homeGoals;
          const opp = p.result.home === team ? p.result.away : p.result.home;
          return (
            <div key={i} className="grade__recap-row mono">
              <span className="grade__recap-stage">{STAGE_LABEL[p.info.stage] ?? p.info.stage}</span>
              <span className="grade__recap-opp">vs {opp}</span>
              <span className={`grade__recap-score ${didWin(p, team) ? "win" : tg === og ? "" : "loss"}`}>
                {tg}–{og}
                {p.result.shootout ? ` (${p.result.shootout.home}-${p.result.shootout.away}p)` : ""}
              </span>
            </div>
          );
        })}
      </div>

      <button className="btn grade__restart" onClick={onRestart}>
        Take another nation
      </button>
    </div>
  );
}

function didWin(p: PlayedMatch, team: string): boolean {
  const r = p.result;
  if (r.winner) return r.winner === team;
  const tg = r.home === team ? r.homeGoals : r.awayGoals;
  const og = r.home === team ? r.awayGoals : r.homeGoals;
  return tg > og;
}
