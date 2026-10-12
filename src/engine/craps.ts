/**
 * Exact craps, roll by roll, for the Simulator (D31): pass or don't, one line bet or a 3-point molly
 * (line bet plus up to two come / don't come bets), with or without odds at the owner's bubble craps
 * limits (1× on 4 and 10, 2× on 5, 6, 8, 9; lay odds sized to win the same multiple).
 *
 * Money is in units of 1/5 of the base (flat) bet, which makes every pay whole: take odds pay 2:1, 3:2,
 * 6:5 on 5 / 10 / 10 units; lay odds risk 10 / 15 / 12 to win 5 / 10 / 10.
 *
 * The table state (puck, line bet, come bets on numbers, a come bet in transit) is a finite Markov chain
 * over rolls. A policy decides what to bet before each roll from the rack (chips not on the table):
 *   - New line bet when the puck is off: with odds if the rack covers flat + the largest odds, else a bare
 *     flat bet if the rack covers one bet, else nothing.
 *   - Molly: one come / don't come bet per roll while the line bet is on a point and fewer than two come
 *     bets are out, only when the rack covers flat + the largest odds (so their odds are always affordable).
 *   - Pass-side come bets' odds are off on the come-out roll (returned on a 7 or a hit); lay odds always work.
 * A session stops making new bets when it hits the goal or the loss limit (counted on rack + chips on the
 * table) or runs out of time; bets already out play to the end ("wind-down"), so results are what you
 * actually leave with. Out of money = nothing on the table and the rack can't cover a bet.
 *
 * Exact: a DP over (table state, rack) per roll, plus each table state's exact wind-down distribution.
 * Tail mass below DROP_BELOW per cell is dropped (about 1e-13 in total, far below any shown digit);
 * `dropped` reports it.
 */

export type CrapsSide = 'pass' | 'dont';
export type CrapsStyle = 'single' | 'molly';
export interface CrapsSystem {
  side: CrapsSide;
  style: CrapsStyle;
  odds: boolean;
}

export const UNITS_PER_BET = 5;
const FLAT = 5;
/** Points 4, 5, 6, 8, 9, 10 and how many of the 36 rolls make each. */
const POINTS = [4, 5, 6, 8, 9, 10];
const POINT_INDEX = new Map(POINTS.map((p, i) => [p, i]));
/** Owner's bubble craps odds limits (D31): 1× on 4/10, 2× on 5/6/8/9. */
export const ODDS_MULTIPLE = [1, 2, 2, 2, 2, 1];
const TAKE_AMT = [5, 10, 10, 10, 10, 5];
const TAKE_WIN = [10, 15, 12, 12, 15, 10];
const LAY_AMT = [10, 15, 12, 12, 15, 10];
const LAY_WIN = [5, 10, 10, 10, 10, 5];
const ROLL_WAYS: [number, number][] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((t) => [t, 6 - Math.abs(7 - t)]);

/** Probability mass below this in one (state, rack) cell is dropped. */
export const DROP_BELOW = 1e-16;

interface TableState {
  /** -1 = puck off (come-out), else point index. */
  puck: number;
  /** Line bet: 0 none, 1 flat only, 2 flat with odds. */
  line: number;
  /** Come / don't come bets on numbers (point indices, sorted); they carry odds iff the system takes odds. */
  comes: number[];
  /** A come / don't come bet placed this roll, not yet on a number. */
  transit: boolean;
}

const keyOf = (s: TableState) => `${s.puck}|${s.line}|${s.comes.join(',')}|${s.transit ? 1 : 0}`;

/** A transition: next state index, rack change in units (returns minus new stakes), probability. */
export interface Step {
  to: number;
  d: number;
  q: number;
}

