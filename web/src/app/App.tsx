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
import "./app.css";

export function App() {
  const status = useStore((s) => s.status);
  const result = useStore((s) => s.result);
  const init = useStore((s) => s.init);
  const runSimulation = useStore((s) => s.runSimulation);

  useEffect(() => {
    void init();
  }, [init]);

  // run the headline simulation once the model is ready
  useEffect(() => {
    if (status === "ready" && !result) void runSimulation();
  }, [status, result, runSimulation]);

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
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/predictions" element={<PredictionsView />} />
          <Route path="/bracket" element={<BracketView />} />
          <Route path="/scorers" element={<ScorersView />} />
          <Route path="/manage" element={<ManageView />} />
          <Route path="/methodology" element={<MethodologyView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
