/**
 * Exact blackjack for the goal comparison: infinite-deck basic strategy and the full per-round net-win
 * distribution, for a given set of table rules. Nothing sampled.
 *
 * Infinite deck: every card is drawn independently (A..9 at 1/13 each, ten-valued at 4/13). That makes the
 * player's cards, the dealer's hole card, and every split hand independent, so:
 *   - the dealer's final total depends only on the upcard (conditioned on no dealer blackjack: the dealer
 *     peeks with an ace or ten up, so doubles and splits are only ever made against a non-blackjack);
 *   - each hand's optimal play maximizes its own EV against that dealer distribution (basic strategy);
 *   - after a split, the hands are independent given the dealer's final total, so the round's net is the
 *     convolution of per-hand nets, given the dealer total, over the random number of hands that resplits
 *     create (up to `maxHands`).
 * A real 6–8 deck shoe differs from the infinite deck by about 0.1% of edge; see D22.
 */

export interface BlackjackRules {
  /** Blackjack payout: 1.5 for 3:2, 1.2 for 6:5. */
  bjPays: number;
  hitSoft17: boolean;
  /** Which first two cards may be doubled: any, or only hard 9–11 / hard 10–11. */
  double: 'any' | '9-11' | '10-11';
  /** Double after split. */
  das: boolean;
  /** Most hands a round can split into (4 = split up to three times). */
  maxHands: number;
  resplitAces: boolean;
  /** Late surrender of the first two cards (half the bet back). */
  surrender: boolean;
}

/** The owner's $15 tables (D22): 3:2, dealer stands on all 17s, double any two, double after split, no surrender. */
export const OWNER_RULES: BlackjackRules = {
  bjPays: 1.5,
  hitSoft17: false,
  double: 'any',
  das: true,
  maxHands: 4,
  resplitAces: false,
  surrender: false,
};

/** Card values 1 (ace) .. 10 and their infinite-deck probabilities. */
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PC = (v: number): number => (v === 10 ? 4 / 13 : 1 / 13);

/** Dealer outcomes: index 0..4 = final 17..21, 5 = bust. */
const D_BUST = 5;

const totalOf = (hard: number, ace: boolean): number => (ace && hard + 10 <= 21 ? hard + 10 : hard);
const isSoft = (hard: number, ace: boolean): boolean => ace && hard + 10 <= 21;

/** P(dealer blackjack | upcard) and the dealer's final distribution conditioned on no blackjack. */
export function dealerOdds(up: number, rules: BlackjackRules): { bj: number; final: number[] } {
  const memo = new Map<number, number[]>();
  const from = (hard: number, ace: boolean): number[] => {
    const key = hard * 2 + (ace ? 1 : 0);
    const hit = memo.get(key);
    if (hit) return hit;
    const t = totalOf(hard, ace);
    const out = new Array<number>(6).fill(0);
    if (hard > 21) out[D_BUST] = 1;
    else if (t > 17 || (t === 17 && !(rules.hitSoft17 && isSoft(hard, ace)))) out[t - 17] = 1;
    else
      for (const v of VALUES) {
        const next = from(hard + v, ace || v === 1);
        for (let i = 0; i < 6; i++) out[i] += PC(v) * next[i];
      }
    memo.set(key, out);
    return out;
  };
  let bj = 0;
  const final = new Array<number>(6).fill(0);
  for (const hole of VALUES) {
    if ((up === 1 && hole === 10) || (up === 10 && hole === 1)) {
      bj += PC(hole);
      continue;
    }
    const d = from(up + hole, up === 1 || hole === 1);
    for (let i = 0; i < 6; i++) final[i] += PC(hole) * d[i];
  }
  return { bj, final: final.map((x) => x / (1 - bj)) };
}

/** Player final categories: 0 = bust, 1 = 16 or less, 2..6 = 17..21. */
const CATS = 7;
const catOf = (total: number): number => (total > 21 ? 0 : total <= 16 ? 1 : total - 15);

