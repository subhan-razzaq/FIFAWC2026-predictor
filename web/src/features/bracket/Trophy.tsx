import { motion } from "framer-motion";
import { TeamBadge } from "../../components/TeamBadge";

interface Props {
  champion: string | null;
  group?: string;
  locked: boolean;
}

// Original geometric trophy built from squares and quarter circles (the "26"
// language), not any FIFA mark. It locks onto the champion at the end of the run.
export function Trophy({ champion, group, locked }: Props) {
  return (
    <div className="trophy">
      <motion.div
        className="trophy__art"
        initial={false}
        animate={locked ? { scale: 1, rotate: 0, opacity: 1 } : { scale: 0.9, opacity: 0.55 }}
        transition={{ type: "spring", stiffness: 180, damping: 28 }}
      >
        <svg width="92" height="108" viewBox="0 0 92 108" aria-hidden>
          {/* cup bowl: a square with two quarter-circle cut corners */}
          <path d="M18 8 H74 V40 A28 28 0 0 1 18 40 Z" fill="var(--gold)" />
          <path d="M18 8 H74 V20 H18 Z" fill="var(--gold-bright)" />
          {/* handles */}
          <path d="M18 14 A14 14 0 0 0 6 30 L14 30 A8 8 0 0 1 18 22 Z" fill="var(--gold)" />
          <path d="M74 14 A14 14 0 0 1 86 30 L78 30 A8 8 0 0 0 74 22 Z" fill="var(--gold)" />
          {/* stem and base */}
          <rect x="42" y="62" width="8" height="18" fill="var(--gold)" />
          <rect x="28" y="80" width="36" height="8" fill="var(--gold)" />
          <rect x="22" y="92" width="48" height="10" fill="var(--gold-bright)" />
        </svg>
        {locked && (
          <motion.span
            className="trophy__glow"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1.4 }}
            transition={{ duration: 0.8 }}
          />
        )}
      </motion.div>
      <div className="trophy__label">
        <div className="eyebrow">{locked ? "Champion" : "World champion"}</div>
        {champion && locked ? (
          <motion.div
            className="trophy__champ"
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <TeamBadge team={champion} group={group} size={34} />
            <span className="anton">{champion}</span>
          </motion.div>
        ) : (
          <div className="trophy__champ trophy__champ--pending mono">to be decided</div>
        )}
      </div>
    </div>
  );
}
