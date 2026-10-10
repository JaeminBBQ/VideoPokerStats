import type { SessionRun } from './simulate.ts';

/**
 * Formatting and geometry helpers for the Simulator tab's charts and tables. Pure functions
 * (no React, no SVG) so they can be tested; the components stay thin.
 */

/** "4:00": hands at 600/hour as hours:minutes. */
export function clockFromHands(hands: number): string {
  const mins = Math.round(hands / 10);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

/** Hours to the nearest 3 minutes (0.05 h), with up to two decimals: 2.9, 1.35, 1.05. */
export function hoursText(hours: number): string {
  return String(Math.round(hours * 20) / 20);
}

/** Percentages for the edge line: three decimals, e.g. "99.644%", "0.456%". */
export function edgePct(x: number): string {
  return `${(x * 100).toFixed(3)}%`;
}

/** A chance as a percentage with one decimal ("20.0%", "0.3%"), "0%" for zero — the leave table's precision. */
export function pct1(p: number): string {
  return p <= 0 ? '0%' : `${(p * 100).toFixed(1)}%`;
}

/** A "nice" step for cents ticks over `range`: 1/2/2.5/5 × 10^k of the range's quarter. */
export function niceCentsStep(rangeCents: number): number {
  const raw = Math.max(rangeCents, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / pow;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * pow;
}

/** Tick values from the first multiple of `step` at or above `lo` through `hi` (never below 0). */
export function centsTicks(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  const first = Math.max(0, Math.ceil(lo / step - 1e-9));
  for (let k = first; k * step <= hi + 1e-9; k++) ticks.push(k * step);
  return ticks;
}

/** Hour marks for the x axis: every hour up to a 6-hour session, every two above. */
export function hourTicks(hours: number): number[] {
  const spacing = hours > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t < hours - 1e-9; t += spacing) ticks.push(t);
  if (hours > 0) ticks.push(hours);
  return ticks;
}

/** Bankroll at `hand` along the bucketed path (linear between its points); null outside it. */
export function pathCentsAt(path: SessionRun['path'], hand: number): number | null {
  if (path.length === 0 || hand < path[0].hand || hand > path[path.length - 1].hand) return null;
  for (let i = 1; i < path.length; i++) {
    const b = path[i];
    if (hand <= b.hand) {
      const a = path[i - 1];
      const span = b.hand - a.hand;
      return span === 0 ? b.cents : a.cents + ((b.cents - a.cents) * (hand - a.hand)) / span;
    }
  }
  return path[path.length - 1].cents;
}

/** `buckets` equal-width buckets over the sorted `nets`, for the histogram. */
export function histogram(nets: number[], buckets: number): { from: number; to: number; count: number }[] {
  const n = nets.length;
  const lo = n > 0 ? nets[0] : 0;
  const hi = n > 0 ? nets[n - 1] : 0;
  const width = (hi - lo || 1) / buckets;
  const out: { from: number; to: number; count: number }[] = [];
  let j = 0;
  for (let i = 0; i < buckets; i++) {
    const from = lo + i * width;
    const to = from + width;
    const start = j;
    const last = i === buckets - 1;
    while (j < n && (last ? nets[j] <= to : nets[j] < to)) j++;
    out.push({ from, to, count: j - start });
  }
  return out;
}

/** "$120" or "$87.50": a y-axis label for a cents tick. */
export function axisDollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