export interface CrapsModel {
  system: CrapsSystem;
  /** Rack needed for a bet with odds (flat + largest odds), in units. */
  cover: number;
  states: TableState[];
  /** Units on the table in each state. */
  face: number[];
  /** Nothing on the table. */
  empty: boolean[];
  /**
   * steps[cls][s]: transitions from state s for the policy class cls: 0 = place nothing (rack < 1 bet, or
   * winding down), 1 = rack covers a flat bet only, 2 = rack covers flat + odds.
   */
  steps: Step[][][];
  /** byRoll[cls][s][t − 2]: the same transitions unmerged, per dice total t (the simulator needs the total). */
  byRoll: { to: number; d: number }[][][];
  /** Index of the empty come-out state (the start). */
  start: number;
}

const cache = new Map<string, CrapsModel>();

/** The table-state chain for a betting system (cached). */
export function crapsModel(system: CrapsSystem): CrapsModel {
  const ck = `${system.side}|${system.style}|${system.odds}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const dont = system.side === 'dont';
  const oddsAmt = dont ? LAY_AMT : TAKE_AMT;
  const oddsWin = dont ? LAY_WIN : TAKE_WIN;
  const cover = system.odds ? FLAT + Math.max(...oddsAmt) : FLAT;
  const comeOdds = system.odds;

  const states: TableState[] = [];
  const index = new Map<string, number>();
  const idOf = (s: TableState): number => {
    const k = keyOf(s);
    let i = index.get(k);
    if (i === undefined) {
      i = states.length;
      states.push(s);
      index.set(k, i);
    }
    return i;
  };
  const faceOf = (s: TableState): number => {
    let f = 0;
    if (s.line > 0) f += FLAT + (s.puck >= 0 && s.line === 2 ? oddsAmt[s.puck] : 0);
    for (const c of s.comes) f += FLAT + (comeOdds ? oddsAmt[c] : 0);
    if (s.transit) f += FLAT;
    return f;
  };

  /** Policy before the roll: returns the state with new bets and the units staked. */
  const decide = (s: TableState, cls: number): { s: TableState; staked: number } => {
    if (cls === 0) return { s, staked: 0 };
    if (s.puck < 0 && s.line === 0) {
      const line = cls === 2 && system.odds ? 2 : 1;
      return { s: { ...s, line }, staked: FLAT };
    }
    if (system.style === 'molly' && cls === 2 && s.puck >= 0 && s.line > 0 && !s.transit && s.comes.length < 2)
      return { s: { ...s, transit: true }, staked: FLAT };
    return { s, staked: 0 };
  };

  /** One roll of total t from state s (bets already placed): next state and units returned to the rack. */
  const roll = (s: TableState, t: number): { s: TableState; gain: number } => {
    const pt = POINT_INDEX.get(t);
    let gain = 0;
    let line = s.line;
    // Line bet.
    if (line > 0) {
      if (s.puck < 0) {
        const win = dont ? t === 2 || t === 3 : t === 7 || t === 11;
        const push = dont && t === 12;
        const lose = dont ? t === 7 || t === 11 : t === 2 || t === 3 || t === 12;
        if (win) gain += 2 * FLAT;
        if (push) gain += FLAT;
        if (win || push || lose) line = 0;
        else if (line === 2) gain -= oddsAmt[pt!]; // point set: put the odds up
      } else {
        const p = s.puck;
        const odds = line === 2 ? oddsAmt[p] + oddsWin[p] : 0;
        if (t === 7) {
          if (dont) gain += 2 * FLAT + odds;
          line = 0;
        } else if (t === POINTS[p]) {
          if (!dont) gain += 2 * FLAT + odds;
          line = 0;
        }
      }
    }
    // Come / don't come bets on numbers.
    const comes: number[] = [];
    for (const c of s.comes) {
      const amt = comeOdds ? oddsAmt[c] : 0;
      const won = comeOdds ? amt + oddsWin[c] : 0;
      if (t === 7) {
        if (dont) gain += 2 * FLAT + won;
        else if (s.puck < 0) gain += amt; // pass-side come odds are off on the come-out: returned
      } else if (t === POINTS[c]) {
        if (!dont) gain += 2 * FLAT + (s.puck < 0 ? amt : won);
      } else comes.push(c);
    }
    // Come bet in transit: plays like a come-out.
    if (s.transit) {
      const win = dont ? t === 2 || t === 3 : t === 7 || t === 11;
      const push = dont && t === 12;
      if (win) gain += 2 * FLAT;
      else if (push) gain += FLAT;
      else if (pt !== undefined) {
        comes.push(pt);
        if (comeOdds) gain -= oddsAmt[pt];
      }
    }
    comes.sort((a, b) => a - b);
    // Puck.
    let puck = s.puck;
    if (puck < 0) {
      if (pt !== undefined) puck = pt;
    } else if (t === 7 || t === POINTS[puck]) puck = -1;
    return { s: { puck, line, comes, transit: false }, gain };
  };

  const start = idOf({ puck: -1, line: 0, comes: [], transit: false });
  const steps: Step[][][] = [[], [], []];
  const byRoll: { to: number; d: number }[][][] = [[], [], []];
  for (let i = 0; i < states.length; i++) {
    for (let cls = 0; cls < 3; cls++) {
      const { s, staked } = decide(states[i], cls);
      const merged = new Map<string, Step>();
      byRoll[cls][i] = [];
      for (const [t, ways] of ROLL_WAYS) {
        const r = roll(s, t);
        const to = idOf(r.s);
        const d = r.gain - staked;
        byRoll[cls][i][t - 2] = { to, d };
        const k = `${to}|${d}`;
        const e = merged.get(k);
        if (e) e.q += ways / 36;
        else merged.set(k, { to, d, q: ways / 36 });
      }
      steps[cls][i] = [...merged.values()];
    }
  }
  const model: CrapsModel = {
    system,
    cover,
    states,
    face: states.map(faceOf),
    empty: states.map((s) => s.line === 0 && s.comes.length === 0 && !s.transit),
    steps,
    byRoll,
    start,
  };
  cache.set(ck, model);
  return model;
}

/** Policy class for a rack (see `CrapsModel.steps`). */
export const classFor = (m: CrapsModel, rack: number): number => (rack >= m.cover ? 2 : rack >= FLAT ? 1 : 0);

export interface WindDown {
  /** Eventual rack change (units) when no new bets are made, and its probability. */
  gains: Map<number, number>;
  /** Expected rolls until the table is empty. */
  rolls: number;
}

const windCache = new WeakMap<CrapsModel, WindDown[]>();

/** Exact wind-down per state: what the bets on the table eventually return, with no new bets (cached). */
export function windDowns(m: CrapsModel): WindDown[] {
  const hit = windCache.get(m);
  if (hit) return hit;
  const all = m.states.map((_, s0) => {
    let cur = new Map<string, number>([[`${s0}|0`, 1]]);
    const gains = new Map<number, number>();
    let rolls = 0;
    for (let n = 0; n < 5000 && cur.size; n++) {
      const next = new Map<string, number>();
      for (const [k, p] of cur) {
        const [s, g] = k.split('|').map(Number);
        if (m.empty[s]) {
          gains.set(g, (gains.get(g) ?? 0) + p);
          continue;
        }
        if (p < DROP_BELOW) continue;
        rolls += p;
        for (const st of m.steps[0][s]) {
          const nk = `${st.to}|${g + st.d}`;
          next.set(nk, (next.get(nk) ?? 0) + p * st.q);
        }
      }
      cur = next;
    }
    return { gains, rolls };
  });
  windCache.set(m, all);
  return all;
}

export interface CrapsRule {
  /** Stop betting once rack + table is up this many units (Infinity = no goal). */
  winUnits: number;
  /** Stop betting once down this many units (Infinity = no limit). */
  lossUnits: number;
  /** Rolls of active betting. */
  maxRolls: number;
}

export interface CrapsOdds {
  pWin: number;
  pLossLimit: number;
  pBroke: number;
  pTime: number;
  /** P(final rack, after wind-down, above the start). */
  pAhead: number;
  /** Expected rolls (betting plus wind-down) and expected net in base bets. */
  expHands: number;
  expNetBets: number;
  /** Probability mass dropped as negligible (for tests). */
  dropped: number;
}

/** Above this many cell updates the exact DP is skipped (keeps the page responsive). */
export const MAX_CRAPS_WORK = 1e9;

/** Exact session odds for a craps system (see the file comment). `startUnits` = budget in units. */
export function crapsLeaveOdds(system: CrapsSystem, startUnits: number, rule: CrapsRule): CrapsOdds | null {
  const m = crapsModel(system);
  const wd = windDowns(m);
  const start = Math.floor(startUnits);
  const out: CrapsOdds = { pWin: 0, pLossLimit: 0, pBroke: 0, pTime: 0, pAhead: 0, expHands: 0, expNetBets: 0, dropped: 0 };
  if (start < FLAT) return { ...out, pBroke: 1 };
  const winLine = Number.isFinite(rule.winUnits) ? start + Math.max(1, Math.ceil(rule.winUnits)) : Infinity;
  // A loss line that leaves less than one bet is the same as playing until broke.
  const lossAt = Number.isFinite(rule.lossUnits) ? start - Math.ceil(rule.lossUnits) : -Infinity;
  const lossLine = lossAt < FLAT ? -Infinity : lossAt;
  const S = m.states.length;

  // Flat transition tables per class: steps of (class, state) are [off[c][s], off[c][s + 1]).
  const flat = [0, 1, 2].map((c) => {
    const lists = m.steps[c];
    const off = new Int32Array(S + 1);
    for (let s = 0; s < S; s++) off[s + 1] = off[s] + lists[s].length;
    const to = new Int32Array(off[S]);
    const d = new Int32Array(off[S]);
    const q = new Float64Array(off[S]);
    for (let s = 0; s < S; s++) lists[s].forEach((st, j) => ((to[off[s] + j] = st.to), (d[off[s] + j] = st.d), (q[off[s] + j] = st.q)));
    return { off, to, d, q };
  });
  let maxUp = 0;
  for (const f of flat) for (const x of f.d) if (x > maxUp) maxUp = x;

  // Rack arrays per state (grown before a roll when needed), and stopped mass per reason, state, rack.
  let R = (Number.isFinite(winLine) ? (winLine as number) : start) + 2 * maxUp + 64;
  const alloc = () => Array.from({ length: S }, () => new Float64Array(R));
  let cur = alloc();
  let next = alloc();
  const stopped = { pWin: alloc(), pLossLimit: alloc(), pTime: alloc() };
  const grow = (need: number) => {
    let nR = R;
    while (nR <= need) nR *= 2;
    const re = (arr: Float64Array[]) => arr.map((x) => {
      const y = new Float64Array(nR);
      y.set(x);
      return y;
    });
    cur = re(cur);
    next = re(next);
    stopped.pWin = re(stopped.pWin);
    stopped.pLossLimit = re(stopped.pLossLimit);
    stopped.pTime = re(stopped.pTime);
    R = nR;
  };
  const lo = new Int32Array(S).fill(1 << 30);
  const hi = new Int32Array(S).fill(-1);
  const nlo = new Int32Array(S);
  const nhi = new Int32Array(S);
  cur[m.start][start] = 1;
  lo[m.start] = hi[m.start] = start;

  let expNet = 0; // units, broke paths only; stopped paths are settled below
  let work = 0;
  // Rack ranges per policy class: [0, FLAT) → 0, [FLAT, cover) → 1, [cover, ∞) → 2.
  const classLo = [0, FLAT, m.cover];
  const classHi = [FLAT - 1, m.cover - 1, 1 << 30];
  for (let n = 0; n < rule.maxRolls; n++) {
    let top = -1;
    for (let s = 0; s < S; s++) if (hi[s] > top) top = hi[s];
    if (top < 0) break;
    if (top + maxUp >= R) grow(top + maxUp);
    nlo.fill(1 << 30);
    nhi.fill(-1);
    for (let s = 0; s < S; s++) {
      if (hi[s] < 0) continue;
      const row = cur[s];
      // Trim negligible tails at both ends.
      let a0 = lo[s];
      let b0 = hi[s];
      for (; a0 <= b0 && row[a0] < DROP_BELOW; a0++) {
        out.dropped += row[a0];
        row[a0] = 0;
      }
      for (; b0 >= a0 && row[b0] < DROP_BELOW; b0--) {
        out.dropped += row[b0];
        row[b0] = 0;
      }
      for (let r = a0; r <= b0; r++) out.expHands += row[r];
      for (let c = 0; c < 3; c++) {
        const a = Math.max(a0, classLo[c]);
        const b = Math.min(b0, classHi[c]);
        if (a > b) continue;
        const f = flat[c];
        for (let j = f.off[s]; j < f.off[s + 1]; j++) {
          const to = f.to[j];
          const d = f.d[j];
          const q = f.q[j];
          const face = m.face[to];
          work += b - a + 1;
          // r ≥ winFrom: goal; r ≤ lossTo: loss limit; r ≤ brokeTo: out of money; else keeps playing.
          const winFrom = winLine - d - face;
          const lossTo = lossLine - d - face;
          const brokeTo = m.empty[to] ? FLAT - 1 - d : -Infinity;
          const moveLo = Math.max(a, Math.floor(Math.max(lossTo, brokeTo)) + 1);
          const moveHi = Math.min(b, Math.ceil(winFrom) - 1);
          const nx = next[to];
          for (let r = moveLo; r <= moveHi; r++) nx[r + d] += row[r] * q;
          if (moveLo <= moveHi) {
            if (moveLo + d < nlo[to]) nlo[to] = moveLo + d;
            if (moveHi + d > nhi[to]) nhi[to] = moveHi + d;
          }
          const sw = stopped.pWin[to];
          for (let r = Math.max(a, Math.ceil(winFrom)); r <= b; r++) sw[r + d] += row[r] * q;
          const lowHi = Math.min(b, Math.floor(Math.max(lossTo, brokeTo)), Math.ceil(winFrom) - 1);
          if (lossTo >= brokeTo) {
            const sl = stopped.pLossLimit[to];
            for (let r = a; r <= lowHi; r++) sl[r + d] += row[r] * q;
          } else {
            for (let r = a; r <= lowHi; r++) {
              const p = row[r] * q;
              out.pBroke += p;
              expNet += p * (r + d - start);
            }
          }
        }
      }
      for (let r = a0; r <= b0; r++) row[r] = 0;
      hi[s] = -1;
      lo[s] = 1 << 30;
    }
    // Give up early when the work so far projects past the cap (the support only widens over time).
    if (work > MAX_CRAPS_WORK || (n >= 20 && (work / (n + 1)) * rule.maxRolls > MAX_CRAPS_WORK)) return null;
    [cur, next] = [next, cur];
    lo.set(nlo);
    hi.set(nhi);
  }
  // Time's up: everything still betting stops and winds down.
  for (let s = 0; s < S; s++) for (let r = lo[s]; r <= hi[s]; r++) stopped.pTime[s][r] += cur[s][r];
  // Settle stopped mass with each state's exact wind-down.
  for (const reason of ['pWin', 'pLossLimit', 'pTime'] as const) {
    const arr = stopped[reason];
    for (let s = 0; s < S; s++) {
      const row = arr[s];
      const w = wd[s];
      for (let r = 0; r < R; r++) {
        const p = row[r];
        if (p === 0) continue;
        out[reason] += p;
        out.expHands += p * w.rolls;
        for (const [g, q] of w.gains) {
          if (r + g > start) out.pAhead += p * q;
          expNet += p * q * (r + g - start);
        }
      }
    }
  }
  out.expNetBets = expNet / UNITS_PER_BET;
  return out;
}

/**
 * Long-run averages with an unlimited bankroll (always class 2): expected net and money staked per roll,
 * in base bets, from the chain's stationary distribution (power iteration to 1e-15).
 */
export function crapsPerRoll(system: CrapsSystem): { netPerRoll: number; stakedPerRoll: number; flatsPerRoll: number } {
  const m = crapsModel(system);
  const S = m.states.length;
  let pi = new Float64Array(S);
  pi[m.start] = 1;
  for (let it = 0; it < 100_000; it++) {
    const nx = new Float64Array(S);
    for (let s = 0; s < S; s++) if (pi[s]) for (const st of m.steps[2][s]) nx[st.to] += pi[s] * st.q;
    let diff = 0;
    for (let s = 0; s < S; s++) diff += Math.abs(nx[s] - pi[s]);
    pi = nx;
    if (diff < 1e-15) break;
  }
  // Net change in (rack + table) per roll.
  let net = 0;
  for (let s = 0; s < S; s++) if (pi[s]) for (const st of m.steps[2][s]) net += pi[s] * st.q * (st.d + m.face[st.to] - m.face[s]);
  // Flat bets placed per roll: a line bet when the puck is off with none out, or a molly come bet.
  let flats = 0;
  for (let s = 0; s < S; s++) {
    const st = m.states[s];
    if (!pi[s]) continue;
    if (st.puck < 0 && st.line === 0) flats += pi[s];
    else if (system.style === 'molly' && st.puck >= 0 && st.line > 0 && !st.transit && st.comes.length < 2) flats += pi[s];
  }
  // Each flat bet whose point is set (line or come, the same 24 in 36) carries odds when the system takes
  // them: average odds stake per flat bet = Σ P(point) × odds amount.
  const oddsAmt = system.side === 'dont' ? LAY_AMT : TAKE_AMT;
  const oddsPerFlat = system.odds ? POINTS.reduce((acc, p, i) => acc + ((6 - Math.abs(7 - p)) / 36) * oddsAmt[i], 0) : 0;
  const staked = flats * (FLAT + oddsPerFlat);
  return { netPerRoll: net / UNITS_PER_BET, stakedPerRoll: staked / UNITS_PER_BET, flatsPerRoll: flats };
}

/**
 * Bubble craps side bets (D32): win if every total in `numbers` rolls before a 7. A bet is placed at the
 * start and after each 7; it is paid as soon as its set is complete (then waits for the next 7), and a 7
 * loses it. `paysFor` is "for 1" (the stake is part of the payout).
 */
export interface SideBet {
  id: 'small' | 'tall' | 'all';
  name: string;
  numbers: number[];
  paysFor: number;
}

/** The owner's recollection, unconfirmed until photographed (D32): 31 for 1 (30 to 1) and 151 for 1 (150 to 1). */
export const SIDE_BETS: SideBet[] = [
  { id: 'small', name: 'All Small', numbers: [2, 3, 4, 5, 6], paysFor: 31 },
  { id: 'tall', name: 'All Tall', numbers: [8, 9, 10, 11, 12], paysFor: 31 },
  { id: 'all', name: "Make 'Em All", numbers: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12], paysFor: 151 },
];
export const SIDE_BETS_CONFIRMED = false;

/**
 * Exact P(every total in `numbers` rolls before a 7), by inclusion–exclusion over subsets T of the numbers:
 * Σ (−1)^|T| · p7 / (p7 + p(T)), where p(T) is the chance a roll lands in T. Exact enumeration of 2^n terms.
 */
export function allBeforeSeven(numbers: readonly number[]): number {
  const w = numbers.map((t) => 6 - Math.abs(7 - t));
  let total = 0;
  for (let mask = 0; mask < 1 << w.length; mask++) {
    let ways = 0;
    let bits = 0;
    for (let i = 0; i < w.length; i++) {
      if (!(mask & (1 << i))) continue;
      ways += w[i];
      bits++;
    }
    total += (bits & 1 ? -1 : 1) * (6 / (6 + ways));
  }
  return total;
}

/** P(win), house edge per bet, and 1-in-N, for a side bet. */
export function sideBetOdds(b: SideBet): { p: number; edge: number; oneIn: number } {
  const p = allBeforeSeven(b.numbers);
  return { p, edge: 1 - p * b.paysFor, oneIn: 1 / p };
}

/** Rolls that are 7: one side-bet round starts per 7, so 1/6 of rolls in the long run. */
export const SIDE_ROUNDS_PER_ROLL = 1 / 6;
