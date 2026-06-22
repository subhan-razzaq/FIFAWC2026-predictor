// The full Dixon-Coles joint scoreline distribution as a compact matrix. Rows are
// home goals (top = 0), columns are away goals (left = 0). Each cell is tinted by
// its outcome (home win / draw / away win) in the brand triad, exactly like the
// probability bar, with intensity scaled to the cell's probability. The single
// most likely scoreline is marked with the gold keyline; an optional "actual"
// scoreline (what a simulated run produced) gets a contrasting ring, so the
// forecast and the real result read together.

import type { CSSProperties } from "react";
import { teamCode } from "../lib/teamCode";

interface Props {
  grid: number[][];
  homeTeam: string;
  awayTeam: string;
  modal: { x: number; y: number; p: number };
  /** The scoreline a run actually produced, marked on the grid if in range. */
  actual?: { x: number; y: number };
  /** how many goals to show per side (0..max inclusive) */
  max?: number;
}

function outcomeVar(x: number, y: number): string {
  return x > y ? "var(--win)" : x === y ? "var(--draw)" : "var(--loss)";
}

export function ScoreHeatmap({ grid, homeTeam, awayTeam, modal, actual, max = 5 }: Props) {
  const n = Math.min(max + 1, grid.length);
  const labels = Array.from({ length: n }, (_, i) => i);
  // perceptual scale: the busiest cell anchors full strength, faint cells fade out
  let peak = 0;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) peak = Math.max(peak, grid[x]?.[y] ?? 0);

  const home = teamCode(homeTeam);
  const away = teamCode(awayTeam);
  const actualLabel =
    actual && actual.x < n && actual.y < n ? ` Actual result ${home} ${actual.x}, ${away} ${actual.y}.` : "";

  return (
    <figure
      className="scoreheat"
      role="img"
      style={{ "--n": n } as CSSProperties}
      aria-label={`Scoreline probabilities. Most likely ${home} ${modal.x}, ${away} ${modal.y}, ${Math.round(
        modal.p * 100,
      )} percent. Rows are ${home} goals, columns are ${away} goals.${actualLabel}`}
    >
      <div className="scoreheat__cols mono" aria-hidden>
        <span className="scoreheat__rowhead" />
        {labels.map((y) => (
          <span key={y}>{y}</span>
        ))}
      </div>
      <div className="scoreheat__main">
        <div className="scoreheat__rows mono" aria-hidden>
          {labels.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <div className="scoreheat__grid">
          {Array.from({ length: n }, (_, x) =>
            labels.map((y) => {
              const p = grid[x]?.[y] ?? 0;
              const strength = peak > 0 ? Math.pow(p / peak, 0.72) : 0;
              const fill = Math.round((0.06 + strength * 0.94) * 100);
              const isModal = x === modal.x && y === modal.y;
              const isActual = !!actual && actual.x === x && actual.y === y;
              return (
                <span
                  key={`${x}-${y}`}
                  className={`scoreheat__cell ${isModal ? "is-modal" : ""} ${isActual ? "is-actual" : ""}`}
                  style={{ background: `color-mix(in srgb, ${outcomeVar(x, y)} ${fill}%, transparent)` }}
                  title={`${x}-${y} · ${(p * 100).toFixed(1)}%`}
                />
              );
            }),
          )}
        </div>
      </div>
      <figcaption className="scoreheat__legend mono" aria-hidden>
        ↓ {home} goals · → {away} goals
      </figcaption>
    </figure>
  );
}
