/**
 * "Reach a goal before going broke": start with a bankroll, bet one unit (one max-bet hand / one table bet)
 * every round, and stop when the bankroll reaches the goal or can no longer cover a bet. No time limit.
 * Exact absorption probabilities of that Markov chain (nothing sampled), by two solvers:
 *
 *   ladder — for games whose only losing outcome is −1 bet (video poker, roulette, craps). From any
 *            level the walk can only step down one level at a time, so with D_m = P(drop one level before
 *            reaching the goal, from m levels below it):
 *              D_m = P(−1) / (1 − P(0) − Σ_{j<m} P(+j) · D_{m−j} · … · D_{m−1})
 *              f(s) = (1 − D_{T−s}) + D_{T−s} · f(s−1),   f(0) = 0.
 *            Every term is a positive sum, so it is numerically stable and O(levels × distinct pays). This
 *            handles the 800-bet royal, which a banded solve would need a band 800 wide for.
 *   banded — for anything else (blackjack loses 2+ bets on doubles and splits): Gaussian elimination on the
 *            banded system (I − Q) f = r, in units of 1/scale bet so half-bet outcomes are integers. The
 *            matrix is diagonally dominant, so no pivoting is needed.
 */

import { OWNER_RULES, blackjackOdds } from './blackjack.ts';

const OWNER_BLACKJACK = blackjackOdds(OWNER_RULES);

/** One round's result: net win in bets (−1 = lost the bet, 1.5 = blackjack at 3:2) and its probability. */
export interface Outcome {
  net: number;
  p: number;
}

/** Smallest integer scale that makes every net an integer (1, 2, … up to 100). */
function scaleFor(outcomes: readonly Outcome[]): number {
  for (let s = 1; s <= 100; s++) if (outcomes.every((o) => Math.abs(o.net * s - Math.round(o.net * s)) < 1e-9)) return s;
  throw new Error('outcomes need a scale above 100');
}

/** Integer steps (in 1/scale bet units) with merged probabilities, normalized to sum to 1. */
function integerSteps(outcomes: readonly Outcome[], scale: number): Map<number, number> {
  const total = outcomes.reduce((a, o) => a + o.p, 0);
  if (Math.abs(total - 1) > 1e-6) throw new Error(`outcome probabilities sum to ${total}`);
  const steps = new Map<number, number>();
  for (const o of outcomes) {
    if (o.p <= 0) continue;
    const d = Math.round(o.net * scale);
    steps.set(d, (steps.get(d) ?? 0) + o.p / total);
  }
  return steps;
}

/**
 * P(bankroll reaches start + goal before it drops below one bet), both in bets. `startBets` is floored to
 * whole units (spare change below a unit can't be bet), `goalBets` is rounded up (the goal is "at least").
 */
export function goalProbability(outcomes: readonly Outcome[], startBets: number, goalBets: number): number {
  const scale = scaleFor(outcomes);
  const steps = integerSteps(outcomes, scale);
  const start = Math.floor(startBets * scale + 1e-9);
  const target = start + Math.ceil(goalBets * scale - 1e-9);
  if (start < scale) return 0; // can't cover a single bet
  if (target <= start) return 1;
  const minStep = Math.min(...steps.keys());
  return scale === 1 && minStep === -1 ? ladder(steps, start, target) : banded(steps, scale, start, target);
}

/** A betting tier: play `outcomes` while the bankroll covers `coverBets` (in units of the base bet). */
export interface Tier {
  coverBets: number;
  outcomes: Outcome[];
}

/**
 * `goalProbability` when what you bet depends on what you can cover (e.g. craps: line + 2× odds while the
 * bankroll covers 3 units, line only below that). Ruin is below the smallest tier's cover.
 */
export function goalProbabilityTiered(tiers: readonly Tier[], startBets: number, goalBets: number): number {
  const scale = scaleFor(tiers.flatMap((t) => t.outcomes));
  const start = Math.floor(startBets * scale + 1e-9);
  const target = start + Math.ceil(goalBets * scale - 1e-9);
  const lo = Math.min(...tiers.map((t) => Math.round(t.coverBets * scale)));
  if (start < lo) return 0;
  if (target <= start) return 1;
  return bandedTiered(
    tiers.map((t) => ({ min: Math.round(t.coverBets * scale), steps: integerSteps(t.outcomes, scale) })),
    start,
    target,
  );
}

