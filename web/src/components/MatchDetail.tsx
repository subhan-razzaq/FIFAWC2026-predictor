// Expanded match detail: the model's pre-match scoreline odds (with the actual
// result marked), a two-sided broadcast timeline (goals, bookings, subs with
// minutes), and both starting elevens grouped by line. The forecast is driven by
// the same Dixon-Coles maths as the engine; the timeline and lineups come from the
// deterministic enrichment layer.

import { useMemo } from "react";
import type { EnrichedMatch, MatchEvent, MatchLineup, Model } from "@weltmeister/sim";
import { createPredictor } from "../lib/predict";
import { ScoreHeatmap } from "./ScoreHeatmap";
import { TeamBadge } from "./TeamBadge";

interface Props {
  enriched: EnrichedMatch;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  groupOf: Map<string, string>;
  model: Model;
}

const LINES: ("GK" | "DF" | "MF" | "FW")[] = ["GK", "DF", "MF", "FW"];

export function MatchDetail({ enriched, homeTeam, awayTeam, homeGoals, awayGoals, groupOf, model }: Props) {
  const forecast = useMemo(() => {
    const hosts = new Set(model.meta.hosts);
    return createPredictor(model).match(homeTeam, awayTeam, hosts.has(homeTeam), hosts.has(awayTeam));
  }, [model, homeTeam, awayTeam]);

  return (
    <div className="mdt">
      <div className="mdt__forecast">
        <ScoreHeatmap
          grid={forecast.grid}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          modal={forecast.modal}
          actual={{ x: homeGoals, y: awayGoals }}
        />
        <div className="mdt__forecast-info">
          <span className="eyebrow">Model&rsquo;s pre-match scoreline odds</span>
          <p className="mono">
            Most likely <strong>{forecast.modal.x}&ndash;{forecast.modal.y}</strong> ({Math.round(forecast.modal.p * 100)}%).
            This run finished <strong>{homeGoals}&ndash;{awayGoals}</strong>.
          </p>
          <p className="mono mdt__forecast-key">
            <span className="mdt__key mdt__key--modal" /> most likely
            <span className="mdt__key mdt__key--actual" /> actual
          </p>
        </div>
      </div>

      {enriched.events.length > 0 && (
        <ol className="mdt__timeline">
          {enriched.events.map((e, i) => (
            <li key={i} className="mdt__row">
              <span className="mdt__cell mdt__cell--home">{e.side === "home" && <EventBody e={e} side="home" />}</span>
              <span className="mdt__min mono">{e.minute}&prime;</span>
              <span className="mdt__cell mdt__cell--away">{e.side === "away" && <EventBody e={e} side="away" />}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mdt__lineups">
        <Lineup lu={enriched.home} team={homeTeam} group={groupOf.get(homeTeam)} align="left" />
        <Lineup lu={enriched.away} team={awayTeam} group={groupOf.get(awayTeam)} align="right" />
      </div>
    </div>
  );
}

function EventBody({ e, side }: { e: MatchEvent; side: "home" | "away" }) {
  const icon = <EventIcon type={e.type} />;
  let label: JSX.Element;
  if (e.type === "goal") {
    const tag = e.kind === "penalty" ? " (pen)" : e.kind === "own" ? " (og)" : "";
    label = (
      <span className="mdt__text">
        <span className="mdt__player">
          {e.player}
          {tag}
        </span>
        {e.assist && <span className="mdt__sub-name">{e.assist}</span>}
      </span>
    );
  } else if (e.type === "sub") {
    label = (
      <span className="mdt__text">
        <span className="mdt__player">{e.playerOn}</span>
        <span className="mdt__sub-name">{e.player}</span>
      </span>
    );
  } else {
    label = (
      <span className="mdt__text">
        <span className="mdt__player">{e.player}</span>
      </span>
    );
  }
  // home events read text-then-icon (icon toward the centre); away the reverse
  return side === "home" ? (
    <>
      {label}
      {icon}
    </>
  ) : (
    <>
      {icon}
      {label}
    </>
  );
}

function EventIcon({ type }: { type: MatchEvent["type"] }) {
  if (type === "goal") return <span className="mdt__icon mdt__icon--goal" aria-label="goal" />;
  if (type === "yellow") return <span className="mdt__icon mdt__icon--card mdt__icon--yellow" aria-label="yellow card" />;
  if (type === "red") return <span className="mdt__icon mdt__icon--card mdt__icon--red" aria-label="red card" />;
  return (
    <svg className="mdt__icon mdt__icon--sub" width="12" height="12" viewBox="0 0 12 12" aria-label="substitution">
      <path d="M3 7 L3 2 L1 2 L3.5 -0.5 L6 2 L4 2 L4 7 Z" transform="translate(0,1)" fill="var(--mex-green)" />
      <path d="M9 5 L9 10 L11 10 L8.5 12.5 L6 10 L8 10 L8 5 Z" transform="translate(0,-1)" fill="var(--can-red)" />
    </svg>
  );
}

function Lineup({
  lu,
  team,
  group,
  align,
}: {
  lu: MatchLineup;
  team: string;
  group?: string;
  align: "left" | "right";
}) {
  return (
    <div className={`mdt__lineup mdt__lineup--${align}`}>
      <div className="mdt__lineup-head">
        <TeamBadge team={team} group={group} size={20} />
        <span className="mdt__lineup-team">{team}</span>
        <span className="mono mdt__lineup-form">{lu.formation}</span>
      </div>
      {LINES.map((pos) => {
        const players = lu.starters.filter((s) => s.pos === pos);
        if (players.length === 0) return null;
        return (
          <div key={pos} className="mdt__line">
            <span className="mdt__line-tag mono">{pos}</span>
            <span className="mdt__line-names">
              {players.map((p) => (
                <span key={p.name} className="mdt__name">
                  {p.name}
                  {p.captain && <em className="mdt__badge mdt__badge--c">C</em>}
                  {p.penalty && <em className="mdt__badge mdt__badge--p">P</em>}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
