import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../../store/store";
import "./about.css";

const REPO = "https://github.com/subhan-razzaq/FIFAWC2026-predictor";

export function AboutView() {
  const model = useStore((s) => s.model);

  return (
    <div className="about">
      <section className="about-hero">
        <div className="wrap">
          <div className="eyebrow">About the project</div>
          <h2 className="anton about-title">
            A real model,
            <br />
            not a toy
          </h2>
          <p className="about-lede">
            WELTMEISTER predicts every match of the 2026 World Cup, simulates the whole tournament tens
            of thousands of times, and lets you take over a squad and change how it ends. The model is
            fit on real data, it is calibrated, and every run is reproducible from a seed.
          </p>
          <div className="about-cta">
            <Link to="/" className="btn">
              Run the simulation
            </Link>
            <Link to="/methodology" className="btn btn--ghost">
              Read the methodology
            </Link>
            <a href={REPO} className="btn btn--ghost" target="_blank" rel="noreferrer">
              View the code
            </a>
          </div>
        </div>
      </section>

      <div className="wrap about-grid">
        <Panel n="01" title="The prediction engine">
          A Dixon-Coles adjusted Poisson, fit by maximum likelihood on international results going back
          to 1872 with an exponential time decay, then blended with an Elo prior and a squad-quality
          prior. It beats an Elo-only baseline on Ranked Probability Score across the 2018 and 2022
          World Cups and is well calibrated. Built and verified from scratch.
        </Panel>
        <Panel n="02" title="The simulation">
          A deterministic, seeded Monte Carlo engine in TypeScript runs entirely in the browser, in a
          Web Worker, so manage-mode re-sims feel instant and the site deploys as a static page. It
          plays the real 2026 format: 12 groups, the official tie-breakers, the eight best third-placed
          teams, the real Round of 32 bracket, extra time and penalties.
        </Panel>
        <Panel n="03" title="Manage mode">
          Take control of any of the 48 squads, arrange the eleven on a formation pitch, pick the shape
          and the takers, and trade attack for defence. The chosen eleven recomputes the team's
          squad-quality aggregate through the same blend the engine uses, then the tournament re-runs to
          show how far the team goes.
        </Panel>
        <Panel n="04" title="The data">
          Real international results from the martj42 dataset, an Elo computed in-repo from those
          results, and the official 2026 squad lists for the projected elevens and the Golden Boot race.
          Everything is pulled once, cached, and frozen. Nothing is fetched at page load.
        </Panel>
        <Panel n="05" title="The design">
          Built on the real 2026 visual language: a black, white and gold core with the three host
          nations, Canada red, USA blue and Mexico green, as the working colour system. Sharp edges,
          flat colour blocks, broadcast energy. The badges and motifs are original work, not FIFA marks.
        </Panel>
        <Panel n="06" title="The stack">
          Python with numpy and scipy for the offline fit and validation, a dependency-free TypeScript
          Monte Carlo core, and React with Vite, Zustand and Framer Motion for the app. TypeScript
          strict throughout. Deployed static on Vercel.
        </Panel>
      </div>

      <div className="wrap about-foot">
        <p className="mono">
          An independent portfolio project. Not affiliated with or endorsed by FIFA.
          {model ? ` Model snapshot ${model.meta.snapshot_date}, fit on ${model.meta.n_fit_matches.toLocaleString()} matches.` : ""}
        </p>
      </div>
    </div>
  );
}

function Panel({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <article className="about-panel">
      <div className="about-panel__n anton">{n}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}