/** Net for one unit bet: player category vs dealer outcome. */
function settle(cat: number, d: number): number {
  if (cat === 0) return -1;
  if (d === D_BUST) return 1;
  const p = cat === 1 ? 16 : cat + 15;
  const q = d + 17;
  return p > q ? 1 : p < q ? -1 : 0;
}

/** A hand's final distribution: res[m][cat] with bet multiplier m ∈ {1, 2}, plus surrender mass. */
interface HandResult {
  one: number[];
  two: number[];
  surrender: number;
}

const emptyResult = (): HandResult => ({ one: new Array<number>(CATS).fill(0), two: new Array<number>(CATS).fill(0), surrender: 0 });

function addScaled(into: HandResult, r: HandResult, w: number): void {
  for (let c = 0; c < CATS; c++) {
    into.one[c] += w * r.one[c];
    into.two[c] += w * r.two[c];
  }
  into.surrender += w * r.surrender;
}

function evOf(r: HandResult, dealer: number[]): number {
  let ev = -0.5 * r.surrender;
  for (let c = 0; c < CATS; c++)
    for (let d = 0; d < 6; d++) ev += dealer[d] * settle(c, d) * (r.one[c] + 2 * r.two[c]);
  return ev;
}

export type Action = 'stand' | 'hit' | 'double' | 'split' | 'surrender';

/** Everything the strategy and the distribution need for one dealer upcard. */
interface UpcardPlay {
  dealer: number[];
  /** Best hit/stand play from (hard, ace) after the first decision, with its result. */
  play: (hard: number, ace: boolean) => { ev: number; action: 'stand' | 'hit'; result: HandResult };
}

function upcardPlay(dealer: number[]): UpcardPlay {
  const memo = new Map<number, { ev: number; action: 'stand' | 'hit'; result: HandResult }>();
  const standResult = (hard: number, ace: boolean): HandResult => {
    const r = emptyResult();
    r.one[catOf(totalOf(hard, ace))] = 1;
    return r;
  };
  const play = (hard: number, ace: boolean): { ev: number; action: 'stand' | 'hit'; result: HandResult } => {
    const key = hard * 2 + (ace ? 1 : 0);
    const hit = memo.get(key);
    if (hit) return hit;
    const stand = standResult(hard, ace);
    const evStand = evOf(stand, dealer);
    let best: { ev: number; action: 'stand' | 'hit'; result: HandResult } = { ev: evStand, action: 'stand', result: stand };
    if (totalOf(hard, ace) < 21) {
      const r = emptyResult();
      for (const v of VALUES) {
        if (hard + v > 21) r.one[0] += PC(v);
        else addScaled(r, play(hard + v, ace || v === 1).result, PC(v));
      }
      const evHit = evOf(r, dealer);
      if (evHit > evStand) best = { ev: evHit, action: 'hit', result: r };
    }
    memo.set(key, best);
    return best;
  };
  return { dealer, play };
}

function canDouble(rules: BlackjackRules, hard: number, ace: boolean): boolean {
  if (rules.double === 'any') return true;
  if (isSoft(hard, ace)) return false;
  return rules.double === '9-11' ? hard >= 9 && hard <= 11 : hard >= 10 && hard <= 11;
}

function doubleResult(hard: number, ace: boolean): HandResult {
  const r = emptyResult();
  for (const v of VALUES) {
    const h = hard + v;
    r.two[h > 21 ? 0 : catOf(totalOf(h, ace || v === 1))] += PC(v);
  }
  return r;
}

