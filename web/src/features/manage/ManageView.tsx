// Manager Mode: take one nation through the World Cup a match at a time. Set the
// shape and tactics, scout the opponent, play the game, manage stamina and
// suspensions across the run, and finish with a manager grade.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../../store/store";
import { Confetti } from "../../components/Confetti";
import { DragPitch } from "./DragPitch";
import { TacticsPanel } from "./TacticsPanel";
import { ScoutCard } from "./ScoutCard";
import { MatchOdds } from "./MatchOdds";
import { MatchRatings } from "./MatchRatings";
import { ManagerIntro } from "./ManagerIntro";
import { GradeScreen } from "./GradeScreen";
import { TournamentPanel } from "./TournamentPanel";
import { TournamentStats } from "./TournamentStats";
import { LiveMatchCenter } from "./LiveMatchCenter";
import { MatchResultCard } from "../../components/MatchResultCard";
import { TeamBadge } from "../../components/TeamBadge";
import { oddsPct } from "../../lib/format";
import { buildEleven, rotatedEleven, REST_BELOW } from "../../lib/manage";
import { isAvailable, type PlayerStates } from "../../lib/cards";
import type { CareerState } from "../../store/store";
import type { Model, Squad, TeamOdds } from "@weltmeister/sim";
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
  const [confirmQuit, setConfirmQuit] = useState(false);

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
          {career &&
            (career.phase === "ended" ? (
              <button className="btn btn--ghost manage-quit" onClick={resetCareer}>
                New game
              </button>
            ) : confirmQuit ? (
              <span className="manage-quitconfirm">
                <span className="mono">Discard run?</span>
                <button className="btn btn--ghost manage-quit" onClick={() => setConfirmQuit(false)}>
                  Keep
                </button>
                <button
                  className="btn manage-quit"
                  onClick={() => {
                    setConfirmQuit(false);
                    resetCareer();
                  }}
                >
                  Quit
                </button>
              </span>
            ) : (
              <button className="btn btn--ghost manage-quit" onClick={() => setConfirmQuit(true)}>
                Quit
              </button>
            ))}
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
        <ManagerIntro model={model} onPick={startCareer} />
      ) : career.phase === "ended" && career.outcome ? (
        <GradeScreen
          model={model}
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
  const kickOff = useStore((s) => s.kickOff);
  const continueCareer = useStore((s) => s.continueCareer);

  const { team, current, draft, phase, lastResult } = career;
  const squad = model.squads[team]!;

  if ((phase === "live" || phase === "halftime") && career.live) {
    return (
      <div>
        <div className="manage-matchbar flat-card">
          <span className="manage-matchbar__stage eyebrow">
            {STAGE_HEAD[career.live.info.stage]}
            {career.live.info.matchday ? ` · Matchday ${career.live.info.matchday}` : ""}
          </span>
          <span className="manage-matchbar__live mono">● Live</span>
        </div>
        <LiveMatchCenter model={model} career={career} groupOf={groupOf} />
        <Journey career={career} team={team} />
        <TournamentPanel model={model} seed={seed} career={career} groupOf={groupOf} />
        <TournamentStats model={model} team={team} played={career.played} />
      </div>
    );
  }

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
          enriched={lastResult.enriched}
          elevenOverride={{ [team]: lastResult.settings.eleven }}
          formationOverride={{ [team]: lastResult.settings.formation }}
          captainOverride={{ [team]: lastResult.settings.captain }}
          penaltyOverride={{ [team]: lastResult.settings.penaltyTaker }}
        />
        <MatchRatings
          model={model}
          team={team}
          group={groupOf.get(team)}
          result={r}
          enriched={lastResult.enriched}
        />
        <button className="btn manage-continue" onClick={continueCareer}>
          Continue
        </button>
        <Journey career={career} team={team} />
        <TournamentPanel model={model} seed={seed} career={career} groupOf={groupOf} />
        <TournamentStats model={model} team={team} played={career.played} />
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
          <LineupTools
            squad={squad}
            formation={draft.formation}
            eleven={draft.eleven}
            states={career.playerStates}
            onPick={setEleven}
          />
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
          <MatchOdds model={model} team={team} current={current} draft={draft} states={career.playerStates} />
          <ScoutCard model={model} opponent={current.opponent} group={oppGroup} />
          <TacticsPanel
            model={model}
            team={team}
            draft={draft}
            states={career.playerStates}
            onFormation={setFormation}
            onPatch={setDraft}
          />
          <button className="btn manage-play__go" onClick={kickOff}>
            Kick off →
          </button>
          <Projection projection={career.projection} />
        </div>
      </div>

      <Journey career={career} team={team} />
      <TournamentPanel model={model} seed={seed} career={career} groupOf={groupOf} />
    </div>
  );
}

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

// Quick team-sheet actions plus the team news the rotation mechanic hinges on:
// who is suspended, who is one booking from a ban, and who is tiring in the XI.
// The actions disable themselves when they would change nothing, so a fresh,
// strongest-already XI reads as "all set" rather than a dead button.
function LineupTools({
  squad,
  formation,
  eleven,
  states,
  onPick,
}: {
  squad: Squad;
  formation: string;
  eleven: string[];
  states: PlayerStates;
  onPick: (eleven: string[]) => void;
}) {
  const startSet = new Set(eleven);
  const suspended = squad.players.filter((p) => !isAvailable(states, p.name));
  const onYellow = squad.players.filter((p) => (states[p.name]?.yellows ?? 0) >= 1 && isAvailable(states, p.name));
  const tiring = squad.players.filter((p) => startSet.has(p.name) && (states[p.name]?.stamina ?? 100) < REST_BELOW);

  const strongestXI = buildEleven(squad, formation, { exclude: new Set(suspended.map((p) => p.name)) });
  const sameAsNow = (xi: string[]) => xi.length === eleven.length && xi.every((n, i) => n === eleven[i]);
  const canStrongest = !sameAsNow(strongestXI);
  const canRotate = tiring.length > 0;

  const clear = suspended.length === 0 && onYellow.length === 0 && tiring.length === 0;

  return (
    <div className="lineup-tools">
      <div className="lineup-tools__actions">
        <button
          className="group-tab"
          style={{ width: "auto", padding: "0 12px" }}
          onClick={() => onPick(strongestXI)}
          disabled={!canStrongest}
          title={canStrongest ? "Field the strongest available XI" : "Already your strongest available XI"}
        >
          Strongest XI
        </button>
        <button
          className="group-tab"
          style={{ width: "auto", padding: "0 12px" }}
          onClick={() => onPick(rotatedEleven(squad, formation, states))}
          disabled={!canRotate}
          title={canRotate ? "Bench tiring starters for fresh legs" : "Nobody needs resting yet"}
        >
          Rest tired
        </button>
      </div>
      <div className="lnews mono">
        {clear ? (
          <span className="lnews__item lnews__item--ok">
            <b aria-hidden />Full squad fit and available
          </span>
        ) : (
          <>
            {suspended.length > 0 && (
              <span className="lnews__item lnews__item--out">
                <b aria-hidden />Suspended: {suspended.map((p) => lastName(p.name)).join(", ")}
              </span>
            )}
            {onYellow.length > 0 && (
              <span className="lnews__item lnews__item--warn">
                <b aria-hidden />A booking from a ban: {onYellow.map((p) => lastName(p.name)).join(", ")}
              </span>
            )}
            {tiring.length > 0 && (
              <span className="lnews__item lnews__item--tired">
                <b aria-hidden />Tiring: {tiring.map((p) => lastName(p.name)).join(", ")}
              </span>
            )}
          </>
        )}
      </div>
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
