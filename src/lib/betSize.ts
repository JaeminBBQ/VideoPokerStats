import { goalProbability } from '../engine/goals.ts';
import type { GameDef } from '../engine/games.ts';
import type { LeaveRule } from '../engine/leave.ts';
import { denomCents } from './bankroll.ts';
import type { GameOdds } from './odds.ts';

/**
 * "How much should I bet?" (D34): every bet the owner's photos show for this game (each confirmed
 * denomination at max coins, plus its photographed short bets), compared for one budget.
 *
 * A short bet pays every row the same per coin except the natural royal (`royalPerCoin`, 250 on most
 * machines). It's played with the trainer's max-bet strategy, so the row chances are the game's perfect-play
 * chances (`perRow[].best`) and only the royal's pay changes. That's what the owner actually plays (the
 * best short-bet strategy is a little different and worth about 0.1–0.2% more).
 */

/** Pace for the per-hour columns: the Bankroll tab's (500 hands ≈ 1 hour). */
export const BET_SIZE_HANDS_PER_HOUR = 500;

/** Bets above this aren't compared (the owner plays ≤ $1; the $10 max bets are there for reference). */
export const MAX_COMPARED_BET_CENTS = 1000;

/** "Make it last" lengths, in hands. */
export const LAST_HANDS = [500, 1000, 2000];

export interface BetOption {
  denomination: number;
  coins: number;
  maxCoins: number;
  betCents: number;
  /** Royal per coin at this bet: 800 at max (and on machines that pay it early), 250 short. */
  royalPerCoin: number;
  /** Pays per bet for each `perRow` row, and their chances (perfect max-bet play). */
  pays: number[];
  probs: number[];
  /** Expected return (1 = break even). */
  ret: number;
}

/**
 * Every photographed way to bet this game, one per bet amount (when two ways bet the same amount, the
 * higher return wins: more coins at a smaller denomination), smallest bet first.
 */
export function betOptions(game: GameDef, odds: GameOdds): BetOption[] {
  const probs = odds.perRow.map((r) => r.best);
  const byBet = new Map<number, BetOption>();
  for (const offer of game.offers) {
    if (!offer.confirmed) continue;
    const ways = [...(offer.shortBets ?? []), { coins: offer.maxCoins, royalPerCoin: odds.perRow[0].pays }];
    for (const { coins, royalPerCoin } of ways) {
      const pays = odds.perRow.map((r, i) => (i === 0 ? royalPerCoin : r.pays));
      const option: BetOption = {
        denomination: offer.denomination,
        coins,
        maxCoins: offer.maxCoins,
        betCents: denomCents(offer.denomination) * coins,
        royalPerCoin,
        pays,
        probs,
        ret: pays.reduce((a, v, i) => a + v * probs[i], 0),
      };
      if (option.betCents > MAX_COMPARED_BET_CENTS) continue;
      const prev = byBet.get(option.betCents);
      if (!prev || option.ret > prev.ret) byBet.set(option.betCents, option);
    }
  }
  return [...byBet.values()].sort((a, b) => a.betCents - b.betCents);
}

/** Average loss per hour in cents at `BET_SIZE_HANDS_PER_HOUR`. */
export const lossPerHourCents = (o: BetOption): number => (1 - o.ret) * o.betCents * BET_SIZE_HANDS_PER_HOUR;

/** P(up `goalCents` before the budget can't cover a bet), exact; 0 when the budget is under one bet. */
export function goalChance(o: BetOption, budgetCents: number, goalCents: number): number {
  const outcomes = o.pays.map((v, i) => ({ net: v - 1, p: o.probs[i] }));
  return goalProbability(outcomes, Math.floor(budgetCents / o.betCents), Math.ceil(goalCents / o.betCents));
}

/** The leave rule for "still playing after `hands` hands": no goal, no loss limit. */
export const lastRule = (hands: number): LeaveRule => ({ winBets: Infinity, lossBets: Infinity, maxHands: hands });

/**
 * P(still able to bet after `hands` hands) without the DP when it's certain: a bankroll of at least `hands`
 * bets can't go broke in time (each hand loses at most one bet), and under one bet can't start. Otherwise
 * undefined: ask the engine worker (`leave` with `lastRule`).
 */
export function lastChanceShortcut(o: BetOption, budgetCents: number, hands: number): number | undefined {
  const bets = Math.floor(budgetCents / o.betCents);
  if (bets < 1) return 0;
  if (bets >= hands) return 1;
  return undefined;
}

/** Index of the best option for a goal: highest chance; ties (within 1e-9) go to the smaller bet. */
export function bestForGoal(chances: readonly number[]): number {
  return chances.reduce((bi, p, i) => (p > chances[bi] + 1e-9 ? i : bi), 0);
}

/**
 * Index of the biggest bet that still lasts with at least `target` chance, or -1 when none does (null
 * chances are unknown and skipped). Full-royal bets come first: a short bet is only picked when no full-royal
 * bet lasts, since it gives up the royal for the same budget.
 */
export function bestForLasting(options: readonly BetOption[], chances: readonly (number | null)[], target: number): number {
  const lasts = options.map((_, i) => i).filter((i) => chances[i] !== null && chances[i]! >= target - 1e-12);
  const full = lasts.filter((i) => isFullRoyal(options[i]));
  const pool = full.length ? full : lasts;
  return pool.length ? pool[pool.length - 1] : -1;
}

/** True when this bet earns the full royal (800 per coin). */
export const isFullRoyal = (o: BetOption): boolean => o.royalPerCoin >= 800;
