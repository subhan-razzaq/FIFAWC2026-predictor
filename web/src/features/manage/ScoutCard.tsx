// Pre-match scouting report on the AI opponent, built from real squad numbers.

import type { Model } from "@weltmeister/sim";
import { scoutTeam } from "../../lib/scouting";
import { TeamBadge } from "../../components/TeamBadge";

export function ScoutCard({ model, opponent, group }: { model: Model; opponent: string; group?: string }) {
  const r = scoutTeam(model, opponent);
  return (
    <div className="scout flat-card">
      <div className="scout__head">
        <TeamBadge team={opponent} group={group} size={26} />
        <div>
          <div className="eyebrow">Scout report</div>
          <div className="scout__headline">{r.headline}</div>
        </div>
      </div>

      <div className="scout__meters">
        <Meter label="Attack" value={r.attack} tag={r.threat} />
        <Meter label="Defence" value={r.defence} tag={r.solidity} />
      </div>

      <ul className="scout__bullets">
        {r.bullets.map((b, i) => (
          <li key={i} className="mono">{b}</li>
        ))}
      </ul>

      <div className="scout__counter">
        <span className="eyebrow">Counter</span>
        <p className="mono">{r.counter}</p>
      </div>
    </div>
  );
}

// the fitted ratings sit around ~1; map to a 0..100 bar for a quick read
function Meter({ label, value, tag }: { label: string; value: number; tag: string }) {
  const pct = Math.max(6, Math.min(100, (value / 1.6) * 100));
  return (
    <div className="scout__meter">
      <div className="scout__meter-top">
        <span>{label}</span>
        <span className="mono scout__meter-tag">{tag}</span>
      </div>
      <span className="scout__meter-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
