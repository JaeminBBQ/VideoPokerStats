/**
 * Exact per-hand outcome distributions (which paytable row the final hand lands in) under two policies:
 *
 *   best   — hold `analyzeHand(...)[0]`, the max-EV hold;
 *   second — the "mistake" hold: the highest-EV hold whose EV is below the best by more than EV_EPSILON
 *            (holds tied with the best are not mistakes).
 *
 * The indicator-table trick: `holdEvs` returns Σ payout(draw) / #draws for every hold. If the game's payout
 * is replaced by an indicator (1 when the final hand lands in row k, else 0), the same inclusion–exclusion
 * returns P(final hand is in row k | hold). So we build one subset-count table per row (plus one for
 * "no pay"), all in a single pass over the C(n,5) hands, and read off exact row probabilities for any
 * hold. Enumerating every starting hand and averaging gives the exact distribution; nothing is sampled.
 * The "no pay" row is counted directly (not as 1 − Σ rows), so Σ = 1 is a real check.
 */
import type { Card } from './cards.ts';
import { analyzeHand, BINOM, buildTables, EV_EPSILON, holdEvs, type Tables } from './ev.ts';
import type { GameDef } from './games.ts';

const POPCOUNT = Array.from({ length: 32 }, (_, m) => m.toString(2).replace(/0/g, '').length);

/** Same layout as ev.ts: colex rank of an ascending subset within its size block. */
function subsetIndex(offsets: number[], sorted: readonly Card[]): number {
  let idx = offsets[sorted.length];
  for (let i = 0; i < sorted.length; i++) idx += BINOM[sorted[i]][i + 1];
  return idx;
}

/**
 * One indicator table per outcome: index k < rows.length is row k, index rows.length is "no pay".
 * Each is a `Tables` whose sums count (rather than pay) the hands containing each subset.
 */
export function buildOutcomeTables(game: GameDef): Tables[] {
  const n = game.deckSize;
  const offsets: number[] = [];
  let total = 0;
  for (let k = 0; k <= 5; k++) {
    offsets.push(total);
    total += BINOM[n][k];
  }
  const outcomes = game.rows.length + 1;
  const sums = Array.from({ length: outcomes }, () => new Uint32Array(total));
  const h = [0, 0, 0, 0, 0];
  const sub: Card[] = [];
  for (h[0] = 0; h[0] < n; h[0]++)
    for (h[1] = h[0] + 1; h[1] < n; h[1]++)
      for (h[2] = h[1] + 1; h[2] < n; h[2]++)
        for (h[3] = h[2] + 1; h[3] < n; h[3]++)
          for (h[4] = h[3] + 1; h[4] < n; h[4]++) {
            const row = game.evaluate(h);
            const s = sums[row < 0 ? game.rows.length : row];
            for (let mask = 0; mask < 32; mask++) {
              sub.length = 0;
              for (let i = 0; i < 5; i++) if (mask & (1 << i)) sub.push(h[i]);
              s[subsetIndex(offsets, sub)]++;
            }
          }
  return sums.map((s, k) => ({
    game: {
      ...game,
      rows: game.rows.map((r, i) => ({ ...r, pays: i === k ? 1 : 0 })),
      evaluate: (hand: readonly Card[]) => {
        const row = game.evaluate(hand);
        return (row < 0 ? game.rows.length : row) === k ? 0 : -1;
      },
    },
    deckSize: n,
    offsets,
    sums: s,
  }));
}

/** sums-array index for each of the 32 position masks of a hand (offsets are shared by all tables of a deck). */
function maskIndices(offsets: number[], hand: readonly Card[]): Int32Array {
  const order = [0, 1, 2, 3, 4].sort((a, b) => hand[a] - hand[b]);
  const idx = new Int32Array(32);
  const sub: Card[] = [];
  for (let m = 0; m < 32; m++) {
    sub.length = 0;
    for (const pos of order) if (m & (1 << pos)) sub.push(hand[pos]);
    idx[m] = subsetIndex(offsets, sub);
  }
  return idx;
}

