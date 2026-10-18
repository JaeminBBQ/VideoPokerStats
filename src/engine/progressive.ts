/**
 * Progressive royals (D35). The return at a royal meter is exact: reprice the natural royal, rebuild the
 * tables, and play every starting hand perfectly *for that royal* (the best strategy shifts toward royal
 * draws as the meter climbs). Too slow for the browser (~6 s per royal), so scripts/gen-progressive.ts
 * writes a grid to src/progressive/curves.json and the app interpolates.
 */
import { buildTables, perfectPlayReturn } from './ev.ts';
import type { GameDef } from './games.ts';

/** The game with its natural royal (row 0) paying `royalPerCoin`. */
export function withRoyal(game: GameDef, royalPerCoin: number): GameDef {
  return { ...game, rows: game.rows.map((row, i) => (i === 0 ? { ...row, pays: royalPerCoin } : row)) };
}

/** Exact return under perfect play when the royal pays `royalPerCoin`. */
export const returnAtRoyal = (game: GameDef, royalPerCoin: number): number => perfectPlayReturn(buildTables(withRoyal(game, royalPerCoin)));

/** Royal per coin from a meter showing `dollars` for a max-bet royal. */
export const royalPerCoinFromMeter = (dollars: number, denomination: number, maxCoins: number): number =>
  dollars / (denomination * maxCoins);

/** Meter in dollars (max-bet royal) for a royal of `royalPerCoin`. */
export const meterFromRoyalPerCoin = (royalPerCoin: number, denomination: number, maxCoins: number): number =>
  royalPerCoin * denomination * maxCoins;

/** The royal per coin at which perfect play returns 100%, by bisection on the exact return (to `tol`). */
export function breakEvenRoyal(game: GameDef, lo = 800, hi = 4000, tol = 0.5): number {
  if (returnAtRoyal(game, lo) >= 1) return lo;
  while (hi - lo > tol) {
    const mid = (lo + hi) / 2;
    if (returnAtRoyal(game, mid) >= 1) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface ProgressiveCurve {
  /** Royal per coin → exact perfect-play return, ascending royal. */
  points: { royal: number; return: number }[];
  /** Royal per coin where the return reaches 100% (within 0.5). */
  breakEvenRoyal: number;
}

/**
 * Return at `royalPerCoin` from a generated curve. The exact return is convex in the royal (a max of
 * straight lines, one per strategy), so straight-line interpolation is a hair high between grid points;
 * at a 50-per-coin grid that's under 0.01%. Clamps to the curve's ends.
 */
export function interpolateReturn(curve: ProgressiveCurve, royalPerCoin: number): number {
  const p = curve.points;
  if (royalPerCoin <= p[0].royal) return p[0].return;
  for (let i = 1; i < p.length; i++) {
    if (royalPerCoin <= p[i].royal) {
      const t = (royalPerCoin - p[i - 1].royal) / (p[i].royal - p[i - 1].royal);
      return p[i - 1].return + t * (p[i].return - p[i - 1].return);
    }
  }
  return p[p.length - 1].return;
}
