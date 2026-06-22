// Team marker: the real national flag, framed as a sharp-edged tile to keep the
// broadcast look. If a flag is unmapped or fails to load (e.g. offline), we fall
// back to the original geometric crest so a marker never renders empty.

import { useState } from "react";
import { groupColor } from "../design/colors";
import { teamCode } from "../lib/teamCode";
import { flagUrl } from "../lib/flag";

interface Props {
  team: string;
  group?: string;
  size?: number;
  showCode?: boolean;
}

export function TeamBadge({ team, group, size = 28, showCode = false }: Props) {
  const [failed, setFailed] = useState(false);
  const url = flagUrl(team);
  const accent = group ? groupColor(group) : "#8a8f98";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {url && !failed ? (
        <img
          src={url}
          alt={`${team} flag`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            objectFit: "cover",
            flex: "0 0 auto",
            border: "1px solid var(--line-strong)",
            background: "var(--surface-hi)",
          }}
        />
      ) : (
        <GeometricCrest team={team} accent={accent} size={size} />
      )}
      {showCode && (
        <span className="mono" style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
          {teamCode(team)}
        </span>
      )}
    </span>
  );
}

// The original three-wave triangle crest, tinted by group. Kept as the offline /
// unmapped fallback.
function GeometricCrest({ team, accent, size }: { team: string; accent: string; size: number }) {
  const id = `tok-${team.replace(/\W/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={`${team} crest`}
      style={{ flex: "0 0 auto" }}
    >
      <clipPath id={id}>
        <rect x="0" y="0" width="32" height="32" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="0" width="32" height="32" fill="#0b0b0c" />
        <path d="M0 0 L32 0 L16 16 Z" fill="#e4002b" opacity="0.92" />
        <path d="M32 0 L32 32 L16 16 Z" fill="#1f6fd6" opacity="0.92" />
        <path d="M0 0 L0 32 L16 16 Z" fill="#14a85a" opacity="0.92" />
        <path d="M0 32 L32 32 L16 16 Z" fill={accent} opacity="0.95" />
        <path d="M16 16 A12 12 0 0 1 28 28 L16 28 Z" fill="rgba(0,0,0,0.28)" />
      </g>
      <rect x="0.5" y="0.5" width="31" height="31" fill="none" stroke="rgba(246,244,239,0.25)" />
    </svg>
  );
}
