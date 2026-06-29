// The back page. After a result the leading headline shows in a thin bar; clicking
// it opens a full newspaper front page with the match splash and a few briefs from
// around the World Cup. Styled like newsprint so it reads as a real paper.

import { AnimatePresence, motion } from "framer-motion";
import type { Newspaper } from "../../lib/news";

export function HeadlineBar({ news, onOpen }: { news: Newspaper; onOpen: () => void }) {
  return (
    <button type="button" className={`headline-bar headline-bar--${news.lead.tone}`} onClick={onOpen}>
      <span className="headline-bar__kicker mono">{news.masthead}</span>
      <span className="headline-bar__splash">{news.lead.splash}</span>
      <span className="headline-bar__go mono">Read the back page →</span>
    </button>
  );
}

export function NewspaperModal({ news, open, onClose }: { news: Newspaper; open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="paper-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
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

            <div className="paper__lead">
              <div className="paper__kicker mono">{news.lead.kicker}</div>
              <h2 className="paper__splash">{news.lead.splash}</h2>
              <p className="paper__standfirst">{news.lead.standfirst}</p>
            </div>

            <div className="paper__briefs">
              {news.briefs.map((b, i) => (
                <div key={i} className="paper__brief">
                  <div className="paper__brief-kicker mono">{b.kicker}</div>
                  <h3>{b.splash}</h3>
                  <p>{b.standfirst}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
