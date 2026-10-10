/**
 * Exact hand odds for the Odds tab, all by full enumeration (nothing sampled):
 *
 *   dealt   — P(the 5 dealt cards land in each category): every C(n,5) starting hand evaluated.
 *   draw    — P(the final hand lands in each category) after holding `mask` of a given hand: every
 *             C(n-5, 5-held) draw from the rest of the deck evaluated (the discards are out of the deck).
 *   perfect — P(final hand) under perfect play comes from `outcomeDistribution` (outcomes.ts).
 *
 * Paytable rows are grouped into categories so bonus games read like their base game: the bonus
 * four-of-a-kind rows (four-aces, four-2-4, four-5-k) are one "Four of a Kind", the five-of-a-kind rows one
 * "Five of a Kind", the four-deuces rows one "Four Deuces", and natural-royal is "royal".
 */
import { BINOM } from './ev.ts';
import { parseHand, type Card } from './cards.ts';
import type { GameDef } from './games.ts';

export interface OddsCategory {
  key: string;
  label: string;
  /** Outcome indices: row indices into `game.rows`, or `game.rows.length` for no pay. */
  outcomes: number[];
}

function categoryOf(rowKey: string, rowLabel: string): { key: string; label: string } {
  if (rowKey === 'royal' || rowKey === 'natural-royal') return { key: 'royal', label: rowLabel };
  if (rowKey.startsWith('four-deuces')) return { key: 'four-deuces', label: 'Four Deuces' };
  if (rowKey.startsWith('five-')) return { key: 'five-kind', label: 'Five of a Kind' };
  if (rowKey.startsWith('four-')) return { key: 'four-kind', label: 'Four of a Kind' };
  return { key: rowKey, label: rowLabel };
}

/** The game's categories, best first, ending with "nothing" (no pay). */
export function oddsCategories(game: GameDef): OddsCategory[] {
  const cats: OddsCategory[] = [];
  game.rows.forEach((row, i) => {
    const { key, label } = categoryOf(row.key, row.label);
    const existing = cats.find((c) => c.key === key);
    if (existing) existing.outcomes.push(i);
    else cats.push({ key, label, outcomes: [i] });
  });
  cats.push({ key: 'nothing', label: 'No win', outcomes: [game.rows.length] });
  return cats;
}

/** Sums per-outcome values (rows + no pay) into per-category values, in `oddsCategories` order. */
export function byCategory(cats: OddsCategory[], perOutcome: readonly number[]): number[] {
  return cats.map((c) => c.outcomes.reduce((acc, o) => acc + perOutcome[o], 0));
}

const outcomeIndex = (game: GameDef, hand: readonly Card[]): number => {
  const row = game.evaluate(hand);
  return row < 0 ? game.rows.length : row;
};

/** Exact count of starting hands per outcome (rows + no pay); divide by C(n,5) for probabilities. */
export function dealtCounts(game: GameDef): number[] {
  const n = game.deckSize;
  const counts = new Array<number>(game.rows.length + 1).fill(0);
  const h = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < n; h[0]++)
    for (h[1] = h[0] + 1; h[1] < n; h[1]++)
      for (h[2] = h[1] + 1; h[2] < n; h[2]++)
        for (h[3] = h[2] + 1; h[3] < n; h[3]++)
          for (h[4] = h[3] + 1; h[4] < n; h[4]++) counts[outcomeIndex(game, h)]++;
  return counts;
}

/** Exact P(final hand in each outcome) after holding `mask` (bit i = position i) of `hand`. */
export function drawOdds(game: GameDef, hand: readonly Card[], mask: number): number[] {
  const held = hand.filter((_, i) => mask & (1 << i));
  const rest: Card[] = [];
  for (let c = 0; c < game.deckSize; c++) if (!hand.includes(c)) rest.push(c);
  const need = 5 - held.length;
  const counts = new Array<number>(game.rows.length + 1).fill(0);
  const final = [...held];
  const pick = (from: number, left: number) => {
    if (left === 0) {
      counts[outcomeIndex(game, final)]++;
      return;
    }
    for (let i = from; i <= rest.length - left; i++) {
      final.push(rest[i]);
      pick(i + 1, left - 1);
      final.pop();
    }
  };
  pick(0, need);
  const draws = BINOM[rest.length][need];
  return counts.map((c) => c / draws);
}

export interface DrawExample {
  /** e.g. "4 to a Royal". */
  label: string;
  /** Example dealt hand (cards whose discards don't touch the target, so the odds are the clean case). */
  hand: string;
  /** Number of leading cards of `hand` held. */
  hold: number;
  /** Category keys this example is listed under. */
  targets: string[];
}

