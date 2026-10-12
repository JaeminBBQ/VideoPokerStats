import type { LeaveOdds } from '../engine/leave.ts';
import type { EndReason } from '../lib/simulate.ts';

/** Input options and event helpers shared by the video poker and table-game simulators (both live on
 * the Simulator tab). */

export const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];

export type GoalMode = 'none' | 'p25' | 'p50' | 'double' | 'custom';
export const GOAL_FRACTIONS: Record<Exclude<GoalMode, 'none' | 'custom'>, number> = {
  p25: 0.25,
  p50: 0.5,
  double: 1,
};

export const END_ROWS: { key: EndReason; label: string; exact: (o: LeaveOdds) => number }[] = [
  { key: 'win', label: 'Hit the goal', exact: (o) => o.pWin },
  { key: 'loss-limit', label: 'Hit the loss limit', exact: (o) => o.pLossLimit },
  { key: 'broke', label: 'Out of money', exact: (o) => o.pBroke },
  { key: 'time', label: 'Time ran out', exact: (o) => o.pTime },
];

/** Marker colors by hand category (the ones `simulate.ts` records as events). */
export const EVENT_COLORS: Record<string, string> = {
  royal: '#e6c15c',
  'four-deuces': '#4ade80',
  'wild-royal': '#c084fc',
  'five-kind': '#60a5fa',
  'straight-flush': '#2dd4bf',
  'four-kind': '#fb923c',
};

/** What was held before the draw, in the owner's words ('' when a row has no hold data). */
export function heldText(held: string): string {
  if (held.startsWith('Pat ')) return 'dealt';
  if (held === 'Discard everything') return 'drew all 5';
  if (held === '') return '';
  return `held ${held}`;
}
