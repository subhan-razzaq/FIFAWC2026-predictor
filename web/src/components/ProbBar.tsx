// A win / draw / loss probability bar. Flat colour blocks in the brand triad, no
// rounding, with the percentages as a broadcast stat line.

import { pct } from "../lib/format";

interface Props {
  win: number;
  draw: number;
  loss: number;
  homeLabel?: string;
  awayLabel?: string;
  height?: number;
}

export function ProbBar({ win, draw, loss, homeLabel, awayLabel, height = 10 }: Props) {
  return (
    <div>
      <div
        style={{ display: "flex", width: "100%", height, overflow: "hidden", border: "1px solid var(--line)" }}
        role="img"
        aria-label={`Home win ${pct(win)}, draw ${pct(draw)}, away win ${pct(loss)}`}
      >
        <div style={{ width: `${win * 100}%`, background: "var(--win)" }} />
        <div style={{ width: `${draw * 100}%`, background: "var(--draw)" }} />
        <div style={{ width: `${loss * 100}%`, background: "var(--loss)" }} />
      </div>
      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--t-xs)",
          color: "var(--text-dim)",
          marginTop: 4,
        }}
      >
        <span style={{ color: "var(--win)" }}>{homeLabel ? `${homeLabel} ${pct(win)}` : pct(win)}</span>
        <span style={{ color: "var(--draw)" }}>D {pct(draw)}</span>
        <span style={{ color: "var(--loss)" }}>{awayLabel ? `${awayLabel} ${pct(loss)}` : pct(loss)}</span>
      </div>
    </div>
  );
}
