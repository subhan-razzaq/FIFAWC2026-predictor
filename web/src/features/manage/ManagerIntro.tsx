// Manager Mode landing, shown before a nation is chosen. A slim loop ribbon up
// top, then the full field of 48 as a browsable mosaic: filter by the challenge
// (favourite down to underdog), search by name, or roll a random one. Each tile
// carries the flag, FIFA rank, a strength meter and a group-coloured accent, so
// the whole grid reads as the tournament's spectrum.

import { useMemo, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Model, TeamRating } from "@weltmeister/sim";
import { TeamBadge } from "../../components/TeamBadge";
import { groupColor } from "../../design/colors";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const STEPS = ["Pick your XI", "Play it live", "Adapt at the break", "Get graded"];

type Tier = "favourite" | "contender" | "darkhorse" | "underdog";
type Filter = "all" | "host" | Tier;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All 48" },
  { key: "favourite", label: "Favourites" },
  { key: "contender", label: "Contenders" },
  { key: "darkhorse", label: "Dark horses" },
  { key: "underdog", label: "Underdogs" },
  { key: "host", label: "Hosts" },
];

const TIER_LABEL: Record<Tier | "host", string> = {
  favourite: "Favourite",
  contender: "Contender",
  darkhorse: "Dark horse",
  underdog: "Underdog",
  host: "Host nation",
};

function tierOf(rankIndex: number): Tier {
  if (rankIndex < 4) return "favourite";
  if (rankIndex < 12) return "contender";
  if (rankIndex < 28) return "darkhorse";
  return "underdog";
}

interface Props {
  model: Model;
  onPick: (team: string) => void;
}

export function ManagerIntro({ model, onPick }: Props) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...model.teams].sort((a, b) => b.rating - a.rating), [model]);
  const rankIndex = useMemo(() => new Map(sorted.map((t, i) => [t.name, i])), [sorted]);
  const [lo, hi] = useMemo(() => {
    const rs = sorted.map((t) => t.rating);
    return [Math.min(...rs), Math.max(...rs)];
  }, [sorted]);
  const strength = (t: TeamRating) => (hi > lo ? (t.rating - lo) / (hi - lo) : 0.5);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((t) => {
      if (filter === "host" && !t.host) return false;
      if (filter !== "all" && filter !== "host" && tierOf(rankIndex.get(t.name)!) !== filter) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, rankIndex, filter, query]);

  const surprise = () => {
    const pool = list.length ? list : sorted;
    onPick(pool[Math.floor(Math.random() * pool.length)]!.name);
  };

  const itemVar = reduce ? undefined : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="mintro">
      <ol className="mintro__stepper">
        {STEPS.map((s, i) => (
          <li key={s} className="mintro__beat">
            <b className="mono">{i + 1}</b>
            {s}
          </li>
        ))}
      </ol>

      <div className="mintro__bar">
        <div className="mintro__filters" role="group" aria-label="Filter nations by challenge">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`group-tab ${filter === f.key ? "active" : ""}`}
              style={{ width: "auto", padding: "0 12px" }}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mintro__tools">
          <input
            className="mintro__search"
            type="search"
            placeholder="Search nation…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search for a nation"
          />
          <button className="btn btn--ghost mintro__surprise" onClick={surprise}>
            Surprise me
          </button>
        </div>
      </div>

      <motion.div
        key={filter}
        className="mintro__grid"
        initial={reduce ? false : "hidden"}
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.016 } } }}
      >
        {list.map((t) => {
          const i = rankIndex.get(t.name)!;
          const tier: Tier | "host" = t.host ? "host" : tierOf(i);
          const pips = Math.max(1, Math.round(strength(t) * 5));
          return (
            <motion.button
              key={t.name}
              className="mteam"
              style={{ "--accent": groupColor(t.group) } as CSSProperties}
              variants={itemVar}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              onClick={() => onPick(t.name)}
              title={`${t.name} — Group ${t.group}, FIFA #${t.fifa_rank}`}
            >
              <span className="mteam__top">
                <TeamBadge team={t.name} group={t.group} size={30} />
                <span className="mteam__rank mono">#{t.fifa_rank}</span>
              </span>
              <span className="mteam__name">{t.name}</span>
              <span className="mteam__meta">
                <span className="mteam__pips" aria-label={`strength ${pips} of 5`}>
                  {Array.from({ length: 5 }).map((_, k) => (
                    <i key={k} className={k < pips ? "on" : ""} />
                  ))}
                </span>
                <span className="mteam__tier mono">{TIER_LABEL[tier]}</span>
              </span>
            </motion.button>
          );
        })}
      </motion.div>
      {list.length === 0 && <p className="mintro__none mono">No nation matches “{query.trim()}”.</p>}
    </div>
  );
}
