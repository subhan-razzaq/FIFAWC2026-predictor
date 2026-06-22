// Drag-and-drop team sheet. Players are dragged between pitch slots and the bench
// with pointer events (works with mouse and touch, no library). Each slot's line
// comes from the formation, so dropping a striker into a defensive slot is allowed
// but flagged, the rating engine docks it. Dots also show stamina, bookings and
// suspensions so the manager can see who needs resting or is out of position.

import { useRef, useState } from "react";
import type { Squad, SquadPlayer } from "@weltmeister/sim";
import { FORMATIONS } from "../../lib/manage";
import { isOutOfPosition } from "../../lib/lineup";
import { staminaTier } from "../../lib/fatigue";
import { isAvailable, type PlayerStates } from "../../lib/cards";

interface Props {
  squad: Squad;
  eleven: string[];
  formation: string;
  captain: string;
  penaltyTaker: string;
  states: PlayerStates;
  onChange: (eleven: string[]) => void;
}

type DropTarget = { kind: "slot"; i: number } | { kind: "bench"; name: string } | null;
type DragSource = { kind: "slot"; i: number; name: string } | { kind: "bench"; name: string };

// position-coloured ring, matching the match-lineup tokens used elsewhere
const RING: Record<string, string> = {
  GK: "var(--gold)",
  DF: "var(--usa-blue)",
  MF: "var(--mex-green)",
  FW: "var(--can-red)",
};

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

export function DragPitch({ squad, eleven, formation, captain, penaltyTaker, states, onChange }: Props) {
  const f = FORMATIONS[formation] ?? FORMATIONS["4-3-3"]!;
  const byName = new Map<string, SquadPlayer>(squad.players.map((p) => [p.name, p]));
  const startSet = new Set(eleven);

  const benchByPos: Record<string, SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  const suspended: SquadPlayer[] = [];
  for (const p of squad.players) {
    if (startSet.has(p.name)) continue;
    if (!isAvailable(states, p.name)) suspended.push(p);
    else benchByPos[p.group]?.push(p);
  }
  for (const k of Object.keys(benchByPos)) benchByPos[k]!.sort((a, b) => b.ability - a.ability);

  const [drag, setDrag] = useState<{ source: DragSource; x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const apply = (source: DragSource, target: DropTarget) => {
    if (!target) return;
    const next = [...eleven];
    if (source.kind === "slot" && target.kind === "slot") {
      const tmp = next[source.i]!;
      next[source.i] = next[target.i]!;
      next[target.i] = tmp;
    } else if (source.kind === "bench" && target.kind === "slot") {
      if (next.includes(source.name)) return;
      next[target.i] = source.name;
    } else if (source.kind === "slot" && target.kind === "bench") {
      if (isAvailable(states, target.name) && !next.includes(target.name)) next[source.i] = target.name;
    } else {
      return;
    }
    onChange(next);
  };

  const dropTargetAt = (x: number, y: number): DropTarget => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
    if (!el) return null;
    const kind = el.dataset.drop;
    if (kind === "slot") return { kind: "slot", i: Number(el.dataset.index) };
    if (kind === "bench") return { kind: "bench", name: el.dataset.name ?? "" };
    return null;
  };

  const startDrag = (source: DragSource, e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ source, x: e.clientX, y: e.clientY });
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    apply(drag.source, dropTargetAt(e.clientX, e.clientY));
    setDrag(null);
  };

  return (
    <div ref={rootRef} className="dpitch-wrap">
      <div className="pitch" role="group" aria-label={`${squad.team} ${formation}`}>
        <svg viewBox="0 0 100 100" className="pitch__lines" aria-hidden preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--line)" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="var(--line)" />
          <circle cx="50" cy="50" r="9" fill="none" stroke="var(--line)" />
          <rect x="30" y="0" width="40" height="14" fill="none" stroke="var(--line)" />
          <rect x="30" y="86" width="40" height="14" fill="none" stroke="var(--line)" />
        </svg>
        {eleven.map((name, i) => {
          const slot = f.slots[i] ?? { x: 50, y: 50, pos: "MF" as const };
          const p = byName.get(name);
          const oop = p ? isOutOfPosition(p.group, slot.pos) : false;
          const stamina = states[name]?.stamina ?? 100;
          const yellows = states[name]?.yellows ?? 0;
          const tier = staminaTier(stamina);
          return (
            <div
              key={`${name}-${i}`}
              data-drop="slot"
              data-index={i}
              className={`pitch__player ${oop ? "oop" : ""}`}
              style={{ left: `${slot.x}%`, top: `${slot.y}%`, touchAction: "none" }}
              onPointerDown={(e) => startDrag({ kind: "slot", i, name }, e)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              title={p ? `${name}, ${p.club}${oop ? ` · out of position (${slot.pos})` : ""}` : name}
            >
              <span className="pitch__avatar-wrap">
                <span className="pitch__dot" style={{ borderColor: RING[p?.group ?? "MF"] ?? "var(--steel)" }}>
                  <svg className="pitch__sil" viewBox="0 0 40 40" aria-hidden>
                    <circle cx="20" cy="15.5" r="7" fill="rgba(246,244,239,0.86)" />
                    <path d="M7 39 a13 13 0 0 1 26 0 Z" fill="rgba(246,244,239,0.86)" />
                  </svg>
                </span>
                {name === captain && <em className="pitch__cap">C</em>}
                {name === penaltyTaker && <em className="pitch__pk">P</em>}
                {yellows > 0 && <em className="pitch__yc" aria-label="booked" />}
                {oop && <em className="pitch__oop" aria-label="out of position">!</em>}
              </span>
              <span className="pitch__stamina" aria-label={`stamina ${Math.round(stamina)}`}>
                <span className={`pitch__stamina-fill tier-${tier}`} style={{ width: `${stamina}%` }} />
              </span>
              <span className="pitch__name">{lastName(name)}</span>
            </div>
          );
        })}
      </div>

      <div className="dpitch-bench">
        <div className="eyebrow">Bench, drag onto the pitch</div>
        {(["GK", "DF", "MF", "FW"] as const).map((pos) => (
          <div key={pos} className="dpitch-bench__group">
            <span className="dpitch-bench__pos mono">{pos}</span>
            <div className="dpitch-bench__list">
              {benchByPos[pos]!.map((p) => {
                const tier = staminaTier(states[p.name]?.stamina ?? 100);
                return (
                  <button
                    key={p.name}
                    type="button"
                    data-drop="bench"
                    data-name={p.name}
                    className="dpitch-chip"
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => startDrag({ kind: "bench", name: p.name }, e)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    title={`${p.name}, ${p.club}`}
                  >
                    <span className={`dpitch-chip__dot tier-${tier}`} />
                    {lastName(p.name)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {suspended.length > 0 && (
          <div className="dpitch-bench__group">
            <span className="dpitch-bench__pos mono">OUT</span>
            <div className="dpitch-bench__list">
              {suspended.map((p) => (
                <span key={p.name} className="dpitch-chip suspended" title={`${p.name}, suspended`}>
                  {lastName(p.name)} <em>susp.</em>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {drag && (
        <span className="dpitch-ghost" style={{ left: drag.x, top: drag.y }}>
          {lastName(drag.source.name)}
        </span>
      )}
    </div>
  );
}
