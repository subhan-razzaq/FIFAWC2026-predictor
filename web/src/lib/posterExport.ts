// Shareable broadcast posters, drawn to a canvas and downloaded as a PNG. Styled
// to match the site: a deep-blue base, the FIFA 2026 colourblock band, the 26
// ball mark, and the prize gold. A seed is printed so any run is reproducible.

import type { TournamentResult } from "@weltmeister/sim";
import { teamCode } from "./teamCode";

const NAVY = "#080f28";
const SURFACE = "#0f1838";
const TEXT = "#f3f5fd";
const DIM = "#aab0c8";
const FAINT = "#7c84a4";
const GOLD = "#d8a93f";
// The unified colourblock band: the three host nations and the prize gold, in a
// cool-to-warm ramp. Kept in lockstep with --fifa-band in tokens.css.
const SPECTRUM = ["#2f6bff", "#16b85c", "#d8a93f", "#e8202d"];

const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function band(ctx: CanvasRenderingContext2D, y: number): void {
  const bw = W / SPECTRUM.length;
  SPECTRUM.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, y, bw + 1, 12);
  });
}

async function chrome(ctx: CanvasRenderingContext2D, subtitle: string): Promise<void> {
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  band(ctx, 0);
  band(ctx, H - 12);

  const ball = await loadImage(`${import.meta.env.BASE_URL}26.png`);
  if (ball) ctx.drawImage(ball, 60, 48, 80, 80);

  ctx.textBaseline = "top";
  ctx.fillStyle = TEXT;
  ctx.font = "700 40px Anton, Archivo, Arial, sans-serif";
  ctx.fillText("WELTMEISTER", 154, 56);
  ctx.fillStyle = GOLD;
  ctx.font = "400 19px 'JetBrains Mono', monospace";
  ctx.fillText(subtitle, 156, 104);
}

function footer(ctx: CanvasRenderingContext2D, seedLabel: string): void {
  ctx.fillStyle = GOLD;
  ctx.font = "700 30px 'JetBrains Mono', monospace";
  ctx.fillText(`SEED  ${seedLabel}`, 64, H - 150);
  ctx.fillStyle = FAINT;
  ctx.font = "400 18px 'JetBrains Mono', monospace";
  ctx.fillText("Reproduce this run with the seed. An independent project, not affiliated with FIFA.", 64, H - 100);
}

function download(canvas: HTMLCanvasElement, name: string): void {
  const link = document.createElement("a");
  link.download = name;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "final"];
const STAGE_LABEL: Record<string, string> = {
  group: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

/** The predicted-champion poster from a simulated tournament. */
export async function exportPoster(res: TournamentResult, seedLabel: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  await document.fonts.ready;
  await chrome(ctx, "WORLD CUP 2026 · PREDICTED BRACKET");

  const champ = res.champion;
  ctx.fillStyle = GOLD;
  ctx.font = "400 26px 'JetBrains Mono', monospace";
  ctx.fillText("WORLD CHAMPIONS", 64, 220);
  ctx.fillStyle = TEXT;
  ctx.font = "400 104px Anton, Archivo, Arial, sans-serif";
  ctx.fillText(champ.toUpperCase(), 60, 252);

  ctx.fillStyle = DIM;
  ctx.font = "400 22px 'JetBrains Mono', monospace";
  ctx.fillText(`Runner-up  ${res.runnerUp}        Third  ${res.third}`, 64, 392);

  ctx.fillStyle = FAINT;
  ctx.font = "400 22px 'JetBrains Mono', monospace";
  ctx.fillText("PATH TO GLORY", 64, 470);

  const path = res.matches
    .filter((m) => STAGE_ORDER.includes(m.stage) && (m.home === champ || m.away === champ))
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));

  let y = 516;
  for (const m of path) {
    const isHome = m.home === champ;
    const opp = isHome ? m.away : m.home;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const note = m.shootout
      ? ` (pens ${isHome ? m.shootout.home : m.shootout.away}-${isHome ? m.shootout.away : m.shootout.home})`
      : m.afterExtraTime
        ? " (a.e.t.)"
        : "";
    ctx.fillStyle = SURFACE;
    ctx.fillRect(64, y - 8, W - 128, 56);
    ctx.fillStyle = GOLD;
    ctx.fillRect(64, y - 8, 5, 56);
    ctx.fillStyle = DIM;
    ctx.font = "400 22px 'JetBrains Mono', monospace";
    ctx.fillText(STAGE_LABEL[m.stage] ?? m.stage, 88, y + 8);
    ctx.fillStyle = TEXT;
    ctx.font = "700 30px Archivo, Arial, sans-serif";
    ctx.fillText(`${teamCode(champ)} ${gf}-${ga} ${teamCode(opp)}`, 380, y + 4);
    ctx.fillStyle = FAINT;
    ctx.font = "400 20px 'JetBrains Mono', monospace";
    ctx.fillText(`${opp}${note}`, 640, y + 9);
    y += 66;
  }

  footer(ctx, seedLabel);
  download(canvas, `weltmeister-${champ.toLowerCase().replace(/\s+/g, "-")}-${seedLabel}.png`);
}