/**
 * Canonical holds for "odds by how much of the hand you already have". Held cards come first in each
 * hand; the discards are chosen so they never block the target (no "penalty cards").
 */
const NATURAL_EXAMPLES: DrawExample[] = [
  { label: '4 to a Royal', hand: 'As Ks Qs Js 3d', hold: 4, targets: ['royal'] },
  { label: '3 to a Royal', hand: 'As Ks Qs 7d 3c', hold: 3, targets: ['royal'] },
  { label: '2 to a Royal', hand: 'As Ks 8d 7c 3h', hold: 2, targets: ['royal'] },
  { label: '1 Royal card', hand: 'As 8d 7c 5h 3d', hold: 1, targets: ['royal'] },
  { label: '4 to an open Straight Flush', hand: '8s 7s 6s 5s Kd', hold: 4, targets: ['straight-flush'] },
  { label: '4 to an inside Straight Flush', hand: '9s 7s 6s 5s Kd', hold: 4, targets: ['straight-flush'] },
  { label: '3 to a Straight Flush', hand: '8s 7s 6s Kd 2c', hold: 3, targets: ['straight-flush'] },
  { label: 'Three of a Kind', hand: '8s 8d 8h Kc 3d', hold: 3, targets: ['four-kind', 'full-house'] },
  { label: 'Two Pair', hand: '8s 8d 5h 5c Kd', hold: 4, targets: ['full-house'] },
  { label: 'A Pair', hand: '8s 8d Kc 5h 3d', hold: 2, targets: ['four-kind', 'full-house', 'three-kind'] },
  { label: 'One card', hand: '8s Kc 5h 3d 2d', hold: 1, targets: ['four-kind', 'three-kind'] },
  { label: '4 to a Flush', hand: 'Ks 9s 6s 3s 7d', hold: 4, targets: ['flush'] },
  { label: '3 to a Flush', hand: 'Ks 9s 6s 7d 4c', hold: 3, targets: ['flush'] },
  { label: '2 to a Flush', hand: 'Ks 9s 6d 7d 4c', hold: 2, targets: ['flush'] },
  { label: '4 to an open Straight', hand: '9d 8c 7h 6s Kd', hold: 4, targets: ['straight'] },
  { label: '4 to an inside Straight', hand: '9d 8c 6h 5s Kd', hold: 4, targets: ['straight'] },
  { label: '3 to a Straight', hand: '9d 8c 7h Ks 3d', hold: 3, targets: ['straight'] },
  {
    label: 'Nothing (discard all 5)',
    hand: '9d 7c 5h 4s 3d',
    hold: 0,
    targets: ['royal', 'straight-flush', 'four-kind', 'full-house', 'flush', 'straight', 'three-kind'],
  },
];

/** Deuces wild: the deuces you hold matter most, so they get their own ladder. */
const DEUCES_EXAMPLES: DrawExample[] = [
  { label: '4 to a Natural Royal', hand: 'As Ks Qs Js 3d', hold: 4, targets: ['royal'] },
  { label: '3 to a Natural Royal', hand: 'As Ks Qs 7d 3c', hold: 3, targets: ['royal', 'wild-royal'] },
  { label: 'Three Deuces', hand: '2s 2d 2h Kc 7d', hold: 3, targets: ['four-deuces', 'wild-royal', 'five-kind'] },
  { label: 'Two Deuces', hand: '2s 2d Kc 9h 5d', hold: 2, targets: ['four-deuces', 'wild-royal', 'five-kind', 'four-kind'] },
  { label: 'One Deuce', hand: '2s Kc 9h 6d 4c', hold: 1, targets: ['four-deuces', 'wild-royal', 'five-kind', 'four-kind'] },
  { label: 'A Deuce + 3 to a Royal', hand: '2c As Ks Qs 7d', hold: 4, targets: ['wild-royal'] },
  { label: '4 to an open Straight Flush', hand: '8s 7s 6s 5s Kd', hold: 4, targets: ['straight-flush'] },
  { label: 'Three of a Kind', hand: '8s 8d 8h Kc 3d', hold: 3, targets: ['five-kind', 'four-kind', 'full-house'] },
  { label: 'Two Pair', hand: '8s 8d 5h 5c Kd', hold: 4, targets: ['full-house'] },
  { label: 'A Pair', hand: '8s 8d Kc 5h 3d', hold: 2, targets: ['five-kind', 'four-kind', 'full-house', 'three-kind'] },
  { label: '4 to a Flush', hand: 'Ks 9s 6s 3s 7d', hold: 4, targets: ['flush'] },
  { label: '4 to an open Straight', hand: '9d 8c 7h 6s Kd', hold: 4, targets: ['straight'] },
  { label: '4 to an inside Straight', hand: '9d 8c 6h 5s Kd', hold: 4, targets: ['straight'] },
  {
    label: 'Nothing (discard all 5)',
    hand: '9d 7c 5h 4s 3d',
    hold: 0,
    targets: ['royal', 'four-deuces', 'wild-royal', 'five-kind', 'straight-flush', 'four-kind', 'full-house', 'flush', 'straight', 'three-kind'],
  },
];

