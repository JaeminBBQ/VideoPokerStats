/**
 * Exact risk of ruin for video poker by dynamic programming (no Monte Carlo).
 *
 * Model. The bankroll is a whole number of bets (one bet = a max-bet hand (coins per machine, D16)). Before
 * each hand, a bankroll below 1 bet is broke (ruined). Otherwise the player pays 1 bet and gets
 * back `pays[k]` bets with probability `probs[k]`. Hands are independent.
 *
 *   S_0(b) = 1                                   for b >= 0
 *   S_n(b) = 0                                   if b < 1
 *   S_n(b) = sum_k p_k * S_{n-1}(b - 1 + pays_k) otherwise
 *
 * S_n(b) is the probability of playing all n hands without going broke. Ending the last hand
 * at 0 is not ruin (the player finished the session); ruin only means "can't cover the next bet".
 *
 * Truncation. Bankrolls above an internal cap are clamped to the cap. Because S_n(b) is
 * non-decreasing in b, clamping replaces S(b') by S(cap) <= S(b'), so the table can only
 * UNDERSTATE survival (conservative: bankroll-needed figures can only be too high). The cap is
 * maxBankroll + max pay + margin; callers verify the error is negligible by rerunning with a
 * larger margin (see `capSensitivity` and the tests).
 */

/** Per-hand outcome distribution when each hand independently is a mistake with probability e. */
export function mixDistribution(best: readonly number[], second: readonly number[], e: number): number[] {
  if (best.length !== second.length) throw new Error('best/second length mismatch');
  if (!(e >= 0 && e <= 1)) throw new Error(`error rate ${e} out of [0,1]`);
  return best.map((p, i) => (1 - e) * p + e * second[i]);
}

/** Merges outcomes with equal pays and drops zero-probability ones. Pays must be non-negative integers. */
export function collapseOutcomes(pays: readonly number[], probs: readonly number[]): { pays: number[]; probs: number[] } {
  if (pays.length !== probs.length) throw new Error('pays/probs length mismatch');
  const m = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < pays.length; i++) {
    const pay = pays[i];
    const p = probs[i];
    if (!Number.isInteger(pay) || pay < 0) throw new Error(`pay ${pay} is not a non-negative integer number of bets`);
    if (!(p >= 0)) throw new Error(`bad probability ${p}`);
    total += p;
    if (p > 0) m.set(pay, (m.get(pay) ?? 0) + p);
  }
  if (Math.abs(total - 1) > 1e-9) throw new Error(`probabilities sum to ${total}, not 1`);
  const keys = [...m.keys()].sort((a, b) => a - b);
  return { pays: keys, probs: keys.map((k) => m.get(k)!) };
}

/** Expected return per bet and std dev of the per-hand net result (in bets). */
export function moments(pays: readonly number[], probs: readonly number[]): { ret: number; sd: number } {
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i < pays.length; i++) {
    m1 += probs[i] * pays[i];
    m2 += probs[i] * pays[i] * pays[i];
  }
  return { ret: m1, sd: Math.sqrt(Math.max(0, m2 - m1 * m1)) };
}

export const DEFAULT_CAP_MARGIN = 1000;

/**
 * Survival tables at several horizons in one backward pass. Returns one Float64Array of length
 * maxBankroll + 1 per horizon (same order as `horizons`), where out[h][b] = S_{horizons[h]}(b).
 */
export function survivalTables(
  pays: readonly number[],
  probs: readonly number[],
  horizons: readonly number[],
  maxBankroll: number,
  capMargin = DEFAULT_CAP_MARGIN,
): Float64Array[] {
  if (!Number.isInteger(maxBankroll) || maxBankroll < 0) throw new Error('maxBankroll must be a non-negative integer');
  for (const h of horizons) if (!Number.isInteger(h) || h < 0) throw new Error(`bad horizon ${h}`);
  const o = collapseOutcomes(pays, probs);
  const K = o.pays.length;
  const P = Float64Array.from(o.probs);
  const maxPay = o.pays[K - 1];
  const cap = maxBankroll + maxPay + capMargin;
  // Shift d_k = pay_k - 1 so the next bankroll is b + d_k.
  const D = Int32Array.from(o.pays, (x) => x - 1);

  let prev = new Float64Array(cap + 1).fill(1); // S_0
  let next = new Float64Array(cap + 1);
  const maxN = horizons.length ? Math.max(...horizons) : 0;
  const out: Float64Array[] = horizons.map(() => new Float64Array(0));
  const snap = (n: number) => {
    for (let h = 0; h < horizons.length; h++) if (horizons[h] === n) out[h] = prev.slice(0, maxBankroll + 1);
  };
  snap(0);

  for (let n = 1; n <= maxN; n++) {
    next.fill(0);
    // next[0] stays 0 (broke). For b >= 1: next[b] = sum_k P[k] * prev[min(b + D[k], cap)].
    for (let k = 0; k < K; k++) {
      const p = P[k];
      const d = D[k];
      // b + d <= cap  <=>  b <= cap - d. Lowest b is 1, so b + d >= 0 since d >= -1.
      const hi = Math.min(cap, cap - d);
      for (let b = 1; b <= hi; b++) next[b] += p * prev[b + d];
      if (hi < cap) {
        const pc = p * prev[cap];
        for (let b = Math.max(1, hi + 1); b <= cap; b++) next[b] += pc;
      }
    }
    const t = prev;
    prev = next;
    next = t;
    snap(n);
  }
  return out;
}

/** S[b] = P(never broke during `hands` hands | start with b bets), b = 0..maxBankroll. */
export function survivalTable(
  pays: readonly number[],
  probs: readonly number[],
  hands: number,
  maxBankroll: number,
  capMargin = DEFAULT_CAP_MARGIN,
): Float64Array {
  return survivalTables(pays, probs, [hands], maxBankroll, capMargin)[0];
}

/**
 * Smallest bankroll b (in bets) with S[b] >= target, or -1 if no b in the table reaches it.
 * S is non-decreasing in b (a bigger bankroll survives every path a smaller one does); this is
 * checked as we scan, up to float noise.
 */
export function bankrollNeeded(S: ArrayLike<number>, target: number): number {
  for (let b = 0; b < S.length; b++) {
    if (b > 0 && S[b] < S[b - 1] - 1e-12) throw new Error(`survival not monotone at b=${b}`);
    if (S[b] >= target) return b;
  }
  return -1;
}

/** Max |S - S'| over b = 0..maxBankroll between the given margin and a much larger one. */
export function capSensitivity(
  pays: readonly number[],
  probs: readonly number[],
  horizons: readonly number[],
  maxBankroll: number,
  margin = DEFAULT_CAP_MARGIN,
  biggerMargin = margin + maxBankroll + 2000,
): number[] {
  const a = survivalTables(pays, probs, horizons, maxBankroll, margin);
  const b = survivalTables(pays, probs, horizons, maxBankroll, biggerMargin);
  return a.map((s, h) => {
    let m = 0;
    for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i] - b[h][i]));
    return m;
  });
}
