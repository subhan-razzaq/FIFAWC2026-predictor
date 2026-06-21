import { useMemo } from "react";
import type { GroupFixture, Model } from "@weltmeister/sim";
import { createPredictor } from "../../lib/predict";
import { ProbBar } from "../../components/ProbBar";
import { TeamBadge } from "../../components/TeamBadge";
import { teamCode } from "../../lib/teamCode";

interface Props {
  model: Model;
  fixture: GroupFixture;
}

export function MatchCard({ model, fixture }: Props) {
  const predictor = useMemo(() => createPredictor(model), [model]);
  const p = predictor.match(fixture.home, fixture.away, fixture.host_home, fixture.host_away);
  const group = fixture.group;

  return (
    <div className="match-card flat-card">
      <div className="match-card__head mono">
        <span>Matchday {fixture.matchday}</span>
        <span>xG {p.lamH.toFixed(2)} – {p.lamA.toFixed(2)}</span>
      </div>

      <div className="match-card__teams">
        <div className="match-card__team">
          <TeamBadge team={fixture.home} group={group} size={32} />
          <span className="match-card__name">{teamCode(fixture.home)}</span>
        </div>
        <div className="match-card__score anton">
          {p.modal.x}
          <span className="match-card__dash">:</span>
          {p.modal.y}
        </div>
        <div className="match-card__team match-card__team--away">
          <span className="match-card__name">{teamCode(fixture.away)}</span>
          <TeamBadge team={fixture.away} group={group} size={32} />
        </div>
      </div>

      <ProbBar win={p.win} draw={p.draw} loss={p.loss} homeLabel={teamCode(fixture.home)} awayLabel={teamCode(fixture.away)} />

      <div className="match-card__scores">
        <span className="eyebrow">likely scorelines</span>
        <div className="match-card__chips">
          {p.topScores.map((s) => (
            <span key={`${s.x}-${s.y}`} className="mono chip">
              {s.x}-{s.y}
              <em>{Math.round(s.p * 100)}%</em>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
