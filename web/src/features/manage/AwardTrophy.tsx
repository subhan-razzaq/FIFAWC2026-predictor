// A faux-3D award, drawn in SVG with gradients and a highlight so it reads as a
// shiny gold (or silver) object without any 3D dependency. Four shapes cover the
// boot, the ball-on-plinth, the glove and the generic cup, one per award.

type Kind = "boot" | "ball" | "glove" | "young" | "cup";

const METAL: Record<string, [string, string, string]> = {
  // [base, highlight, shadow]
  gold: ["#d8a93f", "#ffe9a8", "#7c5a16"],
  silver: ["#c7ccd6", "#ffffff", "#6b7280"],
};

export function AwardTrophy({ kind, metal = "gold", size = 84 }: { kind: Kind; metal?: "gold" | "silver"; size?: number }) {
  const [base, hi, shadow] = METAL[metal]!;
  const gid = `aw-${kind}-${metal}`;
  return (
    <svg className="award-trophy" viewBox="0 0 64 96" width={size * 0.66} height={size} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.45" stopColor={base} />
          <stop offset="1" stopColor={shadow} />
        </linearGradient>
        <radialGradient id={`${gid}-sheen`} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* plinth, shared by every award */}
      <ellipse cx="32" cy="92" rx="20" ry="4" fill="#000" opacity="0.35" />
      <rect x="18" y="80" width="28" height="10" rx="1.5" fill={`url(#${gid})`} />
      <rect x="22" y="74" width="20" height="7" rx="1.5" fill={shadow} opacity="0.7" />

      {kind === "cup" || kind === "ball" || kind === "young" ? (
        <g>
          {/* a classic cup bowl */}
          <path d="M16 26 h32 v8 a16 16 0 0 1 -32 0 Z" fill={`url(#${gid})`} />
          <path d="M16 26 q-9 2 -9 -8 q0 -6 9 -6" fill="none" stroke={base} strokeWidth="3" />
          <path d="M48 26 q9 2 9 -8 q0 -6 -9 -6" fill="none" stroke={base} strokeWidth="3" />
          <rect x="28" y="50" width="8" height="24" fill={`url(#${gid})`} />
          {kind === "ball" && <circle cx="32" cy="20" r="7" fill={hi} stroke={shadow} strokeWidth="1.2" />}
          {kind === "young" && (
            <text x="32" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill={shadow}>
              ★
            </text>
          )}
        </g>
      ) : kind === "boot" ? (
        <g>
          {/* a golden boot */}
          <path d="M14 40 h22 l10 12 a6 6 0 0 1 -5 9 H18 a6 6 0 0 1 -6 -6 V44 Z" fill={`url(#${gid})`} />
          <path d="M14 56 h33" stroke={shadow} strokeWidth="2" opacity="0.5" />
          <rect x="14" y="36" width="20" height="6" rx="2" fill={base} />
        </g>
      ) : (
        <g>
          {/* a goalkeeper's glove */}
          <path d="M20 36 h18 a6 6 0 0 1 6 6 v18 a8 8 0 0 1 -8 8 H22 a6 6 0 0 1 -6 -6 V42 a6 6 0 0 1 4 -6 Z" fill={`url(#${gid})`} />
          <path d="M24 36 v-8 M30 36 v-10 M36 36 v-8" stroke={`url(#${gid})`} strokeWidth="5" strokeLinecap="round" />
          <path d="M16 48 q-5 1 -5 7 q0 4 6 5" fill="none" stroke={base} strokeWidth="4" strokeLinecap="round" />
        </g>
      )}

      {/* a soft sheen across the whole thing */}
      <rect x="6" y="6" width="52" height="80" fill={`url(#${gid}-sheen)`} />
    </svg>
  );
}