/** Bankroll in whole bets; ruin at 0, goal at ≥ target. Requires every loss to be exactly −1. */
export function ladder(steps: ReadonlyMap<number, number>, start: number, target: number): number {
  const down = steps.get(-1) ?? 0;
  const stay = steps.get(0) ?? 0;
  const ups = [...steps.entries()].filter(([d]) => d >= 1);
  if (down <= 0) return 1;
  // D[m] for m = 1..target-1; logC[x] = Σ_{y=1..x} ln D[y] (logC[0] = 0) so products of runs of D are exact ratios.
  const D = new Float64Array(target);
  const logC = new Float64Array(target);
  for (let m = 1; m < target; m++) {
    let back = 0; // Σ P(+j) · Π_{x=m−j}^{m−1} D[x], over ups that land below the goal
    for (const [j, q] of ups) if (j < m) back += q * Math.exp(logC[m - 1] - logC[m - j - 1]);
    D[m] = down / (1 - stay - back);
    logC[m] = logC[m - 1] + Math.log(D[m]);
  }
  let f = 0;
  for (let s = 1; s <= start; s++) {
    const d = D[target - s];
    f = 1 - d + d * f;
  }
  return f;
}

/** Bankroll in 1/scale-bet units; ruin below `scale` units (can't cover a bet), goal at ≥ target. */
export function banded(steps: ReadonlyMap<number, number>, scale: number, start: number, target: number): number {
  return bandedTiered([{ min: scale, steps }], start, target);
}

/**
 * `banded` with a betting policy that depends on the bankroll: each state plays the tier with the highest
 * `min` (in units) it can cover. Ruin is below the lowest tier's `min`.
 */
function bandedTiered(tiers: readonly { min: number; steps: ReadonlyMap<number, number> }[], start: number, target: number): number {
  const sorted = [...tiers].sort((x, y) => y.min - x.min);
  const lo = sorted[sorted.length - 1].min; // lowest playable bankroll
  const stepsAt = (s: number) => sorted.find((t) => s >= t.min)!.steps;
  const n = target - lo; // transient states lo..target-1
  const keys = sorted.flatMap((t) => [...t.steps.keys()]);
  const L = Math.max(0, -Math.min(...keys));
  const U = Math.max(0, Math.max(...keys));
  const W = L + U + 1;
  const A = new Float64Array(n * W); // A[i][j] at i*W + (j - i + L)
  const b = new Float64Array(n);
  const at = (i: number, j: number) => i * W + (j - i + L);
  for (let i = 0; i < n; i++) {
    A[at(i, i)] += 1;
    for (const [d, q] of stepsAt(i + lo)) {
      const s = i + lo + d;
      if (s >= target) b[i] += q;
      else if (s >= lo) A[at(i, s - lo)] -= q;
    }
  }
  for (let k = 0; k < n; k++) {
    const pivot = A[at(k, k)];
    const jEnd = Math.min(k + U, n - 1);
    for (let i = k + 1; i <= Math.min(k + L, n - 1); i++) {
      const factor = A[at(i, k)] / pivot;
      if (factor === 0) continue;
      for (let j = k; j <= jEnd; j++) A[at(i, j)] -= factor * A[at(k, j)];
      b[i] -= factor * b[k];
    }
  }
  const f = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let acc = b[i];
    for (let j = i + 1; j <= Math.min(i + U, n - 1); j++) acc -= A[at(i, j)] * f[j];
    f[i] = acc / A[at(i, i)];
  }
  return f[start - lo];
}

/** Expected net win per round, in bets (negative = house edge). */
export const edgeOf = (outcomes: readonly Outcome[]): number => outcomes.reduce((a, o) => a + o.net * o.p, 0);

