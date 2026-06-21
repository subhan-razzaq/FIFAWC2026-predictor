// Colour mapping for teams, groups, and outcomes. Anchored on the tri-nation
// working palette (red / blue / green) plus gold, so every team marker ties back
// to the brand rather than using arbitrary chips.

export const TRIAD = {
  red: "#e4002b",
  blue: "#1f6fd6",
  green: "#14a85a",
  gold: "#c8a24b",
};

// 12 group accents, a disciplined spread across the brand triad and gold.
const GROUP_COLORS: Record<string, string> = {
  A: "#e4002b",
  B: "#1f6fd6",
  C: "#14a85a",
  D: "#c8a24b",
  E: "#ec5a73",
  F: "#5a93e0",
  G: "#54c489",
  H: "#d8b87a",
  I: "#b3001f",
  J: "#134f9c",
  K: "#0f7d43",
  L: "#9c7a2f",
};

export function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? "#8a8f98";
}

const CONF_COLORS: Record<string, string> = {
  UEFA: "#1f6fd6",
  CONMEBOL: "#c8a24b",
  CONCACAF: "#e4002b",
  CAF: "#14a85a",
  AFC: "#ec5a73",
  OFC: "#5a93e0",
};

export function confederationColor(conf: string): string {
  return CONF_COLORS[conf] ?? "#8a8f98";
}

export function outcomeColor(kind: "win" | "draw" | "loss"): string {
  return kind === "win" ? "var(--win)" : kind === "draw" ? "var(--draw)" : "var(--loss)";
}
