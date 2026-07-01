// The tournament hub: a live, competition-wide view the manager can open at any
// time, the way a career mode lets you follow the whole tournament. It shows every
// award race (Golden Boot, Golden Ball, Golden Glove, Best Young Player) across all
// 48 nations and every result so far, revealed in step with the run.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { runSingle, type Model, type MatchResult } from "@weltmeister/sim";
import type { CareerState } from "../../store/store";
import { competitionState, type RaceEntry } from "../../lib/competition";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { TeamBadge } from "../../components/TeamBadge";
import { teamCode } from "../../lib/teamCode";

type RaceKey = "goldenBoot" | "goldenBall" | "goldenGlove" | "youngPlayer";

const RACES: { key: RaceKey; label: string; unit: string }[] = [
  { key: "goldenBoot", label: "Golden Boot", unit: "goals" },
  { key: "goldenBall", label: "Golden Ball", unit: "rating" },
  { key: "goldenGlove", label: "Golden Glove", unit: "clean sheets" },
  { key: "youngPlayer", label: "Young Player", unit: "rating" },
];

export function TournamentHub({
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
  const [race, setRace] = useState<RaceKey>("goldenBoot");
  const [view, setView] = useState<"races" | "results">("races");

  const state = useMemo(() => {
    const full = runSingle(model, seed);
    return competitionState(model, seed, full, career.played);
  }, [model, seed, career.played]);

  if (career.played.length === 0) {
    return (
      <div className="thub thub--empty mono">
        Play your first match to start following the tournament. Every other result and the award races
        will fill in as the World Cup unfolds.
      </div>
    );
  }

  const rows = state[race];
  const activeRace = RACES.find((r) => r.key === race)!;

  return (
    <div className="thub">
      <div className="thub__switch">
        <button className={`thub__seg ${view === "races" ? "is-on" : ""}`} onClick={() => setView("races")}>
          Award races
        </button>
        <button className={`thub__seg ${view === "results" ? "is-on" : ""}`} onClick={() => setView("results")}>
          All results
        </button>
      </div>

      {view === "races" ? (
        <div className="thub__races">
          <div className="thub__tabs">
            {RACES.map((r) => (
              <button key={r.key} className={`thub__tab ${race === r.key ? "is-on" : ""}`} onClick={() => setRace(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="thub__lead-label eyebrow">
            {activeRace.label} race · across all 48 nations
          </div>
          <AnimatePresence mode="wait">
            <motion.ol
              key={race}
              className="thub__race"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {rows.length === 0 ? (
                <li className="thub__none mono">No entries yet.</li>
              ) : (
                rows.map((e, i) => <RaceRow key={`${e.team}-${e.player}`} entry={e} rank={i + 1} unit={activeRace.unit} groupOf={groupOf} />)
              )}
            </motion.ol>
          </AnimatePresence>
        </div>
      ) : (
        <div className="thub__results">
          {state.results.map((block) => (
            <div key={block.stage} className="thub__resblock">
              <div className="eyebrow thub__resstage">{block.label}</div>
              <div className="thub__resgrid">
                {block.matches.map((m, i) => (
                  <ResultRow key={`${m.home}-${m.away}-${i}`} match={m} groupOf={groupOf} highlight={career.team} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RaceRow({ entry, rank, unit, groupOf }: { entry: RaceEntry; rank: number; unit: string; groupOf: Map<string, string> }) {
  const shown = unit === "rating" ? entry.value.toFixed(2) : String(entry.value);
  return (
    <motion.li layout className={`thub__row ${rank === 1 ? "is-leader" : ""}`}>
      <span className="thub__rank mono">{rank}</span>
      <span className="thub__face">
        <span className="thub__face-clip">
          <PlayerAvatar photo={entry.photo} name={entry.player} />
        </span>
      </span>
      <span className="thub__who">
        <span className="thub__player">{entry.player}</span>
        <span className="thub__detail mono">{entry.detail}</span>
      </span>
      <span className="thub__team">
        <TeamBadge team={entry.team} group={groupOf.get(entry.team)} size={16} />
        <span className="mono">{teamCode(entry.team)}</span>
      </span>
      <span className="thub__val mono">{shown}</span>
    </motion.li>
  );
}

function ResultRow({ match, groupOf, highlight }: { match: MatchResult; groupOf: Map<string, string>; highlight: string }) {
  const mine = match.home === highlight || match.away === highlight;
  const pens = match.shootout ? ` (${match.shootout.home}-${match.shootout.away}p)` : match.afterExtraTime ? " aet" : "";
  return (
    <div className={`thub__res ${mine ? "is-mine" : ""}`}>
      <span className="thub__res-team thub__res-team--home">
        <span className="thub__res-name">{teamCode(match.home)}</span>
        <TeamBadge team={match.home} group={groupOf.get(match.home)} size={16} />
      </span>
      <span className="thub__res-score mono">
        {match.homeGoals}-{match.awayGoals}
        {pens && <span className="thub__res-pens">{pens}</span>}
      </span>
      <span className="thub__res-team thub__res-team--away">
        <TeamBadge team={match.away} group={groupOf.get(match.away)} size={16} />
        <span className="thub__res-name">{teamCode(match.away)}</span>
      </span>
    </div>
  );
}
