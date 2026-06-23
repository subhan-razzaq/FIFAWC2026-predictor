// Tactical controls: formation, the three sliders (mentality / pressing / pacing),
// captain & penalty taker, and a live read-out of how the choices move the team's
// attack and defence versus their default rating.

import type { Model } from "@weltmeister/sim";
import { FORMATIONS, managedRatings } from "../../lib/manage";
import {
  mentalityLabel,
  pacingLabel,
  pressingLabel,
  type Tactics,
} from "../../lib/tactics";
import type { PlayerStates } from "../../lib/cards";
import type { MatchSettings } from "../../store/store";

const FORMATION_NAMES = Object.keys(FORMATIONS);

interface Props {
  model: Model;
  team: string;
  draft: MatchSettings;
  states: PlayerStates;
  onFormation: (f: string) => void;
  onPatch: (patch: Partial<MatchSettings>) => void;
}

export function TacticsPanel({ model, team, draft, states, onFormation, onPatch }: Props) {
  const base = model.teams.find((t) => t.name === team)!;
  const live = managedRatings(model, team, draft.eleven, draft.formation, draft.tactics, states);
  const dAtk = live.atk - base.atk;
  const dDef = live.def - base.def;

  const setTactics = (patch: Partial<Tactics>) => onPatch({ tactics: { ...draft.tactics, ...patch } });

  return (
    <div className="tactics">
      <div className="tactics__formations">
        {FORMATION_NAMES.map((f) => (
          <button
            key={f}
            className={`group-tab ${f === draft.formation ? "active" : ""}`}
            style={{ width: "auto", padding: "0 10px" }}
            onClick={() => onFormation(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="tactics__ratings flat-card">
        <Rating label="Attack" value={live.atk} delta={dAtk} />
        <Rating label="Defence" value={live.def} delta={dDef} />
        {live.mismatches.length > 0 && (
          <div className="tactics__warn mono">
            <span className="tactics__warn-mark" aria-hidden />
            {live.mismatches.length} out of position, weaker shape, easier to score against.
          </div>
        )}
      </div>

      <Slider
        label="Mentality"
        value={draft.tactics.mentality}
        min={-1}
        max={1}
        step={0.1}
        read={mentalityLabel(draft.tactics.mentality)}
        onChange={(v) => setTactics({ mentality: v })}
      />
      <Slider
        label="Pressing"
        value={draft.tactics.pressing}
        min={0}
        max={1}
        step={0.05}
        read={pressingLabel(draft.tactics.pressing)}
        onChange={(v) => setTactics({ pressing: v })}
      />
      <Slider
        label="Pacing"
        value={draft.tactics.pacing}
        min={0}
        max={1}
        step={0.05}
        read={pacingLabel(draft.tactics.pacing)}
        onChange={(v) => setTactics({ pacing: v })}
      />

      <div className="manage-pickers">
        <label>
          <span className="mono">Captain</span>
          <select value={draft.captain} onChange={(e) => onPatch({ captain: e.target.value })}>
            {draft.eleven.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mono">Penalties</span>
          <select value={draft.penaltyTaker} onChange={(e) => onPatch({ penaltyTaker: e.target.value })}>
            {draft.eleven.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Rating({ label, value, delta }: { label: string; value: number; delta: number }) {
  const color = delta >= 0.005 ? "var(--mex-green)" : delta <= -0.005 ? "var(--can-red)" : "var(--text-faint)";
  return (
    <div className="manage-ratings__row">
      <span>{label}</span>
      <span className="mono">
        {value.toFixed(3)}{" "}
        <em style={{ color, fontStyle: "normal" }}>
          ({delta >= 0 ? "+" : ""}
          {delta.toFixed(3)})
        </em>
      </span>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  read,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  read: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="manage-slider">
      <span className="mono">
        {label} <em>{read}</em>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
