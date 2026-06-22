// Manager Mode: take one nation through the World Cup a match at a time. Set the
// shape and tactics, scout the opponent, play the game, manage stamina and
// suspensions across the run, and finish with a manager grade.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useStore } from "../../store/store";
import { Confetti } from "../../components/Confetti";
import { DragPitch } from "./DragPitch";
import { TacticsPanel } from "./TacticsPanel";
import { ScoutCard } from "./ScoutCard";
import { GradeScreen } from "./GradeScreen";
import { TournamentPanel } from "./TournamentPanel";
import { MatchResultCard } from "../../components/MatchResultCard";
import { TeamBadge } from "../../components/TeamBadge";
import { oddsPct } from "../../lib/format";
import type { CareerState } from "../../store/store";
import type { Model, TeamOdds } from "@weltmeister/sim";
import "./manage.css";

const STAGE_HEAD: Record<string, string> = {
  group: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

export function ManageView() {
  const model = useStore((s) => s.model);
  const seed = useStore((s) => s.seed);
  const career = useStore((s) => s.career);
  const startCareer = useStore((s) => s.startCareer);
  const resetCareer = useStore((s) => s.resetCareer);

  const teamsSorted = useMemo(
    () => [...(model?.teams ?? [])].sort((a, b) => b.rating - a.rating),
    [model],
  );
  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of model?.teams ?? []) m.set(t.name, t.group);
    return m;
  }, [model]);

  if (!model) return null;

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Manager mode</div>
          <h2>Play the World Cup</h2>
        </div>
        <div className="manage-topbar">
          {career && (
            <button className="btn btn--ghost manage-quit" onClick={resetCareer}>
              {career.phase === "ended" ? "New game" : "Quit"}
            </button>
          )}
          <select
            className="team-select"
            value={career?.team ?? ""}
            onChange={(e) => e.target.value && startCareer(e.target.value)}
            aria-label="Choose a team to manage"
          >
            <option value="">Choose a nation…</option>
            {teamsSorted.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!career ? (
        <Intro />
      ) : career.phase === "ended" && career.outcome ? (
        <GradeScreen
          team={career.team}
          group={groupOf.get(career.team)}
          reached={career.outcome.reached}
          isChampion={career.outcome.isChampion}
          projection={career.projection}
          played={career.played}
          onRestart={resetCareer}
        />
      ) : (
        <Active model={model} seed={seed} career={career} groupOf={groupOf} />
      )}
    </div>
  );
}

function Intro() {
  return (
    <div className="manage-intro">
      <p>
        Pick a nation and you take charge for the whole tournament. Pick the shape, drag your XI onto the
        pitch, set the tactics, and scout every opponent. Stamina drains and bookings stack across the
        month, so you'll have to rotate and adapt, then we'll grade your run against what the model expected.
      </p>
    </div>
  );
}

