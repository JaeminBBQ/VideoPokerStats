/**
 * Exact odds of a video poker session under a leave rule: stop when up `winBets`, when down `lossBets`, when
 * the bankroll can't cover a bet, or after `maxHands` hands, whichever comes first. Nothing sampled.
 *
 * DP over the bankroll in whole bets (pays are whole coins per coin, so whole bets). Mass that reaches
 * the win line or the loss line is absorbed. With no win goal, a bankroll more than the remaining
 * hands above the start can never finish at or below the start (each hand loses at most one bet), so those
 * states are lumped into one "ahead for sure" bucket that keeps playing to the time limit. That keeps the
 * state space at about start + maxHands.
 *
 * Expected result uses Wald's identity (the stopping time is bounded): E[net] = E[hands] × (return − 1).
 * Leave rules change how a session ends, never the average loss per hand. That is the point the
 * simulator's "when to leave" advice makes with these numbers (D23).
 */

export interface LeaveRule {
  /** Leave once up at least this many bets (Infinity = no win goal). */
  winBets: number;
  /** Leave once down at least this many bets (Infinity = play until you can't cover a bet). */
  lossBets: number;
  maxHands: number;
}

export interface LeaveOdds {
  /** How the session ends; these sum to 1. */
  pWin: number;
  pLossLimit: number;
  pBroke: number;
  pTime: number;
  /** P(leave with more than you started with). */
  pAhead: number;
  /** Expected hands played and expected net result, in bets. */
  expHands: number;
  expNetBets: number;
}

/** Above this many state-updates the exact DP is skipped (keeps the page responsive). */
export const MAX_LEAVE_WORK = 4e8;

/**
 * `pays`/`probs`: per-hand pays (whole bets returned for the one bet) and probabilities. `startBets` is the
 * budget in whole bets. Returns null when the computation would be too large (see MAX_LEAVE_WORK).
 */