/** Best play of a two-card hand (no split here): stand/hit, double if allowed, surrender if allowed. */
function twoCard(
  up: UpcardPlay,
  rules: BlackjackRules,
  a: number,
  b: number,
  opts: { mayDouble: boolean; maySurrender: boolean; oneCardOnly?: boolean },
): { ev: number; action: Action; result: HandResult } {
  const hard = a + b;
  const ace = a === 1 || b === 1;
  if (opts.oneCardOnly) {
    // Split aces get one card and stand.
    const r = emptyResult();
    r.one[catOf(totalOf(hard, ace))] = 1;
    return { ev: evOf(r, up.dealer), action: 'stand', result: r };
  }
  const base = up.play(hard, ace);
  let best: { ev: number; action: Action; result: HandResult } = { ev: base.ev, action: base.action, result: base.result };
  if (opts.mayDouble && canDouble(rules, hard, ace)) {
    const r = doubleResult(hard, ace);
    const ev = evOf(r, up.dealer);
    if (ev > best.ev) best = { ev, action: 'double', result: r };
  }
  if (opts.maySurrender) {
    const r = emptyResult();
    r.surrender = 1;
    if (-0.5 > best.ev) best = { ev: -0.5, action: 'surrender', result: r };
  }
  return best;
}

/** Joint distribution of (k = hands "c + other card", m = hands "c + c" that may not resplit) after splitting c,c. */
function splitCompositions(c: number, rules: BlackjackRules): { k: number; m: number; p: number }[] {
  const pc = PC(c);
  const canResplit = c !== 1 || rules.resplitAces;
  const out = new Map<string, { k: number; m: number; p: number }>();
  const walk = (pending: number, hands: number, k: number, m: number, p: number) => {
    if (pending === 0) {
      const key = `${k},${m}`;
      const e = out.get(key);
      if (e) e.p += p;
      else out.set(key, { k, m, p });
      return;
    }
    if (canResplit && hands < rules.maxHands) walk(pending + 1, hands + 1, k, m, p * pc);
    else walk(pending - 1, hands, k, m + 1, p * pc);
    walk(pending - 1, hands, k + 1, m, p * (1 - pc));
  };
  walk(2, 2, 0, 0, 1);
  return [...out.values()];
}

interface SplitPlay {
  ev: number;
  comps: { k: number; m: number; p: number }[];
  /** Per-hand results: "c + x" (x ≠ c, mixed over x) and "c + c" (no further split). */
  cx: HandResult;
  cc: HandResult;
}

function splitPlay(up: UpcardPlay, rules: BlackjackRules, c: number): SplitPlay {
  const aces = c === 1;
  const opts = { mayDouble: rules.das && !aces, maySurrender: false, oneCardOnly: aces };
  const cx = emptyResult();
  for (const x of VALUES) if (x !== c) addScaled(cx, twoCard(up, rules, c, x, opts).result, PC(x) / (1 - PC(c)));
  const cc = twoCard(up, rules, c, c, opts).result;
  const comps = splitCompositions(c, rules);
  const evCx = evOf(cx, up.dealer);
  const evCc = evOf(cc, up.dealer);
  const ev = comps.reduce((acc, { k, m, p }) => acc + p * (k * evCx + m * evCc), 0);
  return { ev, comps, cx, cc };
}

/** The engine's basic strategy, for display and for the independent simulation in the tests. */
export interface Strategy {
  /** First decision on the dealt two cards. */
  first(a: number, b: number, upcard: number): Action;
  /** Decision on a two-card hand made by a split (no surrender; no further split; aces: stand). */
  afterSplit(c: number, x: number, upcard: number): Action;
  /** Hit or stand once a hand has three or more cards (hard total with aces as 1, `ace` = holds an ace). */
  later(hard: number, ace: boolean, upcard: number): 'hit' | 'stand';
}

export function strategy(rules: BlackjackRules): Strategy {
  const ups = new Map<number, UpcardPlay>();
  const upOf = (u: number) => {
    let up = ups.get(u);
    if (!up) {
      up = upcardPlay(dealerOdds(u, rules).final);
      ups.set(u, up);
    }
    return up;
  };
  return {
    first(a, b, u) {
      const up = upOf(u);
      const best = twoCard(up, rules, a, b, { mayDouble: true, maySurrender: rules.surrender });
      return a === b && splitPlay(up, rules, a).ev > best.ev ? 'split' : best.action;
    },
    afterSplit(c, x, u) {
      const aces = c === 1;
      return twoCard(upOf(u), rules, c, x, { mayDouble: rules.das && !aces, maySurrender: false, oneCardOnly: aces }).action;
    },
    later(hard, ace, u) {
      return upOf(u).play(hard, ace).action;
    },
  };
}

