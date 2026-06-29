// The pre-match press conference. The room is a broadcast interview board, a
// reporter puts a question that types itself out letter by letter, and the manager
// picks from a few replies. The choice moves dressing-room morale and fan happiness,
// and the room reacts before the manager heads to the tunnel.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../../store/store";
import { pressQuestion, type PressChoice } from "../../lib/press";

export function PressConference({
  seed,
  team,
  opponent,
  matchday,
  onDone,
}: {
  seed: number;
  team: string;
  opponent: string;
  matchday: number;
  onDone: () => void;
}) {
  const answerPress = useStore((s) => s.answerPress);
  const q = pressQuestion(seed, team, opponent, matchday);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<PressChoice | null>(null);

  // type the question out, a few characters at a time
  useEffect(() => {
    setTyped("");
    let i = 0;
    const full = q.question;
    const timer = window.setInterval(() => {
      i += 2;
      setTyped(full.slice(0, i));
      if (i >= full.length) window.clearInterval(timer);
    }, 28);
    return () => window.clearInterval(timer);
  }, [q.question]);

  const ready = typed.length >= q.question.length;

  const choose = (c: PressChoice) => {
    if (picked) return;
    setPicked(c);
    answerPress(c.morale, c.fans);
  };

  return (
    <div className="presser">
      <div className="presser__board" aria-hidden>
        {/* a wall of sponsor-style lozenges, like a real interview backdrop */}
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="presser__logo" />
        ))}
        <span className="presser__board-label mono">WORLD CUP 2026 · MEDIA</span>
      </div>

      <div className="presser__desk">
        <div className="presser__nameplate mono">{team} · Manager</div>
      </div>

      <div className="presser__qa">
        <div className="presser__reporter">
          <span className="presser__mic" aria-hidden />
          <span className="presser__outlet mono">{q.reporter} · {q.outlet}</span>
        </div>
        <p className="presser__question">
          {typed}
          {!ready && <span className="presser__caret" aria-hidden>|</span>}
        </p>

        {ready && !picked && (
          <motion.div className="presser__choices" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {q.choices.map((c) => (
              <button key={c.text} type="button" className="presser__choice" onClick={() => choose(c)}>
                {c.text}
              </button>
            ))}
          </motion.div>
        )}

        {picked && (
          <motion.div className="presser__reaction" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <p className="presser__said">&ldquo;{picked.text}&rdquo;</p>
            <p className="presser__react-line mono">{picked.reaction}</p>
            <div className="presser__effects mono">
              <span className={picked.morale >= 0 ? "up" : "down"}>
                Squad morale {picked.morale >= 0 ? "+" : ""}{picked.morale}
              </span>
              <span className={picked.fans >= 0 ? "up" : "down"}>
                Fans {picked.fans >= 0 ? "+" : ""}{picked.fans}
              </span>
            </div>
            <button type="button" className="btn presser__done" onClick={onDone}>
              Head to the tunnel →
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
