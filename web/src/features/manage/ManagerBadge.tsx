// The opposing manager: a name, a one-to-five-star reputation and a one-line read.
// Shown on the scout card and in the inbox dossier so every matchup has a face in
// the other dugout.

import type { OpponentManager } from "../../lib/managers";

function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value % 1 >= 0.5;
  return (
    <span className="mgr-badge__stars" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`mgr-badge__star ${i < full ? "is-on" : i === full && half ? "is-half" : ""}`}>
          ★
        </span>
      ))}
    </span>
  );
}

export function ManagerBadge({ manager, compact = false }: { manager: OpponentManager; compact?: boolean }) {
  return (
    <div className={`mgr-badge ${compact ? "mgr-badge--compact" : ""}`}>
      <div className="mgr-badge__avatar" aria-hidden>
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="14" r="7" fill="currentColor" opacity="0.85" />
          <path d="M6 40 a14 14 0 0 1 28 0 Z" fill="currentColor" opacity="0.85" />
        </svg>
      </div>
      <div className="mgr-badge__copy">
        <span className="eyebrow">Opposition manager</span>
        <span className="mgr-badge__name">{manager.name}</span>
        <Stars value={manager.stars} />
        {!compact && <span className="mgr-badge__nous mono">{manager.nous}</span>}
      </div>
    </div>
  );
}
