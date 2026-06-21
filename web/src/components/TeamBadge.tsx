// Original team token built on a three-wave triangle motif (Section 8.3), tinted
// by group. This is our own geometric crest, not the FIFA ball artwork: three
// bands in the brand triad converge to a point inside a sharp-edged square.

import { groupColor } from "../design/colors";
import { teamCode } from "../lib/teamCode";

interface Props {
  team: string;
  group?: string;
  size?: number;
  showCode?: boolean;
}

export function TeamBadge({ team, group, size = 28, showCode = false }: Props) {
  const accent = group ? groupColor(group) : "#8a8f98";
  const id = `tok-${team.replace(/\W/g, "")}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        role="img"
        aria-label={`${team} token`}
        style={{ flex: "0 0 auto" }}
      >
        <clipPath id={id}>
          <rect x="0" y="0" width="32" height="32" />
        </clipPath>
        <g clipPath={`url(#${id})`}>
          <rect x="0" y="0" width="32" height="32" fill="#0b0b0c" />
          {/* three converging waves */}
          <path d="M0 0 L32 0 L16 16 Z" fill="#e4002b" opacity="0.92" />
          <path d="M32 0 L32 32 L16 16 Z" fill="#1f6fd6" opacity="0.92" />
          <path d="M0 0 L0 32 L16 16 Z" fill="#14a85a" opacity="0.92" />
          <path d="M0 32 L32 32 L16 16 Z" fill={accent} opacity="0.95" />
          {/* quarter-circle nod to the "26" geometry */}
          <path d="M16 16 A12 12 0 0 1 28 28 L16 28 Z" fill="rgba(0,0,0,0.28)" />
        </g>
        <rect x="0.5" y="0.5" width="31" height="31" fill="none" stroke="rgba(246,244,239,0.25)" />
      </svg>
      {showCode && (
        <span className="mono" style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
          {teamCode(team)}
        </span>
      )}
    </span>
  );
}
