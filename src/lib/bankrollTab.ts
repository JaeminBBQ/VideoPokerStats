import { GAME_LIST, type GameDef } from '../engine/index.ts';
import { bankrollBets, betsToCents, nearestErrorRate, riskFor, RISK } from './riskData.ts';
import { errorRate, type TotalsEntry } from './stats.ts';

export interface CompareCell {
  hands: number;
  bets: number;
  cents: number;
}

export interface CompareRow {
  game: GameDef;
  cells: CompareCell[];
}

export interface MineState {
  /** False when the game has no Deal-mode hands, so the "Mine" chip is disabled. */
  available: boolean;
  /** The game's error rate as a percentage (0–100), shown before the arrow in the chip. */
  percent: number;
  /** `percent` snapped to the nearest risk column; this is the value actually used. */
  rate: number;
}

/** A risk error-rate column as a percentage label: 0.005 → "0.5%", 0.01 → "1%". */
export function rateLabel(rate: number): string {
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/**
 * Compare-table rows: every catalog game with risk data, one cell per `RISK.horizons` column,
 * sorted by the 2,000-hand column (cheapest first); ties break on game id for stability.
 */
export function compareRows(denomination: number, errorRate: number, target: number): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const game of GAME_LIST) {
    if (!riskFor(game.id)) continue;
    const cells: CompareCell[] = RISK.horizons.map((hands) => {
      const bets = bankrollBets(game.id, errorRate, hands, target) ?? 0;
      return { hands, bets, cents: betsToCents(bets, denomination) };
    });
    rows.push({ game, cells });
  }
  return rows.sort((a, b) => {
    const mid = (r: CompareRow): number => r.cells.find((c) => c.hands === 2000)?.cents ?? Infinity;
    return mid(a) - mid(b) || a.game.id.localeCompare(b.game.id);
  });
}

/** The "Mine" chip state for one game's Deal-mode totals. */
export function mineFromTotals(totals: TotalsEntry): MineState {
  const percent = errorRate(totals);
  return { available: totals.hands > 0, percent, rate: nearestErrorRate(percent / 100) };
}
