import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useStore } from "../../store/store";
import { OddsRow } from "../../components/OddsRow";
import { CountUp } from "../../components/CountUp";
import { TeamBadge } from "../../components/TeamBadge";
import { oddsPct, pct } from "../../lib/format";
import { flagUrl } from "../../lib/flag";
import "./home.css";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function HomeView() {
  const model = useStore((s) => s.model);
  const result = useStore((s) => s.result);
  const single = useStore((s) => s.single);
  const status = useStore((s) => s.status);
  const runs = useStore((s) => s.runs);
  const run = useStore((s) => s.run);

  const validation = model?.validation as
    | { combined?: { model?: { rps: number }; elo_only?: { rps: number } }; calibration?: { ece: number } }
    | undefined;
  const combined = validation?.combined;
  const edge =
    combined?.model && combined?.elo_only
      ? ((combined.elo_only.rps - combined.model.rps) / combined.elo_only.rps) * 100
      : null;

  const top = result?.teams.slice(0, 10) ?? [];
  const maxChamp = top.length ? top[0]!.champion : 1;
  const reduce = useReducedMotion();
  const teams = model?.teams ?? [];
  const champGroup = single ? teams.find((t) => t.name === single.champion)?.group : undefined;
  const champOdds = single ? result?.teams.find((t) => t.team === single.champion)?.champion ?? null : null;

  // sections rise into view as they're scrolled to (static under reduced motion)
  const reveal = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 26 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.6, ease: EASE_OUT },
      };

  return (
    <div>
      <section className="hero">
        {teams.length > 0 && <FlagTicker teams={teams} />}
        <PitchBackdrop />
        <motion.img
          className="hero__ball"
          src={`${import.meta.env.BASE_URL}26.png`}
          alt=""
          aria-hidden
          initial={reduce ? false : { opacity: 0, scale: 0.9, rotate: -6 }}
          animate={
            reduce
              ? { opacity: 1 }
              : { opacity: 1, scale: 1, rotate: 0, y: [0, -16, 0] }
          }
          transition={
            reduce
              ? undefined
              : { opacity: { duration: 0.8 }, scale: { duration: 0.8 }, rotate: { duration: 0.8 }, y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.6 } }
          }
        />
        <div className="wrap hero__inner">
          <div className="hero__copy">
            <div className="eyebrow hero__eyebrow">
              <span className="hero__hosts">CAN · MEX · USA</span>
              FIFA World Cup 26 · 48 nations · 104 matches
            </div>
            <h1 className="hero__title anton" aria-label="Who wins the World Cup">
              {["WHO WINS", "THE WORLD CUP"].map((line, i) => (
                <span key={line} className="hero__title-line" aria-hidden>
                  <motion.span
                    className="hero__title-word"
                    initial={reduce ? false : { y: "115%" }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.75, ease: EASE_OUT, delay: 0.05 + i * 0.12 }}
                  >
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p
              className="hero__lede"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.3 }}
            >
              A calibrated statistical model predicts every match, simulates the whole tournament
              tens of thousands of times, and lets you take over a squad and change the outcome.
            </motion.p>
            <motion.div
              className="hero__cta"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.42 }}
            >
              <Link to="/manage" className="btn hero__cta-primary">
                Manage a nation →
              </Link>
              <button className="btn btn--ghost" onClick={() => void run(true)} disabled={status === "running"}>
                {status === "running" ? "Running simulation" : result ? "Run it again" : "Run simulation"}
              </button>
              <Link to="/bracket" className="btn btn--ghost">
                Watch the bracket
              </Link>
            </motion.div>
            {single && (
              <motion.div
                className="champ-spot"
                key={single.champion}
                initial={reduce ? false : { opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 18 }}
              >
                <span className="champ-spot__flag">
                  <TeamBadge team={single.champion} group={champGroup} size={46} />
                </span>
                <span className="champ-spot__copy">
                  <span className="eyebrow">Predicted champions · this run</span>
                  <span className="champ-spot__name anton">{single.champion}</span>
                  <span className="mono champ-spot__sub">
                    {champOdds != null ? `${oddsPct(champOdds)} to lift it · ` : ""}
                    beat {single.runnerUp} in the final
                  </span>
                </span>
              </motion.div>
            )}
          </div>

          <aside className="hero__odds flat-card">
            <div className="hero__odds-head">
              <span className="eyebrow">Title odds</span>
              <span className="mono" style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
                {result ? `${result.runs.toLocaleString()} runs` : `${runs.toLocaleString()} runs`}
              </span>
            </div>
            {top.length === 0 ? (
              <div className="hero__loading mono">
                {status === "running" ? "simulating the tournament…" : "hit run to simulate the tournament"}
              </div>
            ) : (
              <motion.div
                className="odds-list"
                key={result?.runs ?? "run"}
                initial={reduce ? false : "hidden"}
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.05 } } }}
              >
                {top.map((t, i) => (
                  <motion.div
                    key={t.team}
                    variants={{ hidden: { opacity: 0, x: -14 }, show: { opacity: 1, x: 0 } }}
                    transition={{ duration: 0.4, ease: EASE_OUT }}
                  >
                    <OddsRow team={t.team} group={t.group} value={t.champion} max={maxChamp} rank={i + 1} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </aside>
        </div>
      </section>

      <motion.section className="wrap" {...reveal}>
        <div className="proof" aria-label="How the model performs">
          <ProofItem
            value={edge}
            format={(v) => `+${v.toFixed(1)}%`}
            label="better than Elo-only on RPS"
            note="backtested on the 2018 and 2022 World Cups"
          />
          <ProofItem
            value={validation?.calibration?.ece ?? null}
            format={(v) => v.toFixed(3)}
            label="calibration error (ECE)"
            note="when it says 30%, it happens about 30% of the time"
          />
          <ProofItem
            value={model?.meta.n_fit_matches ?? null}
            format={(v) => Math.round(v).toLocaleString()}
            label="real matches fit"
            note="international results since 1872, time-weighted"
          />
        </div>
      </motion.section>

      <motion.section className="wrap" {...reveal}>
        <Link to="/manage" className="manage-cta">
          <div className="manage-cta__copy">
            <div className="eyebrow">The main event · Manager mode</div>
            <h2 className="anton">Take charge of a nation</h2>
            <p>
              Pick your XI on a drag-and-drop pitch and play every match live. Pause whenever you want
              to make subs, switch shape and read the game, and the result bends to your calls. One
              nation, one month, graded against what the model expected of your squad.
            </p>
            <span className="manage-cta__go">Play the World Cup →</span>
          </div>
          <div className="manage-cta__pitch" aria-hidden>
            <svg viewBox="0 0 60 80" preserveAspectRatio="none">
              <rect x="1" y="1" width="58" height="78" fill="none" stroke="currentColor" />
              <line x1="1" y1="40" x2="59" y2="40" stroke="currentColor" />
              <circle cx="30" cy="40" r="8" fill="none" stroke="currentColor" />
              <rect x="18" y="1" width="24" height="11" fill="none" stroke="currentColor" />
              <rect x="18" y="68" width="24" height="11" fill="none" stroke="currentColor" />
            </svg>
          </div>
        </Link>
      </motion.section>

      {result && (
        <motion.section className="wrap" {...reveal}>
          <div className="section-head">
            <h2>Most likely to advance</h2>
          </div>
          <div className="advance-grid">
            {[...result.teams]
              .sort((a, b) => b.advance - a.advance)
              .slice(0, 12)
              .map((t) => (
                <div key={t.team} className="advance-cell flat-card">
                  <OddsRow team={t.team} group={t.group} value={t.advance} accent="var(--mex-green)" />
                  <div className="mono advance-cell__sub">
                    win group <CountUp value={t.winGroup} format={(v) => pct(v)} /> · reach SF{" "}
                    <CountUp value={t.semi} format={oddsPct} />
                  </div>
                </div>
              ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}

// A broadcast-style ticker of every qualified nation's flag, scrolling across the
// top of the hero. The list is doubled so the loop is seamless.
function FlagTicker({ teams }: { teams: { name: string }[] }) {
  const flags = teams.map((t) => flagUrl(t.name)).filter((u): u is string => !!u);
  const row = [...flags, ...flags];
  return (
    <div className="flag-ticker" aria-hidden>
      <div className="flag-ticker__track">
        {row.map((url, i) => (
          <img key={i} className="flag-ticker__flag" src={url} alt="" loading="lazy" decoding="async" />
        ))}
      </div>
    </div>
  );
}

// Faint tactics-board pitch markings behind the hero.
function PitchBackdrop() {
  return (
    <svg className="hero__pitch" viewBox="0 0 100 120" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="0.25">
        <line x1="0" y1="60" x2="100" y2="60" />
        <circle cx="50" cy="60" r="14" />
        <circle cx="50" cy="60" r="0.8" fill="currentColor" stroke="none" />
        <rect x="28" y="0" width="44" height="18" />
        <rect x="40" y="0" width="20" height="7" />
        <rect x="28" y="102" width="44" height="18" />
        <rect x="40" y="113" width="20" height="7" />
        <path d="M36 18 A14 14 0 0 0 64 18" />
        <path d="M36 102 A14 14 0 0 1 64 102" />
      </g>
    </svg>
  );
}

function ProofItem({
  value,
  format,
  label,
  note,
}: {
  value: number | null;
  format: (v: number) => string;
  label: string;
  note: string;
}) {
  return (
    <div className="proof__item">
      <div className="proof__value anton">
        {value === null ? "—" : <CountUp value={value} format={format} />}
      </div>
      <div className="proof__label">{label}</div>
      <div className="proof__note mono">{note}</div>
    </div>
  );
}