const isDeucesWild = (game: GameDef): boolean => game.rows.some((r) => r.key.startsWith('four-deuces'));

/** The example holds for this game, restricted to targets the game actually pays. */
export function drawExamples(game: GameDef): DrawExample[] {
  const keys = new Set(oddsCategories(game).map((c) => c.key));
  return (isDeucesWild(game) ? DEUCES_EXAMPLES : NATURAL_EXAMPLES)
    .map((e) => ({ ...e, targets: e.targets.filter((t) => keys.has(t)) }))
    .filter((e) => e.targets.length > 0);
}

/** Example hand as cards plus its hold mask (the first `hold` positions). */
export function exampleHand(e: DrawExample): { hand: Card[]; mask: number } {
  return { hand: parseHand(e.hand), mask: (1 << e.hold) - 1 };
}

/** Session lengths for the "chance you're ahead" table: 100 hands, then 1/2/4/8/20/40 hours at 600 hands/hour. */
export const SESSION_HANDS = [100, 600, 1200, 2400, 4800, 12000, 24000];

export interface SessionOdds {
  hands: number;
  /** P(total paid > hands bet), P(= hands bet), P(< hands bet). */
  ahead: number;
  even: number;
  behind: number;
  /** P(ahead and no royal in the session): how much of `ahead` survives without the jackpot. */
  aheadNoRoyal: number;
}

/**
 * Exact chance of finishing ahead / even / behind after `hands` max-bet hands, in bet units, given the
 * per-hand final-outcome distribution (`probs[i]` pays `pays[i]` per coin; the last entry is no pay).
 * Exact DP over the running total paid. Pays are non-negative, so once the total exceeds the largest
 * checkpoint the session is ahead at every checkpoint: those totals are lumped into one absorbing
 * bucket, which keeps the state space at max(checkpoints) + 2. The bankroll is assumed to cover every
 * hand (no ruin; that is the Bankroll tab's job). `royalIndex` rows are dropped in a second pass to get
 * P(ahead and no royal).
 */
export function sessionOdds(pays: readonly number[], probs: readonly number[], checkpoints: readonly number[], royalIndex: number): SessionOdds[] {
  const run = (p: readonly number[]) => {
    // Merge rows with equal pays; drop impossible ones.
    const byPay = new Map<number, number>();
    pays.forEach((v, i) => {
      if (!Number.isInteger(v) || v < 0) throw new Error(`pay ${v} is not a non-negative integer`);
      if (p[i] > 0) byPay.set(v, (byPay.get(v) ?? 0) + p[i]);
    });
    const steps = [...byPay.entries()];
    const maxPay = Math.max(...steps.map(([v]) => v));
    const last = Math.max(...checkpoints);
    const cap = last + 1; // bucket `cap` = total > last
    let cur = new Float64Array(cap + 1);
    let next = new Float64Array(cap + 1);
    cur[0] = 1;
    let reach = 0; // highest index with mass below the cap
    const out = new Map<number, { ahead: number; even: number; behind: number }>();
    for (let hand = 1; hand <= last; hand++) {
      next.fill(0);
      for (const [v, q] of steps) {
        const top = Math.min(reach, cap - 1);
        for (let t = 0; t <= top; t++) {
          const m = cur[t];
          if (m === 0) continue;
          const u = t + v;
          next[u < cap ? u : cap] += m * q;
        }
        next[cap] += cur[cap] * q;
      }
      reach = Math.min(cap - 1, reach + maxPay);
      [cur, next] = [next, cur];
      if (checkpoints.includes(hand)) {
        let behind = 0;
        for (let t = 0; t < hand; t++) behind += cur[t];
        const even = cur[hand];
        let ahead = cur[cap];
        for (let t = hand + 1; t < cap; t++) ahead += cur[t];
        out.set(hand, { ahead, even, behind });
      }
    }
    return out;
  };
  const all = run(probs);
  const noRoyal = run(probs.map((q, i) => (i === royalIndex ? 0 : q)));
  return checkpoints.map((hands) => ({ hands, ...all.get(hands)!, aheadNoRoyal: noRoyal.get(hands)!.ahead }));
}
