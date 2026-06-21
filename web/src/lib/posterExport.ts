// Export a shareable, broadcast-style champion poster as a PNG. The seed is
// printed on it so anyone can reproduce the exact bracket.

import type { TournamentResult } from "@weltmeister/sim";
import { teamCode } from "./teamCode";

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "final"];
const STAGE_LABEL: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  final: "Final",
};

export function exportPoster(res: TournamentResult, seedLabel: string): void {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // background
  ctx.fillStyle = "#0A1A12";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(200,162,75,0.10)";
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 8, W, 8);

  const champ = res.champion;
  const path = res.matches
    .filter((m) => STAGE_ORDER.includes(m.stage) && (m.home === champ || m.away === champ))
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));

  // header
  ctx.fillStyle = "#f3f1ec";
  ctx.font = "700 34px Archivo, Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("WELTMEISTER", 64, 64);
  ctx.fillStyle = "#aab0ac";
  ctx.font = "400 20px 'JetBrains Mono', monospace";
  ctx.fillText("WORLD CUP 2026 · PREDICTED BRACKET", 64, 108);

  // trophy block
  ctx.fillStyle = "#c8a24b";
  ctx.fillRect(64, 188, 64, 64);
  ctx.fillRect(80, 252, 32, 26);
  ctx.fillRect(64, 278, 64, 14);

  // champion
  ctx.fillStyle = "#c8a24b";
  ctx.font = "400 26px 'JetBrains Mono', monospace";
  ctx.fillText("WORLD CHAMPIONS", 168, 196);
  ctx.fillStyle = "#f3f1ec";
  ctx.font = "700 92px Anton, Archivo, Arial, sans-serif";
  ctx.fillText(champ.toUpperCase(), 164, 226);

  // runner-up + third
  ctx.fillStyle = "#aab0ac";
  ctx.font = "400 22px 'JetBrains Mono', monospace";
  ctx.fillText(`Runner-up  ${res.runnerUp}      Third  ${res.third}`, 64, 360);

  // path to glory
  ctx.fillStyle = "#767c78";
  ctx.font = "400 22px 'JetBrains Mono', monospace";
  ctx.fillText("PATH TO GLORY", 64, 440);

  let y = 484;
  for (const m of path) {
    const isHome = m.home === champ;
    const opp = isHome ? m.away : m.home;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const note = m.shootout ? ` (pens ${isHome ? m.shootout.home : m.shootout.away}-${isHome ? m.shootout.away : m.shootout.home})` : m.afterExtraTime ? " (a.e.t.)" : "";

    ctx.fillStyle = "#aab0ac";
    ctx.font = "400 24px 'JetBrains Mono', monospace";
    ctx.fillText(STAGE_LABEL[m.stage] ?? m.stage, 64, y);

    ctx.fillStyle = "#f3f1ec";
    ctx.font = "700 30px Archivo, Arial, sans-serif";
    ctx.fillText(`${teamCode(champ)} ${gf}-${ga} ${teamCode(opp)}`, 380, y - 4);

    ctx.fillStyle = "#767c78";
    ctx.font = "400 20px 'JetBrains Mono', monospace";
    ctx.fillText(`${opp}${note}`, 660, y + 2);
    y += 64;
  }

  // footer
  ctx.fillStyle = "#c8a24b";
  ctx.font = "700 30px 'JetBrains Mono', monospace";
  ctx.fillText(`SEED  ${seedLabel}`, 64, H - 140);
  ctx.fillStyle = "#767c78";
  ctx.font = "400 18px 'JetBrains Mono', monospace";
  ctx.fillText("Reproduce this bracket with the seed. An independent project, not affiliated with FIFA.", 64, H - 92);

  const link = document.createElement("a");
  link.download = `weltmeister-${champ.toLowerCase().replace(/\s+/g, "-")}-${seedLabel}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
