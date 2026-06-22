import { NavLink } from "react-router-dom";
import { useStore } from "../store/store";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/predictions", label: "Predictions" },
  { to: "/bracket", label: "Bracket" },
  { to: "/scorers", label: "Scorers" },
  { to: "/manage", label: "Manage" },
  { to: "/methodology", label: "Method" },
  { to: "/about", label: "About" },
];

export function Header() {
  const status = useStore((s) => s.status);
  const progress = useStore((s) => s.progress);
  const seedLabel = useStore((s) => s.seedLabel);
  const setSeed = useStore((s) => s.setSeed);
  const run = useStore((s) => s.run);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const running = status === "running";

  return (
    <header className="site-header">
      <div className="wrap site-header__row">
        <NavLink to="/" className="brand" aria-label="WELTMEISTER home">
          <span className="spark chevron" aria-hidden />
          WELTMEISTER
        </NavLink>

        <nav className="nav" aria-label="Primary">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
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
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <label className="sr-only" htmlFor="seed">
            Simulation seed
          </label>
          <input
            id="seed"
            value={seedLabel}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run(false);
            }}
            spellCheck={false}
            aria-label="Simulation seed (press Enter to run this seed)"
            title="Press Enter to run this exact seed"
          />
          <button className="btn" onClick={() => void run(true)} disabled={running} title="Run a fresh simulation">
            {running ? "Running" : "Run"}
          </button>
        </div>
      </div>
      {running && (
        <div className="progress" aria-hidden>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </header>
  );
}
