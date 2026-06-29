// The manager's inbox. A list of messages down the left, the open message on the
// right. A dossier from the assistant carries a deeper analysis that opens in its
// own layered pane, so the user drills from headline to detail to the full scouting
// read without leaving the inbox.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Model } from "@weltmeister/sim";
import { useStore } from "../../store/store";
import type { InboxMessage } from "../../lib/inbox";
import { ScoutCard } from "./ScoutCard";
import { ManagerBadge } from "./ManagerBadge";

const KIND_LABEL: Record<string, string> = {
  scout: "Dossier",
  medical: "Medical",
  discipline: "Discipline",
  board: "Board",
  press: "Media",
  result: "Report",
};

export function ManagerInbox({ model, group }: { model: Model; group?: string }) {
  const career = useStore((s) => s.career);
  const readMessage = useStore((s) => s.readMessage);
  const messages = career?.inbox ?? [];
  const [openId, setOpenId] = useState<string | null>(messages[0]?.id ?? null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  if (!career || messages.length === 0) return null;
  const open = messages.find((m) => m.id === openId) ?? messages[0]!;
  const unread = messages.filter((m) => !m.read).length;

  const select = (m: InboxMessage) => {
    setOpenId(m.id);
    setAnalysisOpen(false);
    if (!m.read) readMessage(m.id);
  };

  return (
    <div className="inbox">
      <div className="inbox__head">
        <span className="eyebrow">Inbox</span>
        {unread > 0 && (
          <motion.span key={unread} className="inbox__unread mono" initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 360, damping: 16 }}>
            {unread} new
          </motion.span>
        )}
      </div>
      <div className="inbox__grid">
        <ul className="inbox__list">
          {messages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`inbox__item ${m.id === open.id ? "is-open" : ""} ${m.read ? "" : "is-unread"}`}
                onClick={() => select(m)}
              >
                {!m.read && <span className="inbox__new-dot" aria-label="new" />}
                <span className={`inbox__tag inbox__tag--${m.kind}`}>{KIND_LABEL[m.kind] ?? m.kind}</span>
                <span className="inbox__item-body">
                  <span className="inbox__from">
                    {m.from}
                    {!m.read && <span className="inbox__new-badge mono">NEW</span>}
                  </span>
                  <span className="inbox__subject">{m.subject}</span>
                  <span className="inbox__preview">{m.preview}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="inbox__read">
          <div className="inbox__msg-head">
            <span className={`inbox__tag inbox__tag--${open.kind}`}>{KIND_LABEL[open.kind] ?? open.kind}</span>
            <div>
              <div className="inbox__msg-subject anton">{open.subject}</div>
              <div className="inbox__msg-from mono">from {open.from}</div>
            </div>
          </div>
          {open.oppManager && (
            <div className="inbox__manager">
              <ManagerBadge manager={open.oppManager} />
            </div>
          )}
          <div className="inbox__msg-body">
            {open.body.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          {open.analysis && (
            <button type="button" className="btn inbox__analysis-btn" onClick={() => setAnalysisOpen(true)}>
              Open full analysis →
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {analysisOpen && open.analysis && (
          <motion.div
            className="inbox__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAnalysisOpen(false)}
          >
            <motion.div
              className="inbox__pane"
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inbox__pane-head">
                <div>
                  <span className="eyebrow">Assistant's full analysis</span>
                  <h3 className="anton">{open.analysis.team}</h3>
                </div>
                <button type="button" className="inbox__close" onClick={() => setAnalysisOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>
              {open.oppManager && <ManagerBadge manager={open.oppManager} />}
              <ScoutCard model={model} opponent={open.analysis.team} group={group} embedded />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
