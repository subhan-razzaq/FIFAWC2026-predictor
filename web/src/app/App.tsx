import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useStore } from "../store/store";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { HomeView } from "../features/home/HomeView";
import { PredictionsView } from "../features/predictions/PredictionsView";
import { BracketView } from "../features/bracket/BracketView";
import { ScorersView } from "../features/scorers/ScorersView";
import { ManageView } from "../features/manage/ManageView";
import { MethodologyView } from "../features/methodology/MethodologyView";
import { AboutView } from "../features/about/AboutView";
import "./app.css";

export function App() {
  const status = useStore((s) => s.status);
  const result = useStore((s) => s.result);
  const init = useStore((s) => s.init);
  const run = useStore((s) => s.run);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    void init();
  }, [init]);

  // apply the theme at the document level so the page background adapts too
  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", theme === "light");
  }, [theme]);

  // do not auto-run: a prediction runs only when the user clicks. The one
  // exception is a shared ?seed link, which reproduces that exact tournament.
  useEffect(() => {
    if (status === "ready" && !result && new URLSearchParams(window.location.search).has("seed")) {
      void run(false);
    }
  }, [status, result, run]);

  if (status === "error") {
    return (
      <div className="boot-error">
        <h1>Could not load the model</h1>
        <p className="mono">{useStore.getState().error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/predictions" element={<PredictionsView />} />
          <Route path="/bracket" element={<BracketView />} />
          <Route path="/scorers" element={<ScorersView />} />
          <Route path="/manage" element={<ManageView />} />
          <Route path="/methodology" element={<MethodologyView />} />
          <Route path="/about" element={<AboutView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