function Active({
  model,
  seed,
  career,
  groupOf,
}: {
  model: Model;
  seed: number;
  career: CareerState;
  groupOf: Map<string, string>;
}) {
  const setFormation = useStore((s) => s.setFormation);
  const setEleven = useStore((s) => s.setEleven);
  const setDraft = useStore((s) => s.setDraft);
  const playCurrentMatch = useStore((s) => s.playCurrentMatch);
  const continueCareer = useStore((s) => s.continueCareer);

  const { team, current, draft, phase, lastResult } = career;
  const squad = model.squads[team]!;

  if (phase === "result" && lastResult) {
    const r = lastResult.result;
    const won = r.winner ? r.winner === team : (r.home === team ? r.homeGoals > r.awayGoals : r.awayGoals > r.homeGoals);
    const drew = !r.winner && r.homeGoals === r.awayGoals;
    const verdict = won ? "Win" : drew ? "Draw" : "Defeat";
    return (
      <div className="manage-result">
        {won && <Confetti />}
        <div className={`manage-result__banner ${won ? "win" : drew ? "draw" : "loss"}`}>
          <motion.div
            className="manage-result__verdict anton"
            initial={{ scale: 0.5, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
          >
            {verdict}
          </motion.div>
          <div className="manage-result__sub mono">{STAGE_HEAD[lastResult.info.stage]}</div>
        </div>
        <MatchResultCard
          match={r}
          groupOf={groupOf}
          showStage
          model={model}
          seed={seed}
          elevenOverride={{ [team]: lastResult.settings.eleven }}
          formationOverride={{ [team]: lastResult.settings.formation }}
          captainOverride={{ [team]: lastResult.settings.captain }}
          penaltyOverride={{ [team]: lastResult.settings.penaltyTaker }}
        />
        <button className="btn manage-continue" onClick={continueCareer}>
          Continue
        </button>
        <Journey career={career} team={team} />
        <TournamentPanel model={model} seed={seed} career={career} groupOf={groupOf} />
      </div>
    );
  }

  if (!current || !draft) return null;
  const oppGroup = groupOf.get(current.opponent);

  return (
    <div>
      <div className="manage-matchbar flat-card">
        <span className="manage-matchbar__stage eyebrow">
          {STAGE_HEAD[current.stage]}
          {current.matchday ? ` · Matchday ${current.matchday}` : ""}
        </span>
        <div className="manage-matchbar__teams">
          <span className="manage-matchbar__team">
            <TeamBadge team={team} group={groupOf.get(team)} size={24} />
            {team}
          </span>
          <span className="manage-matchbar__v anton">vs</span>
          <span className="manage-matchbar__team manage-matchbar__team--opp">
            {current.opponent}
            <TeamBadge team={current.opponent} group={oppGroup} size={24} />
          </span>
        </div>
      </div>

      <div className="manage-play">
        <div className="manage-play__pitch">
          <DragPitch
            squad={squad}
            eleven={draft.eleven}
            formation={draft.formation}
            captain={draft.captain}
            penaltyTaker={draft.penaltyTaker}
            states={career.playerStates}
            onChange={setEleven}
          />
        </div>

        <div className="manage-play__side">
          <ScoutCard model={model} opponent={current.opponent} group={oppGroup} />
          <TacticsPanel
            model={model}
            team={team}
            draft={draft}
            states={career.playerStates}
            onFormation={setFormation}
            onPatch={setDraft}
          />
          <button className="btn manage-play__go" onClick={playCurrentMatch}>
            Play match
          </button>
          <Projection projection={career.projection} />
        </div>
      </div>

      <Journey career={career} team={team} />
      <TournamentPanel model={model} seed={seed} career={career} groupOf={groupOf} />
    </div>
  );
}

function Projection({ projection }: { projection: TeamOdds | null }) {
  if (!projection) return null;
  return (
    <div className="manage-proj">
      <div className="eyebrow">Pre-tournament projection</div>
      <div className="manage-proj__row mono">
        <span>Advance</span>
        <span>{oddsPct(projection.advance)}</span>
      </div>
      <div className="manage-proj__row mono">
        <span>Reach semi</span>
        <span>{oddsPct(projection.semi)}</span>
      </div>
      <div className="manage-proj__row mono">
        <span>Win it</span>
        <span>{oddsPct(projection.champion)}</span>
      </div>
    </div>
  );
}

function Journey({ career, team }: { career: CareerState; team: string }) {
  if (career.played.length === 0) return null;
  return (
    <div className="manage-journey">
      <div className="eyebrow">Your run so far</div>
      <div className="manage-journey__row">
        {career.played.map((p, i) => {
          const r = p.result;
          const tg = r.home === team ? r.homeGoals : r.awayGoals;
          const og = r.home === team ? r.awayGoals : r.homeGoals;
          const opp = r.home === team ? r.away : r.home;
          const won = r.winner ? r.winner === team : tg > og;
          const drew = !r.winner && tg === og;
          return (
            <div key={i} className={`manage-journey__pip ${won ? "win" : drew ? "draw" : "loss"}`} title={`${STAGE_HEAD[p.info.stage]} vs ${opp}`}>
              <span className="mono">{tg}-{og}</span>
              <span className="manage-journey__opp">{opp}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
