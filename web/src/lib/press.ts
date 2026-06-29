// Press conferences. Before each game the media put a question to the manager and
// the answer matters: a calculated reply can lift the dressing room or win over the
// fans, a careless one can do the opposite. Questions are chosen deterministically
// from the matchup and the run so far, so the same career asks the same questions.

import { hashSeed } from "@weltmeister/sim";

export interface PressChoice {
  text: string;
  /** team morale change in points. */
  morale: number;
  /** fan happiness change in points. */
  fans: number;
  /** the line the room reacts to. */
  reaction: string;
}

export interface PressQuestion {
  reporter: string;
  outlet: string;
  question: string;
  choices: PressChoice[];
}

const REPORTERS = [
  ["Sophie Lang", "Touchline TV"],
  ["Marcus Reed", "The Global Post"],
  ["Ana Ribeiro", "World Sport Daily"],
  ["Tom Whitaker", "Frontpage FC"],
  ["Yuki Sato", "The Terrace"],
  ["Carla Mendez", "Backpage Radio"],
];

interface Template {
  q: (opp: string, team: string) => string;
  choices: PressChoice[];
}

const TEMPLATES: Template[] = [
  {
    q: (opp) => `${opp} are dangerous on the break. Are you worried about the threat they carry?`,
    choices: [
      { text: "We respect them, but we'll play our game.", morale: 3, fans: 2, reaction: "A measured, confident answer. The room nods along." },
      { text: "Worried? We should be the ones they're worried about.", morale: 5, fans: 4, reaction: "Bold. The players love the bravado, the fans eat it up." },
      { text: "Honestly, they scare me a little.", morale: -4, fans: -3, reaction: "Candid, but it hands the opponent a headline." },
    ],
  },
  {
    q: (_opp, team) => `Some fans feel ${team} have underperformed. What's your message to them?`,
    choices: [
      { text: "Judge us at the final whistle, not before.", morale: 2, fans: 1, reaction: "Calm and steady. Buys some patience." },
      { text: "Stick with us and we'll repay the faith.", morale: 3, fans: 5, reaction: "Warm and inclusive. The supporters appreciate it." },
      { text: "They can think what they like.", morale: -2, fans: -6, reaction: "Dismissive. That won't go down well on the terraces." },
    ],
  },
  {
    q: (opp) => `Is there extra pressure facing ${opp} at this stage?`,
    choices: [
      { text: "Pressure is a privilege. We're ready.", morale: 4, fans: 3, reaction: "The line of the day. Everyone stands a little taller." },
      { text: "We take it one game at a time.", morale: 1, fans: 0, reaction: "Safe. Nobody learns much, nobody is upset." },
      { text: "Of course, this is a huge game and the nerves are real.", morale: -3, fans: -1, reaction: "Honest, but it plants a seed of doubt." },
    ],
  },
  {
    q: (_opp, team) => `Your squad has carried some knocks. Is ${team} fit enough to go all the way?`,
    choices: [
      { text: "Everyone's raring to go. No excuses.", morale: 4, fans: 2, reaction: "Defiant. The squad backs the message." },
      { text: "We'll manage the load and trust the depth.", morale: 2, fans: 1, reaction: "Sensible. Shows a plan." },
      { text: "We're stretched thin, if I'm honest.", morale: -3, fans: -2, reaction: "Realistic, but it lowers expectations." },
    ],
  },
  {
    q: (opp) => `${opp}'s manager says they'll come at you from the first whistle. Your response?`,
    choices: [
      { text: "Let them. We'll be ready for it.", morale: 3, fans: 3, reaction: "Cool under fire. Good theatre." },
      { text: "Talk is cheap. We answer on the pitch.", morale: 4, fans: 5, reaction: "A crowd-pleaser. The fans are fired up." },
      { text: "If they press, they'll leave space, and we'll punish it.", morale: 3, fans: 2, reaction: "Tactical and assured." },
    ],
  },
];

export function pressQuestion(seed: number, team: string, opponent: string, matchday: number): PressQuestion {
  const h = hashSeed(`press|${seed}|${team}|${matchday}`);
  const tpl = TEMPLATES[h % TEMPLATES.length]!;
  const pair = REPORTERS[Math.floor(h / 5) % REPORTERS.length]!;
  return {
    reporter: pair[0]!,
    outlet: pair[1]!,
    question: tpl.q(opponent, team),
    choices: tpl.choices,
  };
}