export function leaveOdds(pays: readonly number[], probs: readonly number[], startBets: number, rule: LeaveRule): LeaveOdds | null {
  const steps = new Map<number, number>();
  pays.forEach((v, i) => {
    if (!Number.isInteger(v) || v < 0) throw new Error(`pay ${v} is not a whole number of bets`);
    if (probs[i] > 0) steps.set(v - 1, (steps.get(v - 1) ?? 0) + probs[i]);
  });
  const ret = pays.reduce((a, v, i) => a + v * probs[i], 0);
  const start = Math.floor(startBets);
  const N = rule.maxHands;
  const empty = { pWin: 0, pLossLimit: 0, pBroke: 0, pTime: 0, pAhead: 0, expHands: 0, expNetBets: 0 };
  if (start < 1) return { ...empty, pBroke: 1 };
  if (N <= 0) return { ...empty, pTime: 1 };

  // Playable bankrolls: lo..hi-1. Below lo: loss limit (or broke). At or above hi: win (or the lump).
  const lossLine = Number.isFinite(rule.lossBets) ? start - Math.ceil(rule.lossBets) : 0; // absorbed at ≤ lossLine
  const lo = Math.max(1, lossLine + 1);
  const lossIsBroke = lo === 1 && lossLine <= 0;
  const hasGoal = Number.isFinite(rule.winBets);
  const hi = hasGoal ? start + Math.max(1, Math.ceil(rule.winBets)) : start + N + 1;
  const width = hi - lo;
  if (width * N * steps.size > MAX_LEAVE_WORK) return null;

  let cur = new Float64Array(width);
  let next = new Float64Array(width);
  cur[start - lo] = 1;
  let pWin = 0;
  let pLow = 0;
  let pLump = 0; // no-goal only: mass certain to finish ahead
  let expHands = 0;
  const entries = [...steps.entries()];
  const suffix = new Float64Array(width + 1); // suffix[i] = Σ cur[i..width-1]
  for (let n = 0; n < N; n++) {
    next.fill(0);
    suffix[width] = 0;
    for (let i = width - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + cur[i];
    const playing = suffix[0];
    if (playing === 0) break;
    expHands += playing;
    for (const [d, q] of entries) {
      // i + d < 0: falls below the playable range (only d = −1, i = 0).
      if (d < 0) pLow += (suffix[0] - suffix[Math.min(width, -d)]) * q;
      // i + d ≥ width: reaches the goal (or the no-goal lump).
      const up = Math.max(0, width - d);
      if (up < width) {
        const m = suffix[up] * q;
        if (hasGoal) pWin += m;
        else {
          pLump += m;
          expHands += m * (N - n - 1); // it plays out the rest of the session
        }
      }
      // Everything else moves within the range.
      const from = Math.max(0, -d);
      const to = Math.min(width, width - d);
      for (let i = from; i < to; i++) next[i + d] += cur[i] * q;
    }
    [cur, next] = [next, cur];
  }
  let pTime = pLump;
  let aheadAtTime = pLump;
  for (let i = 0; i < width; i++) {
    pTime += cur[i];
    if (i + lo > start) aheadAtTime += cur[i];
  }
  return {
    pWin,
    pLossLimit: lossIsBroke ? 0 : pLow,
    pBroke: lossIsBroke ? pLow : 0,
    pTime,
    pAhead: pWin + aheadAtTime,
    expHands,
    expNetBets: expHands * (ret - 1),
  };
}

/** One bankroll tier of a table game: playable while the bankroll covers `coverUnits`; per-round net steps. */
export interface StepTier {
  coverUnits: number;
  /** Net result of one round in units, and its probability (sums to 1). */
  steps: readonly (readonly [number, number])[];
}

export interface TieredRule {
  /** Leave once up at least this many units (Infinity = no win goal). */
  winUnits: number;
  /** Leave once down at least this many units (Infinity = play until no tier is covered). */
  lossUnits: number;
  maxRounds: number;
}

/**
 * `leaveOdds` for table games (D29): blackjack and craps rounds can win fractions of a bet (3:2, 6:5, odds
 * pays) and lose more than one bet (doubles, splits, odds), and what you can bet depends on what you have.
 * The bankroll is tracked in whole `units` (a fraction of the base bet that makes every net whole: 1/2 for
 * 3:2, 1/5 for 6:5 and craps odds), and each round is played at the best tier the bankroll covers (`tiers`
 * best first, descending cover). Below the last tier's cover the player is out of money. Exact DP over the
 * bankroll; nothing sampled. Expected net is summed per round (tiers differ, so Wald's shortcut doesn't
 * apply). With no win goal and a budget that covers the top tier, mass so far above the start that it can't
 * fall back to it in the rounds left is lumped (it plays out at the top tier). Returns null past
 * MAX_LEAVE_WORK. Results are in units; `expNetBets` divides by `unitsPerBet`.
 */
export function leaveOddsTiered(tiers: readonly StepTier[], startUnits: number, unitsPerBet: number, rule: TieredRule): LeaveOdds | null {
  const start = Math.floor(startUnits);
  const N = rule.maxRounds;
  const minCover = tiers[tiers.length - 1].coverUnits;
  const empty = { pWin: 0, pLossLimit: 0, pBroke: 0, pTime: 0, pAhead: 0, expHands: 0, expNetBets: 0 };
  if (start < minCover) return { ...empty, pBroke: 1 };
  if (N <= 0) return { ...empty, pTime: 1 };

  const evOf = (t: StepTier) => t.steps.reduce((a, [d, q]) => a + d * q, 0);
  const evs = tiers.map(evOf);
  const top = tiers[0];
  const topLoss = -Math.min(...top.steps.map(([d]) => d));
  const maxWin = Math.max(...tiers.flatMap((t) => t.steps.map(([d]) => d)));
  // A loss line that leaves less than the smallest bet is the same as playing until broke.
  const lossLine = Number.isFinite(rule.lossUnits) ? start - Math.ceil(rule.lossUnits) : -Infinity;
  const lossIsBroke = lossLine < minCover;
  const hasGoal = Number.isFinite(rule.winUnits);
  const hi = hasGoal ? start + Math.max(1, Math.ceil(rule.winUnits)) : start + maxWin * N + 1;
  const canLump = !hasGoal && start >= top.coverUnits;
  // Tier index per bankroll (-1 = can't play: out of money, or at/below the loss line).
  const tierAt = new Int8Array(hi).fill(-1);
  for (let b = 0; b < hi; b++) {
    if (!lossIsBroke && b <= lossLine) continue;
    const t = tiers.findIndex((x) => b >= x.coverUnits);
    tierAt[b] = t;
  }

  // Flat per-tier step arrays: the inner loop runs ~10^8 times for long cheap sessions.
  const ds = tiers.map((t) => Int32Array.from(t.steps, ([d]) => d));
  const qs = tiers.map((t) => Float64Array.from(t.steps, ([, q]) => q));
  let cur = new Float64Array(hi);
  let next = new Float64Array(hi);
  cur[start] = 1;
  let lo = start;
  let up = start; // nonzero support of `cur`: lo..up
  let pWin = 0;
  let pLow = 0;
  let pLump = 0;
  let expHands = 0;
  let expNet = 0;
  let work = 0;
  for (let n = 0; n < N; n++) {
    const left = N - n - 1; // rounds after this one
    let nlo = hi;
    let nup = -1;
    for (let b = lo; b <= up; b++) {
      const m = cur[b];
      if (m === 0) continue;
      const t = tierAt[b];
      expHands += m;
      expNet += m * evs[t];
      const td = ds[t];
      const tq = qs[t];
      work += td.length;
      for (let j = 0; j < td.length; j++) {
        const nb = b + td[j];
        const mq = m * tq[j];
        if (nb >= hi) {
          pWin += mq; // only reachable with a goal (no-goal `hi` is past the largest reachable bankroll)
        } else if (tierAt[nb] < 0) {
          pLow += mq;
        } else if (canLump && nb - topLoss * left > start) {
          pLump += mq;
          expHands += mq * left;
          expNet += mq * left * evs[0];
        } else {
          next[nb] += mq;
          if (nb < nlo) nlo = nb;
          if (nb > nup) nup = nb;
        }
      }
      cur[b] = 0;
    }
    if (work > MAX_LEAVE_WORK) return null;
    [cur, next] = [next, cur];
    if (nup < 0) {
      lo = 1;
      up = 0;
      break;
    }
    lo = nlo;
    up = nup;
  }
  let pTime = pLump;
  let aheadAtTime = pLump;
  for (let b = lo; b <= up; b++) {
    pTime += cur[b];
    if (b > start) aheadAtTime += cur[b];
  }
  return {
    pWin,
    pLossLimit: lossIsBroke ? 0 : pLow,
    pBroke: lossIsBroke ? pLow : 0,
    pTime,
    pAhead: pWin + aheadAtTime,
    expHands,
    expNetBets: expNet / unitsPerBet,
  };
}