export interface RoadStop {
  stage: string;
  opp: string;
  gf: number;
  ga: number;
  pens?: [number, number];
  aet?: boolean;
}

export interface ManagerPosterData {
  team: string;
  grade: string;
  reachedLabel: string;
  isChampion: boolean;
  road: RoadStop[];
  topScorer?: { player: string; goals: number };
  seedLabel: string;
}

function gradeColor(grade: string): string {
  const g = grade[0];
  if (g === "A") return "#16b85c";
  if (g === "B") return "#00bcd4";
  if (g === "C") return "#f7c43a";
  if (g === "D") return "#ff7a1a";
  return "#e8202d";
}

/** The end-of-run manager poster: the grade, the road, and the headline stats. */
export async function exportManagerPoster(d: ManagerPosterData): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  await document.fonts.ready;
  await chrome(ctx, "MANAGER MODE · MY WORLD CUP");

  // grade chip, drawn centred in its box and scaled to fit, so two-character
  // grades like "A+" stay inside the chip instead of clipping its edge.
  const CHIP_X = 64;
  const CHIP_Y = 210;
  const CHIP_S = 168;
  const cx = CHIP_X + CHIP_S / 2;
  const cy = CHIP_Y + CHIP_S / 2;
  const gc = d.isChampion ? GOLD : gradeColor(d.grade);
  ctx.fillStyle = gc;
  ctx.fillRect(CHIP_X, CHIP_Y, CHIP_S, CHIP_S);

  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let gradeSize = 128;
  ctx.font = `400 ${gradeSize}px Anton, Archivo, Arial, sans-serif`;
  const maxGradeW = CHIP_S - 40; // keep a comfortable margin on both sides
  const gradeW = ctx.measureText(d.grade).width;
  if (gradeW > maxGradeW) {
    gradeSize = Math.floor((gradeSize * maxGradeW) / gradeW);
    ctx.font = `400 ${gradeSize}px Anton, Archivo, Arial, sans-serif`;
  }
  // Anton's caps sit a touch high in the em box; nudge down for true optical centre.
  ctx.fillText(d.grade, cx, cy + gradeSize * 0.06);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // team + reached
  ctx.fillStyle = TEXT;
  ctx.font = "400 76px Anton, Archivo, Arial, sans-serif";
  ctx.fillText(d.team.toUpperCase(), 260, 222);
  ctx.fillStyle = GOLD;
  ctx.font = "400 28px 'JetBrains Mono', monospace";
  ctx.fillText(d.reachedLabel, 262, 312);
  if (d.topScorer) {
    ctx.fillStyle = DIM;
    ctx.font = "400 22px 'JetBrains Mono', monospace";
    ctx.fillText(`Top scorer  ${d.topScorer.player}  (${d.topScorer.goals})`, 262, 352);
  }

  // the road
  ctx.fillStyle = FAINT;
  ctx.font = "400 22px 'JetBrains Mono', monospace";
  ctx.fillText("THE ROAD", 64, 446);

  let y = 492;
  for (const m of d.road) {
    const won = m.pens ? m.pens[0] > m.pens[1] : m.gf > m.ga;
    const drew = !m.pens && m.gf === m.ga;
    ctx.fillStyle = SURFACE;
    ctx.fillRect(64, y - 8, W - 128, 52);
    ctx.fillStyle = won ? "#16b85c" : drew ? GOLD : "#e8202d";
    ctx.fillRect(64, y - 8, 5, 52);
    ctx.fillStyle = DIM;
    ctx.font = "400 21px 'JetBrains Mono', monospace";
    ctx.fillText(STAGE_LABEL[m.stage] ?? m.stage, 88, y + 6);
    ctx.fillStyle = TEXT;
    ctx.font = "700 26px Archivo, Arial, sans-serif";
    const pens = m.pens ? ` (${m.pens[0]}-${m.pens[1]}p)` : m.aet ? " (a.e.t.)" : "";
    ctx.fillText(`${m.gf}-${m.ga}${pens}`, 360, y + 3);
    ctx.fillStyle = FAINT;
    ctx.font = "400 21px 'JetBrains Mono', monospace";
    ctx.fillText(`vs ${m.opp}`, 520, y + 6);
    y += 60;
  }

  footer(ctx, d.seedLabel);
  download(canvas, `weltmeister-manager-${d.team.toLowerCase().replace(/\s+/g, "-")}-${d.seedLabel}.png`);
}
