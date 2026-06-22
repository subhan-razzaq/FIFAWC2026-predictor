// A short burst of confetti for celebratory moments (winning a match, lifting the
// trophy). Pure motion, respects reduced-motion preferences.

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["var(--gold)", "var(--gold-bright)", "var(--mex-green)", "var(--usa-blue)", "var(--can-red)"];

export function Confetti({ count = 22 }: { count?: number }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        x: (Math.random() * 2 - 1) * 240,
        y: -(70 + Math.random() * 220),
        rot: Math.random() * 540 - 270,
        color: COLORS[i % COLORS.length]!,
        delay: Math.random() * 0.12,
        dur: 1.1 + Math.random() * 0.5,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 8,
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="confetti__pc"
          style={{ background: p.color, width: p.w, height: p.h }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 80], opacity: [1, 1, 0], rotate: p.rot }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
