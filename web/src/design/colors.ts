// Colour mapping for teams, groups, and outcomes. Anchored on the FIFA 2026
// colourblock spectrum, so every team marker reads as part of the tournament
// identity rather than an arbitrary chip.

export const SPECTRUM = [
  "#e8202d", // red
  "#ff7a1a", // orange
  "#f7c43a", // yellow
  "#16b85c", // green
  "#00bcd4", // teal
  "#2f6bff", // blue
  "#8b3cff", // purple
  "#ff2d8e", // magenta
];

// 12 group accents spread across the full FIFA 2026 spectrum.
const GROUP_COLORS: Record<string, string> = {
  A: "#e8202d",
  B: "#ff7a1a",
  C: "#f7c43a",
  D: "#16b85c",
  E: "#00bcd4",
  F: "#2f6bff",
  G: "#8b3cff",
  H: "#ff2d8e",
  I: "#ff5a3c",
  J: "#0bd1a0",
  K: "#5a86ff",
  L: "#c44bff",
};

export function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? "#8a90a8";
}

const CONF_COLORS: Record<string, string> = {
  UEFA: "#2f6bff",
  CONMEBOL: "#f7c43a",
  CONCACAF: "#e8202d",
  CAF: "#16b85c",
  AFC: "#ff2d8e",
  OFC: "#00bcd4",
};

export function confederationColor(conf: string): string {
  return CONF_COLORS[conf] ?? "#8a8f98";
}

export function outcomeColor(kind: "win" | "draw" | "loss"): string {
  return kind === "win" ? "var(--win)" : kind === "draw" ? "var(--draw)" : "var(--loss)";
}
