// Whole-tournament stat lines for a manager's run, the manage-mode answer to the
// Golden Boot and team tables on the simulation Stats page. Everything here is read
// straight off the matches the manager actually played: their squad's scorers and
// assisters, clean sheets, goals for and against, discipline and their results.

import type { GoalEvent, Model } from "@weltmeister/sim";
import type { PlayedMatch } from "../../store/store";
import { PlayerAvatar } from "../../components/PlayerAvatar";

interface Tally {
  player: string;
  value: number;
}

interface Stats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  cleanSheets: number;
  yellows: number;
  reds: number;
  scorers: Tally[];
  assisters: Tally[];
}

function aggregate(team: string, played: PlayedMatch[]): Stats {
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const s: Stats = {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gf: 0,
    ga: 0,
    cleanSheets: 0,
    yellows: 0,
    reds: 0,
    scorers: [],
    assisters: [],
  };

  for (const m of played) {
    const r = m.result;
    const isHome = r.home === team;
    const gf = isHome ? r.homeGoals : r.awayGoals;
    const ga = isHome ? r.awayGoals : r.homeGoals;
    s.played += 1;
    s.gf += gf;
    s.ga += ga;
    if (ga === 0) s.cleanSheets += 1;
    const won = r.winner ? r.winner === team : gf > ga;
    const drew = !r.winner && gf === ga;
    if (won) s.wins += 1;
    else if (drew) s.draws += 1;
    else s.losses += 1;

    for (const g of r.scorers as GoalEvent[]) {
      if (g.team !== team || g.kind === "own" || g.player === "Unattributed") continue;
      goals.set(g.player, (goals.get(g.player) ?? 0) + 1);
    }
    for (const e of m.enriched.events) {
      if (e.team !== team) continue;
      if (e.type === "goal" && e.assist) assists.set(e.assist, (assists.get(e.assist) ?? 0) + 1);
      else if (e.type === "yellow") s.yellows += 1;
      else if (e.type === "red") s.reds += 1;
    }
  }

  const rank = (m: Map<string, number>): Tally[] =>
    [...m.entries()].map(([player, value]) => ({ player, value })).sort((a, b) => b.value - a.value);
  s.scorers = rank(goals);
  s.assisters = rank(assists);
  return s;
}

function Leaders({ title, unit, rows, photoOf }: { title: string; unit: string; rows: Tally[]; photoOf: Map<string, string | null> }) {
  if (rows.length === 0) return null;
  const top = rows.slice(0, 6);
  return (
    <div className="tstats-board flat-card">
      <div className="eyebrow">{title}</div>
      <ol className="tstats-leaders">
        {top.map((row, i) => (
          <li key={row.player} className="tstats-leader">
            <span className="tstats-leader__rank mono">{i + 1}</span>
            <span className="tstats-leader__face">
              <PlayerAvatar photo={photoOf.get(row.player)} name={row.player} />
            </span>
            <span className="tstats-leader__name">{row.player}</span>
            <span className="tstats-leader__val mono">
              {row.value} {unit}
              {row.value === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TournamentStats({ model, team, played }: { model: Model; team: string; played: PlayedMatch[] }) {
  if (played.length === 0) return null;
  const s = aggregate(team, played);
  const squad = model.squads[team];
  const photoOf = new Map<string, string | null>((squad?.players ?? []).map((p) => [p.name, p.photo ?? null]));
  const gd = s.gf - s.ga;

  const cells: { label: string; value: string }[] = [
    { label: "Played", value: String(s.played) },
    { label: "Record", value: `${s.wins}-${s.draws}-${s.losses}` },
    { label: "Goals for", value: String(s.gf) },
    { label: "Goals against", value: String(s.ga) },
    { label: "Goal diff", value: gd > 0 ? `+${gd}` : String(gd) },
    { label: "Clean sheets", value: String(s.cleanSheets) },
    { label: "Yellows", value: String(s.yellows) },
    { label: "Reds", value: String(s.reds) },
  ];

  return (
    <div className="tstats">
      <div className="eyebrow">Tournament stats · {team}</div>
      <div className="tstats-grid">
        {cells.map((c) => (
          <div key={c.label} className="tstats-cell flat-card">
            <span className="tstats-cell__val anton">{c.value}</span>
            <span className="tstats-cell__label mono">{c.label}</span>
          </div>
        ))}
      </div>
      <div className="tstats-boards">
        <Leaders title="Golden Boot" unit="goal" rows={s.scorers} photoOf={photoOf} />
        <Leaders title="Top assists" unit="assist" rows={s.assisters} photoOf={photoOf} />
      </div>
    </div>
  );
}
