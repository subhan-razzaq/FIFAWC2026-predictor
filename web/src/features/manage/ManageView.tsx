import { useMemo, useState } from "react";
import type { SquadPlayer, TeamOdds } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import { FORMATIONS, defaultElevenFor, managedRatings, managedScorers } from "../../lib/manage";
import { FormationPitch } from "./FormationPitch";
import { CountUp } from "../../components/CountUp";
import { TeamBadge } from "../../components/TeamBadge";
import { oddsPct, pct } from "../../lib/format";
import "./manage.css";

const FORMATION_NAMES = Object.keys(FORMATIONS);

export function ManageView() {
  const model = useStore((s) => s.model);
  const baseline = useStore((s) => s.baseline);
  const manageResult = useStore((s) => s.manageResult);
  const manageRunning = useStore((s) => s.manageRunning);
  const manageProgress = useStore((s) => s.manageProgress);
  const runManage = useStore((s) => s.runManage);

  const teamsSorted = useMemo(
    () => [...(model?.teams ?? [])].sort((a, b) => b.rating - a.rating),
    [model],
  );

  const [team, setTeam] = useState<string>("");
  const [formation, setFormation] = useState("4-3-3");
  const [eleven, setEleven] = useState<string[]>([]);
  const [captain, setCaptain] = useState("");
  const [penaltyTaker, setPenaltyTaker] = useState("");
  const [attackBias, setAttackBias] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  // bench players (squad minus eleven), grouped by position
  const benchByPos = useMemo(() => {
    const out: Record<string, SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
    const squad = model && team ? model.squads[team] : null;
    if (!squad) return out;
    const set = new Set(eleven);
    for (const p of squad.players) if (!set.has(p.name)) out[p.group]?.push(p);
    for (const k of Object.keys(out)) out[k]!.sort((a, b) => b.ability - a.ability);
    return out;
  }, [model, team, eleven]);

  // initialise on first team choice
  const pickTeam = (name: string) => {
    if (!model) return;
    const squad = model.squads[name]!;
    const xi = defaultElevenFor(squad, "4-3-3");
    setTeam(name);
    setFormation("4-3-3");
    setEleven(xi);
    setCaptain(xi.includes(squad.captain) ? squad.captain : xi[0]!);
    setPenaltyTaker(xi.includes(squad.penalty_taker) ? squad.penalty_taker : xi[10] ?? xi[0]!);
    setAttackBias(0);
    setSelected(null);
  };

  const changeFormation = (f: string) => {
    if (!model || !team) return;
    const squad = model.squads[team]!;
    const xi = defaultElevenFor(squad, f);
    setFormation(f);
    setEleven(xi);
    if (!xi.includes(captain)) setCaptain(xi[0]!);
    if (!xi.includes(penaltyTaker)) setPenaltyTaker(xi[10] ?? xi[0]!);
    setSelected(null);
  };

  if (!model) return null;
  const squad = team ? model.squads[team] : null;
  const teamRating = team ? model.teams.find((t) => t.name === team)! : null;

  const swapIn = (benchName: string) => {
    if (!squad) return;
    const benchP = squad.players.find((p) => p.name === benchName)!;
    // if a starter of the same position is selected, swap that one; else weakest
    const set = new Set(eleven);
    let target = selected && set.has(selected) ? selected : null;
    if (target) {
      const selP = squad.players.find((p) => p.name === target)!;
      if (selP.group !== benchP.group) target = null; // only swap like-for-like
    }
    if (!target) {
      const sameGroupStarters = eleven
        .map((n) => squad.players.find((p) => p.name === n)!)
        .filter((p) => p.group === benchP.group)
        .sort((a, b) => a.ability - b.ability);
      target = sameGroupStarters[0]?.name ?? null;
    }
    if (!target) return;
    setEleven(eleven.map((n) => (n === target ? benchName : n)));
    if (captain === target) setCaptain(benchName);
    if (penaltyTaker === target) setPenaltyTaker(benchName);
    setSelected(null);
  };

  // live rating preview
  const live = team
    ? managedRatings(model, team, eleven, formation, attackBias)
    : { atk: 0, def: 0 };
  const dRating = teamRating ? live.atk + live.def - teamRating.rating : 0;
  const scorerPreview = squad ? managedScorers(squad, eleven, penaltyTaker).open_play.slice(0, 5) : [];

  const run = () => {
    if (!team || !squad) return;
    const overrides = {
      ratings: { [team]: { atk: live.atk, def: live.def } },
      scorers: { [team]: managedScorers(squad, eleven, penaltyTaker) },
    };
    void runManage(overrides);
  };

  const managedOdds = manageResult?.teams.find((t) => t.team === team);
  const baseOdds = baseline?.teams.find((t) => t.team === team);

  return (
    <div className="wrap">
      <div className="section-head">
        <div>
          <div className="eyebrow">Manage mode</div>
          <h2>Take over a squad</h2>
        </div>
        <select
          className="team-select"
          value={team}
          onChange={(e) => pickTeam(e.target.value)}
          aria-label="Choose a team to manage"
        >
          <option value="">Choose a team…</option>
          {teamsSorted.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {!team || !squad ? (
        <p className="mono" style={{ color: "var(--text-faint)" }}>
          Pick a team, set its lineup and shape, then re-run the tournament to see how far it goes.
        </p>
      ) : (
        <div className="manage-grid">
          <div className="manage-pitch-col">
            <div className="manage-formation">
              {FORMATION_NAMES.map((f) => (
                <button
                  key={f}
                  className={`group-tab ${f === formation ? "active" : ""}`}
                  style={{ width: "auto", padding: "0 10px" }}
                  onClick={() => changeFormation(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <FormationPitch
              squad={squad}
              eleven={eleven}
              formation={formation}
              group={teamRating!.group}
              captain={captain}
              penaltyTaker={penaltyTaker}
              selected={selected}
              onSelectSlot={(p) => setSelected(selected === p ? null : p)}
            />
            <p className="mono manage-hint">
              {selected ? `Selected ${selected}. Tap a substitute below to swap.` : "Tap a player, then a substitute to swap."}
            </p>
          </div>

          <div className="manage-controls">
            <div className="manage-ratings flat-card">
              <div className="manage-ratings__row">
                <span>Attack</span>
                <span className="mono">{live.atk.toFixed(3)}</span>
              </div>
              <div className="manage-ratings__row">
                <span>Defence</span>
                <span className="mono">{live.def.toFixed(3)}</span>
              </div>
              <div className="manage-ratings__row manage-ratings__overall">
                <span>Overall vs default</span>
                <span className="mono" style={{ color: dRating >= 0 ? "var(--mex-green)" : "var(--can-red)" }}>
                  {dRating >= 0 ? "+" : ""}
                  {dRating.toFixed(3)}
                </span>
              </div>
            </div>

            <label className="manage-slider">
              <span className="mono">
                Tactical shape <em>{attackBias < -0.05 ? "defensive" : attackBias > 0.05 ? "attacking" : "balanced"}</em>
              </span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={attackBias}
                onChange={(e) => setAttackBias(Number(e.target.value))}
              />
            </label>

            <div className="manage-pickers">
              <label>
                <span className="mono">Captain</span>
                <select value={captain} onChange={(e) => setCaptain(e.target.value)}>
                  {eleven.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mono">Penalties</span>
                <select value={penaltyTaker} onChange={(e) => setPenaltyTaker(e.target.value)}>
                  {eleven.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="manage-bench">
              <div className="eyebrow">Substitutes</div>
              {(["GK", "DF", "MF", "FW"] as const).map((pos) => (
                <div key={pos} className="manage-bench__group">
                  <span className="manage-bench__pos mono">{pos}</span>
                  <div className="manage-bench__list">
                    {benchByPos[pos]?.map((p) => (
                      <button key={p.name} className="manage-bench__player" onClick={() => swapIn(p.name)} title={p.club}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button className="btn manage-run" onClick={run} disabled={manageRunning}>
              {manageRunning ? `Simulating ${Math.round(manageProgress * 100)}%` : "Run manage simulation"}
            </button>

            <div className="manage-scorers">
              <div className="eyebrow">Projected scorers</div>
              {scorerPreview.map((s) => (
                <div key={s.player} className="manage-scorers__row mono">
                  <span>{s.player}</span>
                  <span>{pct(s.weight)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="manage-howfar">
            <div className="manage-howfar__head">
              <TeamBadge team={team} group={teamRating!.group} size={28} />
              <div>
                <div className="anton" style={{ fontSize: "1.4rem" }}>{team}</div>
                <div className="mono" style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
                  how far they go
                </div>
              </div>
            </div>
            {managedOdds ? (
              <HowFar managed={managedOdds} base={baseOdds} />
            ) : (
              <p className="mono" style={{ color: "var(--text-faint)" }}>
                Set your lineup and run the simulation to see the team's path.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HowFar({ managed, base }: { managed: TeamOdds; base?: TeamOdds }) {
  const rows: { label: string; key: keyof TeamOdds }[] = [
    { label: "Win group", key: "winGroup" },
    { label: "Advance", key: "advance" },
    { label: "Round of 16", key: "round16" },
    { label: "Quarter-final", key: "quarter" },
    { label: "Semi-final", key: "semi" },
    { label: "Final", key: "final" },
    { label: "Champion", key: "champion" },
  ];
  return (
    <div className="howfar">
      {rows.map((r) => {
        const v = managed[r.key] as number;
        const b = base ? (base[r.key] as number) : undefined;
        const d = b !== undefined ? v - b : undefined;
        return (
          <div key={r.key} className="howfar__row">
            <span className="howfar__label">{r.label}</span>
            <span className="howfar__bar">
              <span style={{ width: `${Math.min(100, v * 100)}%` }} />
            </span>
            <CountUp className="mono howfar__val" value={v} format={oddsPct} />
            {d !== undefined && (
              <span
                className="mono howfar__delta"
                style={{ color: d >= 0.0005 ? "var(--mex-green)" : d <= -0.0005 ? "var(--can-red)" : "var(--text-faint)" }}
              >
                {d >= 0 ? "+" : ""}
                {(d * 100).toFixed(1)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
