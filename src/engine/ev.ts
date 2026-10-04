/**
 * Exact hold EVs by inclusion–exclusion over precomputed subset sums.
 *
 * sums[S] = total payout of every 5-card hand (from the full deck) that contains card set S, for |S| <= 5.
 * For a dealt hand H and a hold S ⊆ H, the draws are the hands F ⊇ S with F ∩ (H \ S) = ∅, so
 *   Σ payout(draws) = Σ_{T ⊆ H\S} (-1)^|T| · sums[S ∪ T]
 * and EV = that sum / C(deckSize - 5, 5 - |S|). That's 3^5 = 243 lookups for all 32 holds, with exact integer sums.
 */
import type { Card } from './cards.ts';
import { payout, type GameDef } from './games.ts';

const MAX_N = 53;
/** BINOM[n][k] for n <= 53, k <= 5. */
export const BINOM: number[][] = Array.from({ length: MAX_N + 1 }, (_, n) =>
  Array.from({ length: 6 }, (_, k) => {
    let v = 1;
    for (let i = 0; i < k; i++) v = (v * (n - i)) / (i + 1);
    return k > n ? 0 : Math.round(v);
  }),
);

const POPCOUNT = Array.from({ length: 32 }, (_, m) => m.toString(2).replace(/0/g, '').length);

export interface Tables {
  game: GameDef;
  deckSize: number;
  /** offsets[k] = index of the first k-subset in `sums`. */
  offsets: number[];
  sums: Uint32Array;
}

/** Index of an ascending subset in the flat sums array (colex rank within its size block). */
function subsetIndex(offsets: number[], sorted: readonly Card[]): number {
  let idx = offsets[sorted.length];
  for (let i = 0; i < sorted.length; i++) idx += BINOM[sorted[i]][i + 1];
  return idx;
}

/** Builds the subset-sum tables for a game: about 2.9M entries, roughly a second. */
export function buildTables(game: GameDef): Tables {
  const n = game.deckSize;
  const offsets: number[] = [];
  let total = 0;
  for (let k = 0; k <= 5; k++) {
    offsets.push(total);
    total += BINOM[n][k];
  }
  // Payouts are integers <= 800 over <= 2.9M hands, so every sum fits in a Uint32.
  const sums = new Uint32Array(total);
  const h = [0, 0, 0, 0, 0];
  const sub: Card[] = [];
  for (h[0] = 0; h[0] < n; h[0]++)
    for (h[1] = h[0] + 1; h[1] < n; h[1]++)
      for (h[2] = h[1] + 1; h[2] < n; h[2]++)
        for (h[3] = h[2] + 1; h[3] < n; h[3]++)
          for (h[4] = h[3] + 1; h[4] < n; h[4]++) {
            const p = payout(game, h);
            if (p === 0) continue;
            for (let mask = 0; mask < 32; mask++) {
              sub.length = 0;
              for (let i = 0; i < 5; i++) if (mask & (1 << i)) sub.push(h[i]);
              sums[subsetIndex(offsets, sub)] += p;
            }
          }
  return { game, deckSize: n, offsets, sums };
}

export interface HoldEv {
  /** Bit i set = hold the card at position i of the dealt hand (as dealt, not sorted). */
  mask: number;
  held: Card[];
  ev: number;
}

/** Raw EVs indexed by hold mask (positions in the hand as given). */
export function holdEvs(t: Tables, hand: readonly Card[]): Float64Array {
  if (hand.length !== 5 || new Set(hand).size !== 5) throw new Error('need 5 distinct cards');
  const order = [0, 1, 2, 3, 4].sort((a, b) => hand[a] - hand[b]);
  // idx[m] = sums index of the cards selected by position mask m.
  const idx = new Int32Array(32);
  const sub: Card[] = [];
  for (let m = 0; m < 32; m++) {
    sub.length = 0;
    for (const pos of order) if (m & (1 << pos)) sub.push(hand[pos]);
    idx[m] = subsetIndex(t.offsets, sub);
  }
  const evs = new Float64Array(32);
  const remaining = t.deckSize - 5;
  for (let s = 0; s < 32; s++) {
    const free = 31 ^ s;
    let total = 0;
    for (let x = free; ; x = (x - 1) & free) {
      const v = t.sums[idx[s | x]];
      total += POPCOUNT[x] & 1 ? -v : v;
      if (x === 0) break;
    }
    evs[s] = total / BINOM[remaining][5 - POPCOUNT[s]];
  }
  return evs;
}

/** All 32 holds, best first. Ties keep the larger hold first only by EV order; use `isOptimal` to compare. */
export function analyzeHand(t: Tables, hand: readonly Card[]): HoldEv[] {
  const evs = holdEvs(t, hand);
  const out: HoldEv[] = [];
  for (let m = 0; m < 32; m++) out.push({ mask: m, held: hand.filter((_, i) => m & (1 << i)), ev: evs[m] });
  return out.sort((a, b) => b.ev - a.ev || POPCOUNT[b.mask] - POPCOUNT[a.mask]);
}

/** EV differences below this are ties (exact sums make real ties identical to ~1e-15). */
export const EV_EPSILON = 1e-9;

export const maskSize = (mask: number): number => POPCOUNT[mask];

/** Overall return under perfect play: average over every starting hand of the best hold's EV. */
export function perfectPlayReturn(t: Tables, onProgress?: (fraction: number) => void): number {
  const n = t.deckSize;
  const h = [0, 0, 0, 0, 0];
  let total = 0;
  for (h[0] = 0; h[0] < n; h[0]++) {
    onProgress?.(h[0] / n);
    for (h[1] = h[0] + 1; h[1] < n; h[1]++)
      for (h[2] = h[1] + 1; h[2] < n; h[2]++)
        for (h[3] = h[2] + 1; h[3] < n; h[3]++)
          for (h[4] = h[3] + 1; h[4] < n; h[4]++) {
            const evs = holdEvs(t, h);
            let best = 0;
            for (let m = 0; m < 32; m++) if (evs[m] > best) best = evs[m];
            total += best;
          }
  }
  return total / BINOM[n][5];
}
