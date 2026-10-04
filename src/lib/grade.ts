import { EV_EPSILON, type HoldEv } from '../engine/index.ts';

export interface Grade {
  optimal: boolean;
  bestMask: number;
  evBest: number;
  evHeld: number;
  evLost: number;
  /** 1-based competition rank of the held mask: tied holds share a rank. */
  rank: number;
  /** Every mask tied (within EV_EPSILON) with the best. */
  optimalMasks: number[];
}

/** 1-based competition ranks for `holds` (sorted best first): tied holds share a rank (1, 1, 3…). */
export function competitionRanks(holds: readonly HoldEv[]): number[] {
  const ranks = new Array<number>(holds.length);
  let rank = 1;
  for (let i = 0; i < holds.length; i++) {
    if (i > 0 && holds[i - 1].ev - holds[i].ev > EV_EPSILON) rank = i + 1;
    ranks[i] = rank;
  }
  return ranks;
}

/** Grades a hold against exact engine EVs. `holds` must be sorted best first (as EngineClient returns). */
export function grade(holds: readonly HoldEv[], heldMask: number): Grade {
  if (holds.length === 0) throw new Error('grade: holds is empty');
  const i = holds.findIndex((h) => h.mask === heldMask);
  if (i < 0) throw new Error(`grade: mask ${heldMask} not in holds`);
  const evBest = holds[0].ev;
  const evHeld = holds[i].ev;
  const lost = evBest - evHeld;
  return {
    optimal: lost <= EV_EPSILON,
    bestMask: holds[0].mask,
    evBest,
    evHeld,
    evLost: lost <= EV_EPSILON ? 0 : lost,
    rank: competitionRanks(holds)[i],
    optimalMasks: holds.filter((h) => evBest - h.ev <= EV_EPSILON).map((h) => h.mask),
  };
}
