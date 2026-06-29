// The back page. After a result the leading headline shows in a thin bar; clicking
// it opens a full newspaper front page. Several pages can be cycled through with the
// arrows, each sliding in, all grounded in the real result.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Newspaper } from "../../lib/news";

const PAGE_VARIANTS = {
  enter: (d: number) => ({ opacity: 0, x: d * 40 }),
  center: { opacity: 1, x: 0 },
  leave: (d: number) => ({ opacity: 0, x: d * -40 }),
};

export function HeadlineBar({ news, onOpen }: { news: Newspaper; onOpen: () => void }) {
  const lead = news.pages[0]!;
  return (
    <button type="button" className={`headline-bar headline-bar--${lead.tone}`} onClick={onOpen}>
      <span className="headline-bar__kicker mono">{news.masthead}</span>
      <span className="headline-bar__splash">{lead.splash}</span>
      <span className="headline-bar__go mono">Read the back page →</span>
    </button>
  );
}

export function NewspaperModal({ news, open, onClose }: { news: Newspaper; open: boolean; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const count = news.pages.length;
  const idx = ((page % count) + count) % count;
  const current = news.pages[idx]!;

  const go = (d: number) => {
    setDir(d);
    setPage((p) => p + d);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="paper-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="paper"
            initial={{ opacity: 0, scale: 0.95, rotate: -1 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="paper__close" onClick={onClose} aria-label="Close">
              ✕
            </button>
            <div className="paper__masthead">{news.masthead}</div>
            <div className="paper__rule" />
            <div className="paper__date mono">{news.date}</div>

            <div className="paper__stage">
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div
                  key={idx}
                  custom={dir}
                  variants={PAGE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="leave"
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="paper__kicker mono">{current.kicker}</div>
                  <h2 className="paper__splash">{current.splash}</h2>
                  <p className="paper__standfirst">{current.standfirst}</p>
                  <div className="paper__body">
                    {current.body.map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {count > 1 && (
              <div className="paper__nav">
                <button type="button" className="paper__arrow" onClick={() => go(-1)} aria-label="Previous story">
                  ‹
                </button>
                <div className="paper__dots" aria-hidden>
                  {news.pages.map((_, i) => (
                    <span key={i} className={`paper__dot ${i === idx ? "is-on" : ""}`} />
                  ))}
                </div>
                <button type="button" className="paper__arrow" onClick={() => go(1)} aria-label="Next story">
                  ›
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
