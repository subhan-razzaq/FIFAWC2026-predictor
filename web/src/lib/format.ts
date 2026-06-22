// Small formatting helpers for probabilities and scorelines.

export function pct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

/** Compact percentage that never shows a misleading 0% for tiny non-zero odds. */
export function oddsPct(p: number): string {
  if (p <= 0) return "0%";
  if (p < 0.01) return "<1%";
  if (p < 0.1) return `${(p * 100).toFixed(1)}%`;
  return `${Math.round(p * 100)}%`;
}

export const STAGE_LABEL: Record<string, string> = {
  group: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  third_place: "Third place",
  final: "Final",
};
