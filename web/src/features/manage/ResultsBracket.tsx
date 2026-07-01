// A read-only knockout bracket for the tournament hub and the awards screen. It
// reads the rebuilt bracket state (real results) and lays the two halves out around
// a central final, with the champion locked onto the trophy at the end. Ties not yet
// played read as "to be decided".

import { motion, useReducedMotion } from "framer-motion";
import type { BracketState, BracketSlot } from "../../lib/competition";
import { R16, QF, SF, FINAL } from "@weltmeister/sim";
import { TeamBadge } from "../../components/TeamBadge";
import { teamCode } from "../../lib/teamCode";
import { Trophy } from "../bracket/Trophy";

// the final's two feeders split the draw into a left and right half
const FROM = new Map<number, [number, number]>();
for (const r of [...R16, ...QF, ...SF]) FROM.set(r.match, r.from);
FROM.set(FINAL.match, FINAL.from);

function half(sfMatch: number) {
  const qf = FROM.get(sfMatch)!;
  const r16 = qf.flatMap((m) => FROM.get(m)!);
  const r32 = r16.flatMap((m) => FROM.get(m)!);
  return { sf: sfMatch, qf, r16, r32 };
}
const LEFT = half(FINAL.from[0]);
const RIGHT = half(FINAL.from[1]);

export function ResultsBracket({ bracket, groupOf }: { bracket: BracketState; groupOf: Map<string, string> }) {
  const reduce = useReducedMotion();
  const col = (matches: number[], label: string) => (
    <div className="rbk-col">
      <div className="rbk-col__label mono">{label}</div>
      <div className="rbk-col__nodes">
        {matches.map((m) => (
          <BracketMatch key={m} slot={bracket.slots[m]} groupOf={groupOf} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="rbk-wrap">
      <div className="rbk" role="group" aria-label="Knockout bracket">
        {col(LEFT.r32, "R32")}
        {col(LEFT.r16, "R16")}
        {col(LEFT.qf, "QF")}
        {col([LEFT.sf], "SF")}

        <div className="rbk-center">
          <div className="rbk-col__label mono">Final</div>
          <BracketMatch slot={bracket.slots[FINAL.match]} groupOf={groupOf} big />
          <motion.div
            className={`rbk-trophy ${bracket.champion ? "is-set" : ""}`}
            initial={false}
            animate={reduce ? {} : bracket.champion ? { scale: [0.9, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Trophy champion={bracket.champion ?? ""} group={bracket.champion ? groupOf.get(bracket.champion) : undefined} locked={!!bracket.champion} />
            {bracket.champion ? (
              <span className="rbk-trophy__name">{bracket.champion}</span>
            ) : (
              <span className="rbk-trophy__name rbk-trophy__name--pending mono">to be decided</span>
            )}
          </motion.div>
        </div>

        {col([RIGHT.sf], "SF")}
        {col(RIGHT.qf, "QF")}
        {col(RIGHT.r16, "R16")}
        {col(RIGHT.r32, "R32")}
      </div>
    </div>
  );
}

function BracketMatch({ slot, groupOf, big }: { slot?: BracketSlot; groupOf: Map<string, string>; big?: boolean }) {
  if (!slot) return <div className="rbk-match rbk-match--tbd" />;
  return (
    <div className={`rbk-match ${big ? "rbk-match--big" : ""}`}>
      <TeamRow team={slot.home} goals={slot.homeGoals} pens={slot.pens?.[0]} winner={slot.winner} groupOf={groupOf} />
      <TeamRow team={slot.away} goals={slot.awayGoals} pens={slot.pens?.[1]} winner={slot.winner} groupOf={groupOf} />
    </div>
  );
}

function TeamRow({
  team,
  goals,
  pens,
  winner,
  groupOf,
}: {
  team?: string;
  goals?: number;
  pens?: number;
  winner?: string;
  groupOf: Map<string, string>;
}) {
  const isWin = !!team && team === winner;
  const isOut = !!winner && !!team && team !== winner;
  return (
    <div className={`rbk-slot ${isWin ? "is-win" : ""} ${isOut ? "is-out" : ""} ${team ? "" : "rbk-slot--tbd"}`}>
      {team ? (
        <>
          <TeamBadge team={team} group={groupOf.get(team)} size={16} />
          <span className="rbk-slot__code">{teamCode(team)}</span>
          {goals !== undefined && (
            <span className="rbk-slot__score mono">
              {goals}
              {pens !== undefined && <span className="rbk-slot__pens">({pens})</span>}
            </span>
          )}
        </>
      ) : (
        <span className="rbk-slot__tbd mono">TBD</span>
      )}
    </div>
  );
}