export interface TableGame {
  id: string;
  name: string;
  /** Short column header for phone width. */
  short: string;
  rules: string;
  source: string;
  /** Table minimum per round, in cents (owner's word for Reno, D20). */
  minBetCents: number;
  /** Net result per decision, in units of the base (line) bet, at the full policy. */
  outcomes: Outcome[];
  /** Bankroll-dependent policy (best tier first is not required); when absent, `outcomes` at cover 1. */
  tiers?: Tier[];
  /** Average total wagered per decision, in base bets (1 when there is nothing beyond the base bet). The
   * house edge per dollar wagered is −edge / avgWagerBets. */
  avgWagerBets?: number;
}

const PASS_LINE: Outcome[] = [
  { net: 1, p: 244 / 495 },
  { net: -1, p: 251 / 495 },
];

/**
 * Pass line with 2× odds behind every point, per decision, in line-bet units. Come-out: win 8/36, lose 4/36.
 * Point 4/10 (6/36): makes it 1/3, odds pay 2:1 → +1 +4; 5/9 (8/36): 2/5, 3:2 → +1 +3; 6/8 (10/36): 5/11,
 * 6:5 → +1 +2.4. Missing a point loses line + odds (−3).
 */
const PASS_2X_ODDS: Outcome[] = [
  { net: 1, p: 8 / 36 },
  { net: -1, p: 4 / 36 },
  { net: 5, p: (6 / 36) * (1 / 3) },
  { net: 4, p: (8 / 36) * (2 / 5) },
  { net: 3.4, p: (10 / 36) * (5 / 11) },
  { net: -3, p: (6 / 36) * (2 / 3) + (8 / 36) * (3 / 5) + (10 / 36) * (6 / 11) },
];

/**
 * Comparison games, flat-betting one unit per round (the table minimum, or the video poker bet if larger).
 * Roulette and craps are exact from their rules. Blackjack is computed exactly (infinite deck, basic
 * strategy) for the rules the owner reported at their $15 tables (D22).
 */
export const TABLE_GAMES: TableGame[] = [
  {
    id: 'blackjack',
    name: 'Blackjack',
    short: 'Blackjack',
    rules: `3:2, dealer stands on all 17s, double any two cards, double after split, split to 4 hands (aces once), no surrender; basic strategy (${(-OWNER_BLACKJACK.ev * 100).toFixed(2)}% edge, infinite deck)`,
    source: 'computed exactly by src/engine/blackjack.ts for the owner\'s table rules (D22)',
    minBetCents: 1500,
    outcomes: OWNER_BLACKJACK.outcomes,
  },
  {
    id: 'craps',
    name: 'Craps — pass line',
    short: 'Craps',
    rules: 'Pass line, no odds bet: wins 244/495 (1.41% edge)',
    source: 'exact from the dice: P(win) = 8/36 + Σ over points of P(point)·P(point before 7) = 244/495',
    minBetCents: 300,
    outcomes: PASS_LINE,
  },
  {
    id: 'roulette',
    name: 'Roulette — red/black',
    short: 'Roulette',
    rules: 'Double-zero wheel, even-money bet: wins 18/38 (5.26% edge)',
    source: 'exact: 18 winning pockets of 38',
    minBetCents: 1500,
    outcomes: [
      { net: 1, p: 18 / 38 },
      { net: -1, p: 20 / 38 },
    ],
  },
  {
    id: 'craps-odds',
    name: 'Craps — pass + 2× odds',
    short: 'Craps 2×',
    rules: 'Pass line plus 2× odds behind every point (odds pay true odds: 2:1, 3:2, 6:5), dropping to the bare line when the bankroll can\'t cover line + odds (0.61% of all money bet; the odds bet has no edge)',
    source: 'exact from the dice, same derivation as the pass line; the odds bet pays true odds',
    minBetCents: 300,
    outcomes: PASS_2X_ODDS,
    tiers: [
      { coverBets: 3, outcomes: PASS_2X_ODDS },
      { coverBets: 1, outcomes: PASS_LINE },
    ],
    avgWagerBets: 1 + 2 * (24 / 36),
  },
];