/** Basic strategy for the first decision on (a, b) vs upcard (values 1..10, 1 = ace). */
export const firstAction = (rules: BlackjackRules, a: number, b: number, upcard: number): Action => strategy(rules).first(a, b, upcard);

/** Net-win distribution of one hand given the dealer outcome d, keyed by net × 10 (integers). */
function handNets(r: HandResult, d: number): Map<number, number> {
  const out = new Map<number, number>();
  const add = (net: number, p: number) => {
    if (p > 0) out.set(Math.round(net * 10), (out.get(Math.round(net * 10)) ?? 0) + p);
  };
  for (let c = 0; c < CATS; c++) {
    add(settle(c, d), r.one[c]);
    add(2 * settle(c, d), r.two[c]);
  }
  add(-0.5, r.surrender);
  return out;
}

function convolve(a: Map<number, number>, b: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [x, p] of a) for (const [y, q] of b) out.set(x + y, (out.get(x + y) ?? 0) + p * q);
  return out;
}

const power = (m: Map<number, number>, n: number): Map<number, number> => {
  let out = new Map<number, number>([[0, 1]]);
  for (let i = 0; i < n; i++) out = convolve(out, m);
  return out;
};

export interface BlackjackOdds {
  /** Expected net per round, in units of the initial bet (negative = house edge). */
  ev: number;
  /** Net win per round (in initial bets) and its probability; sums to 1. */
  outcomes: { net: number; p: number }[];
}

/** Exact infinite-deck basic-strategy odds for one round under `rules`. */
export function blackjackOdds(rules: BlackjackRules): BlackjackOdds {
  const dist = new Map<number, number>();
  const add = (netTimes10: number, p: number) => dist.set(netTimes10, (dist.get(netTimes10) ?? 0) + p);
  for (const upcard of VALUES) {
    const pu = PC(upcard);
    const { bj: dbj, final } = dealerOdds(upcard, rules);
    const up = upcardPlay(final);
    const splits = new Map<number, SplitPlay>();
    for (const a of VALUES)
      for (const b of VALUES) {
        const p = pu * PC(a) * PC(b);
        const playerBj = (a === 1 && b === 10) || (a === 10 && b === 1);
        if (playerBj) {
          add(0, p * dbj);
          add(Math.round(rules.bjPays * 10), p * (1 - dbj));
          continue;
        }
        add(-10, p * dbj); // dealer blackjack (peeked): only the initial bet is lost
        const live = p * (1 - dbj);
        const best = twoCard(up, rules, a, b, { mayDouble: true, maySurrender: rules.surrender });
        let sp: SplitPlay | undefined;
        if (a === b) {
          sp = splits.get(a) ?? splitPlay(up, rules, a);
          splits.set(a, sp);
        }
        if (sp && sp.ev > best.ev) {
          for (let d = 0; d < 6; d++) {
            const cxNets = handNets(sp.cx, d);
            const ccNets = handNets(sp.cc, d);
            for (const { k, m, p: pc } of sp.comps)
              for (const [net, q] of convolve(power(cxNets, k), power(ccNets, m))) add(net, live * final[d] * pc * q);
          }
        } else {
          for (let d = 0; d < 6; d++) for (const [net, q] of handNets(best.result, d)) add(net, live * final[d] * q);
        }
      }
  }
  const outcomes = [...dist.entries()].sort((x, y) => x[0] - y[0]).map(([n, p]) => ({ net: n / 10, p }));
  return { ev: outcomes.reduce((a, o) => a + o.net * o.p, 0), outcomes };
}
