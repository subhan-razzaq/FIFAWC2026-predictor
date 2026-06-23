import { motion } from "framer-motion";
import type { KoNode } from "../../lib/bracketLayout";
import { teamCode } from "../../lib/teamCode";
import { TeamBadge } from "../../components/TeamBadge";

interface Props {
  node: KoNode;
  filled: boolean;
  decided: boolean;
  groupOf: Map<string, string>;
  side: "left" | "right";
}

function Slot({
  team,
  goals,
  isWinner,
  decided,
  filled,
  groupOf,
}: {
  team: string;
  goals: number;
  isWinner: boolean;
  decided: boolean;
  filled: boolean;
  groupOf: Map<string, string>;
}) {
  return (
    <div className={`ko-slot ${decided && isWinner ? "win" : ""} ${decided && !isWinner ? "out" : ""}`}>
      {filled ? (
        // the real national flag, the same marker the group stage uses
        <TeamBadge team={team} group={groupOf.get(team)} size={18} />
      ) : (
        <span className="ko-slot__flag-empty" aria-hidden />
      )}
      <span className="ko-slot__code mono">{filled ? teamCode(team) : "-"}</span>
      <span className="ko-slot__goals mono">{decided ? goals : ""}</span>
    </div>
  );
}

export function BracketMatch({ node, filled, decided, groupOf }: Props) {
  const homeWin = node.winner === node.home;
  return (
    <motion.div
      className="ko-match"
      initial={false}
      animate={{ opacity: filled ? 1 : 0.4 }}
      transition={{ duration: 0.3 }}
    >
      <Slot team={node.home} goals={node.homeGoals} isWinner={homeWin} decided={decided} filled={filled} groupOf={groupOf} />
      <Slot team={node.away} goals={node.awayGoals} isWinner={!homeWin} decided={decided} filled={filled} groupOf={groupOf} />
      {decided && (node.afterExtraTime || node.shootout) && (
        <span className="ko-match__note mono">
          {node.shootout ? `pens ${node.shootout.home}-${node.shootout.away}` : "a.e.t."}
        </span>
      )}
    </motion.div>
  );
}
