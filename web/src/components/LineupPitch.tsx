// FotMob-style lineup: one team's eleven on a vertical pitch. Each player is a
// circular token with a jersey number, a colour-graded match rating, and icons
// for goals, assists, bookings, the captaincy, substitutions and man of the
// match. A footer carries the flag, team, formation and the average rating.

import type { MatchEvent, MatchLineup } from "@weltmeister/sim";
import { FORMATIONS } from "../lib/manage";
import { flagUrl } from "../lib/flag";
import { BallIcon, BootIcon, CardIcon } from "./icons";
import "./lineup.css";

interface Props {
  lineup: MatchLineup;
  events: MatchEvent[];
  side: "home" | "away";
  team: string;
}

interface PlayerStat {
  goals: number;
  assists: number;
  yellow: boolean;
  red: boolean;
  subOff?: number;
}

function ratingColor(r: number, motm: boolean): string {
  if (motm) return "#1f6fd6";
  if (r >= 7.5) return "#0a8a3f";
  if (r >= 7.0) return "#2c9e4f";
  if (r >= 6.5) return "#7a9c2c";
  if (r >= 6.0) return "#d98a1f";
  return "#cf4a39";
}

const RING: Record<string, string> = {
  GK: "var(--gold)",
  DF: "var(--usa-blue)",
  MF: "var(--mex-green)",
  FW: "var(--can-red)",
};

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

export function LineupPitch({ lineup, events, side, team }: Props) {
  const slots = FORMATIONS[lineup.formation]?.slots ?? FORMATIONS["4-3-3"]!.slots;

  // per-player event summary for this side
  const stats = new Map<string, PlayerStat>();
  const get = (n: string) => {
    let s = stats.get(n);
    if (!s) {
      s = { goals: 0, assists: 0, yellow: false, red: false };
      stats.set(n, s);
    }
    return s;
  };
  for (const e of events) {
    if (e.side !== side) continue;
    if (e.type === "goal") {
      get(e.player).goals++;
      if (e.assist) get(e.assist).assists++;
    } else if (e.type === "yellow") get(e.player).yellow = true;
    else if (e.type === "red") get(e.player).red = true;
    else if (e.type === "sub") get(e.player).subOff = e.minute;
  }

  const avg =
    lineup.starters.length > 0
      ? (lineup.starters.reduce((s, p) => s + p.rating, 0) / lineup.starters.length).toFixed(1)
      : "—";
  const flag = flagUrl(team);

  return (
    <div className="lp">
      <div className="lp__pitch">
        <svg className="lp__lines" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden>
          <rect x="1" y="1" width="98" height="128" fill="none" stroke="rgba(246,244,239,0.16)" />
          <line x1="1" y1="65" x2="99" y2="65" stroke="rgba(246,244,239,0.16)" />
          <circle cx="50" cy="65" r="11" fill="none" stroke="rgba(246,244,239,0.16)" />
          <rect x="28" y="1" width="44" height="16" fill="none" stroke="rgba(246,244,239,0.16)" />
          <rect x="28" y="113" width="44" height="16" fill="none" stroke="rgba(246,244,239,0.16)" />
        </svg>
        {lineup.starters.map((p, i) => {
          const slot = slots[i] ?? { x: 50, y: 50 };
          const st = stats.get(p.name) ?? { goals: 0, assists: 0, yellow: false, red: false };
          return (
            <div key={p.name} className="lp__player" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
              <div className="lp__avatar-wrap">
                <div className="lp__avatar" style={{ borderColor: RING[p.pos] ?? "var(--steel)" }}>
                  <svg viewBox="0 0 40 40" aria-hidden>
                    <circle cx="20" cy="15.5" r="7" fill="rgba(246,244,239,0.82)" />
                    <path d="M7 39 a13 13 0 0 1 26 0 Z" fill="rgba(246,244,239,0.82)" />
                  </svg>
                </div>
                <span className="lp__rating mono" style={{ background: ratingColor(p.rating, p.motm) }}>
                  {p.motm && <i className="lp__star">★</i>}
                  {p.rating.toFixed(1)}
                </span>
                {p.captain && <span className="lp__cap">C</span>}
                {st.subOff !== undefined && (
                  <span className="lp__suboff mono" title={`Substituted at ${st.subOff}'`}>
                    <span className="lp__subarrow" />
                    {st.subOff}&prime;
                  </span>
                )}
              </div>
              {(st.goals > 0 || st.assists > 0 || st.yellow || st.red) && (
                <span className="lp__icons">
                  {Array.from({ length: Math.min(st.goals, 4) }).map((_, k) => (
                    <BallIcon key={`g${k}`} size={11} />
                  ))}
                  {st.assists > 0 && <BootIcon size={11} />}
                  {st.red ? <CardIcon kind="red" /> : st.yellow ? <CardIcon kind="yellow" /> : null}
                </span>
              )}
              <span className="lp__name">
                <b className="lp__name-num mono">{p.number || i + 1}</b> {lastName(p.name)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="lp__foot">
        <span className="lp__foot-rating mono" style={{ background: ratingColor(Number(avg), false) }}>
          {avg}
        </span>
        {flag && <img className="lp__foot-flag" src={flag} alt="" width={22} height={15} loading="lazy" />}
        <span className="lp__foot-team">{team}</span>
        <span className="mono lp__foot-form">{lineup.formation}</span>
      </div>
    </div>
  );
}
