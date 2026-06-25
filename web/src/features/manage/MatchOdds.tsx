// Live match odds for the upcoming fixture. Recomputed from the chosen XI,
// formation and tactics through the real Dixon-Coles maths, so the bar swings as
// the manager changes the plan, the shape, or rests a tired player.

import { useMemo } from "react";
import type { ManagedMatchInfo, Model } from "@weltmeister/sim";
import { managedMatchOdds } from "../../lib/manage";
import type { PlayerStates } from "../../lib/cards";
import type { MatchSettings } from "../../store/store";
import { oddsPct } from "../../lib/format";

interface Props {
  model: Model;
  team: string;
  current: ManagedMatchInfo;
  draft: MatchSettings;
  states: PlayerStates;
}

function verdict(win: number, loss: number): string {
  const edge = win - loss;
  if (edge >= 0.25) return "Clear favourites";
  if (edge >= 0.08) return "Edge to you";
  if (edge <= -0.25) return "Big underdogs";
  if (edge <= -0.08) return "Slight underdogs";
  return "Too close to call";
}

export function MatchOdds({ model, team, current, draft, states }: Props) {
  const odds = useMemo(
    () =>
      managedMatchOdds(model, team, current.opponent, draft.eleven, draft.formation, draft.tactics, states, {
        isHome: current.isHome,
        hostHome: current.hostHome,
        hostAway: current.hostAway,
      }),
    [model, team, current, draft, states],
  );

  const total = odds.win + odds.draw + odds.loss || 1;
  const seg = (v: number) => `${(v / total) * 100}%`;

  return (
    <div className="modds flat-card">
      <div className="modds__top">
        <span className="eyebrow">Match odds</span>
        <span className="mono modds__verdict">{verdict(odds.win, odds.loss)}</span>
      </div>
      <div
        className="modds__bar"
        role="img"
        aria-label={`Win ${oddsPct(odds.win)}, draw ${oddsPct(odds.draw)}, ${current.opponent} ${oddsPct(odds.loss)}`}
      >
        <span className="modds__seg modds__seg--win" style={{ width: seg(odds.win) }} />
        <span className="modds__seg modds__seg--draw" style={{ width: seg(odds.draw) }} />
        <span className="modds__seg modds__seg--loss" style={{ width: seg(odds.loss) }} />
      </div>
      <div className="modds__legend mono">
        <span>
          <b className="modds__key modds__key--win" />Win {oddsPct(odds.win)}
        </span>
        <span>
          <b className="modds__key modds__key--draw" />Draw {oddsPct(odds.draw)}
        </span>
        <span>
          <b className="modds__key modds__key--loss" />Loss {oddsPct(odds.loss)}
        </span>
      </div>
    </div>
  );
}
