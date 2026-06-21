// A single team odds row: badge, name, a filled bar, and a count-up percentage.
// The fill animates from the left like a live broadcast stat.

import { CountUp } from "./CountUp";
import { TeamBadge } from "./TeamBadge";
import { oddsPct } from "../lib/format";

interface Props {
  team: string;
  group?: string;
  value: number;
  max?: number;
  accent?: string;
  rank?: number;
}

export function OddsRow({ team, group, value, max = 1, accent = "var(--gold)", rank }: Props) {
  const w = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="odds-row">
      {rank !== undefined && <span className="odds-row__rank mono">{rank}</span>}
      <TeamBadge team={team} group={group} size={22} />
      <span className="odds-row__name">{team}</span>
      <span className="odds-row__bar">
        <span style={{ width: `${w}%`, background: accent }} />
      </span>
      <CountUp className="mono odds-row__val" value={value} format={oddsPct} />
    </div>
  );
}
