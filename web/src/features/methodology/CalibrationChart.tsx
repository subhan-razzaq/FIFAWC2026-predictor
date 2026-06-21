// Reliability diagram: predicted probability against observed frequency. A
// well-calibrated model tracks the diagonal. Plain SVG so it stays crisp and
// dependency-free.

interface Bin {
  bin: [number, number];
  mean_pred: number | null;
  obs_freq: number | null;
  count: number;
}

interface Props {
  bins: Bin[];
  ece: number;
}

const SIZE = 320;
const PAD = 36;

export function CalibrationChart({ bins, ece }: Props) {
  const sx = (v: number) => PAD + v * (SIZE - 2 * PAD);
  const sy = (v: number) => SIZE - PAD - v * (SIZE - 2 * PAD);
  const points = bins.filter(
    (b): b is Bin & { mean_pred: number; obs_freq: number } => b.mean_pred !== null && b.obs_freq !== null,
  );

  const path = points
    .map((b, i) => `${i === 0 ? "M" : "L"} ${sx(b.mean_pred).toFixed(1)} ${sy(b.obs_freq).toFixed(1)}`)
    .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="calib">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Calibration curve, expected calibration error ${ece.toFixed(3)}`}>
        {/* grid */}
        {ticks.map((t) => (
          <g key={t} className="calib__grid">
            <line x1={sx(t)} y1={sy(0)} x2={sx(t)} y2={sy(1)} />
            <line x1={sx(0)} y1={sy(t)} x2={sx(1)} y2={sy(t)} />
            <text x={sx(t)} y={SIZE - PAD + 14} textAnchor="middle" className="calib__tick">
              {t}
            </text>
            <text x={PAD - 8} y={sy(t) + 3} textAnchor="end" className="calib__tick">
              {t}
            </text>
          </g>
        ))}
        {/* perfect-calibration diagonal */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} className="calib__diag" />
        {/* model curve */}
        <path d={path} className="calib__curve" fill="none" />
        {points.map((b) => (
          <circle
            key={b.bin[0]}
            cx={sx(b.mean_pred)}
            cy={sy(b.obs_freq)}
            r={Math.max(2.5, Math.min(7, Math.sqrt(b.count)))}
            className="calib__pt"
          />
        ))}
        <text x={SIZE / 2} y={SIZE - 6} textAnchor="middle" className="calib__axis">
          predicted probability
        </text>
        <text x={12} y={SIZE / 2} textAnchor="middle" className="calib__axis" transform={`rotate(-90 12 ${SIZE / 2})`}>
          observed frequency
        </text>
      </svg>
      <figcaption className="mono">
        Expected calibration error <strong>{ece.toFixed(3)}</strong>. Dot size scales with the number of
        predictions in each bin.
      </figcaption>
    </figure>
  );
}
