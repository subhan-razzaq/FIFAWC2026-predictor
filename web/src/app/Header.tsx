import { NavLink } from "react-router-dom";
import { useStore } from "../store/store";

const LINKS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/manage", label: "Manager", primary: true },
  { to: "/results", label: "Match Center" },
  { to: "/bracket", label: "Bracket" },
  { to: "/scorers", label: "Stats" },
  { to: "/methodology", label: "Method" },
  { to: "/about", label: "About" },
];

const RUN_OPTIONS = [5000, 10000, 25000, 50000];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={12 + Math.cos(r) * 7}
            y1={12 + Math.sin(r) * 7}
            x2={12 + Math.cos(r) * 9.4}
            y2={12 + Math.sin(r) * 9.4}
          />
        );
      })}
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
      <path d="M20 14.2A8 8 0 1 1 9.8 4 6.4 6.4 0 0 0 20 14.2Z" />
    </svg>
  );
}

export function Header() {
  const status = useStore((s) => s.status);
  const progress = useStore((s) => s.progress);
  const runs = useStore((s) => s.runs);
  const setRuns = useStore((s) => s.setRuns);
  const run = useStore((s) => s.run);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const running = status === "running";

  return (
    <header className="site-header">
      <div className="wrap site-header__row">
        <NavLink to="/" className="brand" aria-label="WELTMEISTER home">
          <img src={`${import.meta.env.BASE_URL}26.png`} className="brand-logo" alt="" width={30} height={30} />
          WELTMEISTER
        </NavLink>

        <nav className="nav" aria-label="Primary">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `${isActive ? "active" : ""}${l.primary ? " nav-primary" : ""}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="simctl">
          <button
            className="btn btn--ghost theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <select
            className="runs-select"
            value={runs}
            onChange={(e) => setRuns(Number(e.target.value))}
            disabled={running}
            aria-label="Number of simulated tournaments"
            title="Tournaments per run: more runs tighten the odds"
          >
            {RUN_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {(n / 1000).toLocaleString()}k runs
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => void run(true)} disabled={running} title="Run a fresh simulation">
            {running ? "Running" : "Run"}
          </button>
        </div>
      </div>
      {running && (
        <div
          className="progress"
          role="progressbar"
          aria-label="Simulation progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </header>
  );
}
