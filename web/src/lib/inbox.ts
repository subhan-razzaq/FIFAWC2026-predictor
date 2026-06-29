// The manager's inbox. Between games the assistant, the medical team, the press
// office and the board drop messages: the next-match dossier, injury and suspension
// updates, the odd bit of good or bad news. Some messages carry a deeper analysis
// that opens in its own pane, so the inbox has layers rather than being a flat list.

import type { ScoutReport } from "./scouting";
import type { OpponentManager } from "./managers";
import type { SquadEvent } from "./events";

export type InboxKind = "scout" | "medical" | "discipline" | "board" | "press" | "result";

export interface InboxMessage {
  id: string;
  kind: InboxKind;
  from: string;
  subject: string;
  preview: string;
  body: string[];
  matchday: number;
  read?: boolean;
  /** an assistant's deeper read on the next opponent, opened from the message. */
  analysis?: ScoutReport;
  /** the opposing manager, shown in the dossier. */
  oppManager?: OpponentManager;
}

let counter = 0;
function id(): string {
  counter += 1;
  return `m${Date.now().toString(36)}-${counter}`;
}

/** The assistant's pre-match dossier on the next opponent, with the deep analysis
 * attached so the manager can open it in its own pane. */
export function scoutMessage(
  matchday: number,
  opponent: string,
  scout: ScoutReport,
  manager: OpponentManager,
): InboxMessage {
  const stars = "★".repeat(Math.floor(manager.stars)) + (manager.stars % 1 ? "½" : "");
  return {
    id: id(),
    kind: "scout",
    from: "Assistant Manager",
    subject: `Dossier: ${opponent}`,
    preview: scout.headline,
    matchday,
    analysis: scout,
    oppManager: manager,
    body: [
      `Boss, here's my read on ${opponent} ahead of the next one.`,
      scout.headline,
      `Their manager is ${manager.name} (${stars}). ${manager.nous}`,
      `Open the full analysis for the danger men and how I'd set up against them.`,
    ],
  };
}

export function medicalMessage(matchday: number, events: SquadEvent[]): InboxMessage | null {
  const real = events.filter((e) => e.out > 0);
  if (real.length === 0) return null;
  const lines = real.map((e) => `${e.player} has picked up ${e.detail} and is out for ${e.out} match${e.out === 1 ? "" : "es"}.`);
  return {
    id: id(),
    kind: "medical",
    from: "Head of Medical",
    subject: real.length === 1 ? `Injury update: ${real[0]!.player}` : `Injury update: ${real.length} players`,
    preview: lines[0]!,
    matchday,
    body: ["Latest from the treatment room:", ...lines, "We'll keep you posted on their recovery."],
  };
}

export function returnsMessage(matchday: number, returned: string[]): InboxMessage | null {
  if (returned.length === 0) return null;
  return {
    id: id(),
    kind: "medical",
    from: "Head of Medical",
    subject: returned.length === 1 ? `Back in training: ${returned[0]}` : `${returned.length} players back in training`,
    preview: `${returned.join(", ")} declared fit.`,
    matchday,
    body: [`Good news, boss: ${returned.join(", ")} ${returned.length === 1 ? "is" : "are"} back to full fitness and available for selection.`],
  };
}

export function disciplineMessage(matchday: number, suspended: string[]): InboxMessage | null {
  if (suspended.length === 0) return null;
  return {
    id: id(),
    kind: "discipline",
    from: "Team Administrator",
    subject: suspended.length === 1 ? `Suspended: ${suspended[0]}` : `${suspended.length} suspensions`,
    preview: `${suspended.join(", ")} will sit out the next match.`,
    matchday,
    body: [`A reminder that ${suspended.join(", ")} ${suspended.length === 1 ? "is" : "are"} suspended for the next match and cannot be selected.`],
  };
}

export function boardMessage(matchday: number, fans: number, morale: number): InboxMessage {
  const mood =
    fans >= 75 ? "The supporters are right behind you." : fans >= 50 ? "The mood around the camp is steady." : "The board would like to see a response from the fans' point of view.";
  const dressing = morale >= 75 ? "The dressing room is buzzing." : morale >= 50 ? "Spirits in the squad are fine." : "There's some tension in the squad to manage.";
  return {
    id: id(),
    kind: "board",
    from: "The Board",
    subject: "Where we stand",
    preview: mood,
    matchday,
    body: [mood, dressing, "Keep doing what you're doing and let's see how far this run goes."],
  };
}
