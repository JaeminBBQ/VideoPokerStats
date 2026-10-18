/**
 * Annotates the engine's hold list for display: loss versus the best hold, tie flags, and chart pattern
 * names. Every number comes from the engine's exact enumeration (`analyzeHand`); nothing is recomputed here.
 * Ties are ties: any hold within EV_EPSILON of the best is correct.
 */
import { EV_EPSILON, type HoldEv } from '../../../src/engine/ev.ts';
import { hasChart, patternFor } from '../../../src/engine/drill.ts';
import type { GameDef } from '../../../src/engine/games.ts';
import type { Card } from './cards.ts';

export interface RankedHold {
  /** 1-based position in the ranking (#1 = best). */
  rank: number;
  /** Bit i set = hold the card at dealt position i. */
  mask: number;
  /** Held cards in dealt order. */
  held: Card[];
  /** Expected return per unit bet (max bet). */
  ev: number;
  /** best.ev - ev (>= 0). */
  loss: number;
  /** True when this hold is within EV_EPSILON of the best (so it is also correct). */
  tie: boolean;
  /** Chart line label (patternFor) when the game has a chart, else null. */
  pattern: string | null;
}

const popcount = (m: number): number => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};

/**
 * Ranks holds best first (EV descending, larger hold first among equal EVs, matching `analyzeHand`).
 * The input is usually `analyzeHand` output and already in this order; sorting again is defensive.
 */
export function rankHolds(holds: readonly HoldEv[], game: GameDef): RankedHold[] {
  if (holds.length === 0) return [];
  const sorted = holds.slice().sort((a, b) => b.ev - a.ev || popcount(b.mask) - popcount(a.mask));
  const best = sorted[0].ev;
  const chart = hasChart(game);
  return sorted.map((h, i) => {
    const loss = Math.max(0, best - h.ev);
    return {
      rank: i + 1,
      mask: h.mask,
      held: h.held.slice(),
      ev: h.ev,
      loss,
      tie: loss <= EV_EPSILON,
      pattern: chart ? (patternFor(game, h.held)?.label ?? null) : null,
    };
  });
}

/** Every correct hold: the best plus any hold tied with it. */
export const tiedBest = (ranked: readonly RankedHold[]): RankedHold[] => ranked.filter((h) => h.tie);
