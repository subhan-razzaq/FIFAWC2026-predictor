import type { Squad, SquadPlayer } from "@weltmeister/sim";
import { FORMATIONS } from "../../lib/manage";

interface Props {
  squad: Squad;
  eleven: string[];
  formation: string;
  group: string;
  captain: string;
  penaltyTaker: string;
  selected: string | null;
  onSelectSlot: (player: string) => void;
}

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

export function FormationPitch({
  squad,
  eleven,
  formation,
  captain,
  penaltyTaker,
  selected,
  onSelectSlot,
}: Props) {
  const f = FORMATIONS[formation] ?? FORMATIONS["4-3-3"]!;
  const byName = new Map<string, SquadPlayer>(squad.players.map((p) => [p.name, p]));

  return (
    <div className="pitch" role="group" aria-label={`${squad.team} formation ${formation}`}>
      <svg viewBox="0 0 100 100" className="pitch__lines" aria-hidden preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--line)" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="var(--line)" />
        <circle cx="50" cy="50" r="9" fill="none" stroke="var(--line)" />
        <rect x="30" y="0" width="40" height="14" fill="none" stroke="var(--line)" />
        <rect x="30" y="86" width="40" height="14" fill="none" stroke="var(--line)" />
      </svg>
      {eleven.map((name, i) => {
        const slot = f.slots[i] ?? { x: 50, y: 50 };
        const p = byName.get(name);
        const isSel = selected === name;
        return (
          <button
            key={name}
            className={`pitch__player ${isSel ? "sel" : ""}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            onClick={() => onSelectSlot(name)}
            aria-pressed={isSel}
            title={p ? `${name} — ${p.club}` : name}
          >
            <span className="pitch__dot">
              {name === captain && <em className="pitch__cap">C</em>}
              {name === penaltyTaker && <em className="pitch__pk">P</em>}
            </span>
            <span className="pitch__name">{lastName(name)}</span>
          </button>
        );
      })}
    </div>
  );
}
