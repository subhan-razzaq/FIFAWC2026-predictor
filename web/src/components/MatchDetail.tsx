// Expanded match detail: the model's pre-match scoreline odds (with the actual
// result marked), a two-sided broadcast timeline (goals, bookings, subs with
// minutes), and a FotMob-style lineup pitch with per-player match ratings. The
// forecast is driven by the same Dixon-Coles maths as the engine; the timeline,
// lineups and ratings come from the deterministic enrichment layer.

import { useMemo, useState } from "react";
import type { EnrichedMatch, MatchEvent, Model } from "@weltmeister/sim";
import { createPredictor } from "../lib/predict";
import { ScoreHeatmap } from "./ScoreHeatmap";
import { LineupPitch } from "./LineupPitch";
import { BallIcon, CardIcon, SubIcon } from "./icons";

interface Props {
  enriched: EnrichedMatch;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  groupOf: Map<string, string>;
  model: Model;
}

export function MatchDetail({ enriched, homeTeam, awayTeam, homeGoals, awayGoals, model }: Props) {
  const [side, setSide] = useState<"home" | "away">("home");

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

      <div className="mdt__lineups-section">
        <div className="mdt__lineup-toggle">
          <button className={`mdt__lineup-tab ${side === "home" ? "active" : ""}`} onClick={() => setSide("home")} aria-pressed={side === "home"}>
            {homeTeam}
          </button>
          <button className={`mdt__lineup-tab ${side === "away" ? "active" : ""}`} onClick={() => setSide("away")} aria-pressed={side === "away"}>
            {awayTeam}
          </button>
        </div>
        <LineupPitch
          lineup={side === "home" ? enriched.home : enriched.away}
          events={enriched.events}
          side={side}
          team={side === "home" ? homeTeam : awayTeam}
        />
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
  if (type === "goal")
    return (
      <span className="mdt__icon">
        <BallIcon size={13} />
      </span>
    );
  if (type === "yellow")
    return (
      <span className="mdt__icon">
        <CardIcon kind="yellow" />
      </span>
    );
  if (type === "red")
    return (
      <span className="mdt__icon">
        <CardIcon kind="red" />
      </span>
    );
  return (
    <span className="mdt__icon">
      <SubIcon />
    </span>
  );
}