/** Exact integer count of draws for hold `s` that land in this table's outcome. */
function maskCount(t: Tables, idx: Int32Array, s: number): number {
  const free = 31 ^ s;
  let total = 0;
  for (let x = free; ; x = (x - 1) & free) {
    const v = t.sums[idx[s | x]];
    total += POPCOUNT[x] & 1 ? -v : v;
    if (x === 0) break;
  }
  return total;
}

const maskValue = (t: Tables, idx: Int32Array, s: number): number => maskCount(t, idx, s) / BINOM[t.deckSize - 5][5 - POPCOUNT[s]];

/** P(final hand in each outcome) for one hand and hold mask (positions as dealt); last entry = no pay. */
export function holdOutcomes(outcomeTables: Tables[], hand: readonly Card[], mask: number): number[] {
  const idx = maskIndices(outcomeTables[0].offsets, hand);
  return outcomeTables.map((t) => maskValue(t, idx, mask));
}

/** The best mask (`analyzeHand[0]`) and the highest-EV mask below it by more than EV_EPSILON. */
export function bestAndSecond(tables: Tables, hand: readonly Card[]): { best: number; second: number } {
  const ranked = analyzeHand(tables, hand);
  const top = ranked[0].ev;
  const second = ranked.find((h) => h.ev < top - EV_EPSILON);
  if (!second) throw new Error(`no non-tied hold for hand ${hand.join(',')}`);
  return { best: ranked[0].mask, second: second.mask };
}

export interface OutcomeDistribution {
  /** Indexed by row; the extra final element is P(no pay). */
  best: number[];
  second: number[];
}

/** Exact outcome distributions over every starting hand, for perfect play and for the best non-tied mistake. */
export function outcomeDistribution(game: GameDef, onProgress?: (fraction: number) => void): OutcomeDistribution {
  const tables = buildTables(game);
  const outcomeTables = buildOutcomeTables(game);
  const k = outcomeTables.length;
  const n = game.deckSize;
  // Integer draw counts bucketed by hold size (each size has its own denominator), so the sums stay exact:
  // at most C(47,5) per hand times C(52,5) hands is about 4e12, well inside 2^53.
  const best = new Float64Array(k * 6);
  const second = new Float64Array(k * 6);
  const h = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < n; h[0]++) {
    onProgress?.(h[0] / n);
    for (h[1] = h[0] + 1; h[1] < n; h[1]++)
      for (h[2] = h[1] + 1; h[2] < n; h[2]++)
        for (h[3] = h[2] + 1; h[3] < n; h[3]++)
          for (h[4] = h[3] + 1; h[4] < n; h[4]++) {
            const evs = holdEvs(tables, h);
            // Same selection as bestAndSecond / analyzeHand (EV desc, then larger hold, then lower mask),
            // inlined to skip the sort in the 2.6M-hand loop.
            let b = 0;
            for (let m = 1; m < 32; m++) if (evs[m] > evs[b] || (evs[m] === evs[b] && POPCOUNT[m] > POPCOUNT[b])) b = m;
            let s = -1;
            for (let m = 0; m < 32; m++) {
              if (!(evs[m] < evs[b] - EV_EPSILON)) continue;
              if (s < 0 || evs[m] > evs[s] || (evs[m] === evs[s] && POPCOUNT[m] > POPCOUNT[s])) s = m;
            }
            if (s < 0) throw new Error(`no non-tied hold for hand ${h.join(',')}`);
            const idx = maskIndices(tables.offsets, h);
            const bs = POPCOUNT[b];
            const ss = POPCOUNT[s];
            for (let i = 0; i < k; i++) {
              best[i * 6 + bs] += maskCount(outcomeTables[i], idx, b);
              second[i * 6 + ss] += maskCount(outcomeTables[i], idx, s);
            }
          }
  }
  const hands = BINOM[n][5];
  const finish = (acc: Float64Array): number[] =>
    Array.from({ length: k }, (_, i) => {
      let p = 0;
      for (let size = 0; size <= 5; size++) p += acc[i * 6 + size] / BINOM[n - 5][5 - size];
      return p / hands;
    });
  return { best: finish(best), second: finish(second) };
}
