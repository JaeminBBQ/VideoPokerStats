import { describe, expect, it } from 'vitest';
import {
  axisDollars,
  centsTicks,
  clockFromHands,
  edgePct,
  histogram,
  hourTicks,
  hoursText,
  niceCentsStep,
  pathCentsAt,
  pct1,
} from './simChart.ts';

describe('simChart formatting', () => {
  it('clockFromHands converts 600 hands/hour to h:mm', () => {
    expect(clockFromHands(2400)).toBe('4:00');
    expect(clockFromHands(810)).toBe('1:21');
    expect(clockFromHands(1746)).toBe('2:55');
    expect(clockFromHands(0)).toBe('0:00');
  });

  it('hoursText rounds to the nearest 0.05 h and trims', () => {
    expect(hoursText(2.9102)).toBe('2.9');
    expect(hoursText(1.3457)).toBe('1.35');
    expect(hoursText(1.0538)).toBe('1.05');
    expect(hoursText(4)).toBe('4');
    expect(hoursText(0.5)).toBe('0.5');
  });

  it('edgePct shows three decimals', () => {
    expect(edgePct(0.995439)).toBe('99.544%');
    expect(edgePct(1.000439)).toBe('100.044%');
    expect(edgePct(0.003561)).toBe('0.356%');
  });

  it('pct1 shows one decimal and 0% for zero', () => {
    expect(pct1(0.1998)).toBe('20.0%');
    expect(pct1(0.589)).toBe('58.9%');
    expect(pct1(0)).toBe('0%');
  });
});

describe('simChart geometry', () => {
  it('niceCentsStep picks 1/2/2.5/5 × 10^k steps', () => {
    expect(niceCentsStep(16000)).toBe(5000);
    expect(niceCentsStep(23000)).toBe(10000);
    expect(niceCentsStep(600)).toBe(200);
  });

  it('centsTicks runs from the first multiple at or above lo through hi', () => {
    expect(centsTicks(0, 15000, 5000)).toEqual([0, 5000, 10000, 15000]);
    expect(centsTicks(1250, 10000, 5000)).toEqual([5000, 10000]);
  });

  it('hourTicks marks every hour up to 6, every two above, and the end', () => {
    expect(hourTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(hourTicks(12)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(hourTicks(0.5)).toEqual([0, 0.5]);
  });

  it('pathCentsAt interpolates between bucket points and returns null outside', () => {
    const path = [
      { hand: 0, cents: 1000 },
      { hand: 100, cents: 500 },
      { hand: 200, cents: 900 },
    ];
    expect(pathCentsAt(path, 0)).toBe(1000);
    expect(pathCentsAt(path, 50)).toBe(750);
    expect(pathCentsAt(path, 150)).toBe(700);
    expect(pathCentsAt(path, 200)).toBe(900);
    expect(pathCentsAt(path, 250)).toBeNull();
    expect(pathCentsAt(path, -1)).toBeNull();
  });

  it('histogram buckets all sorted values into equal widths', () => {
    const nets = Array.from({ length: 1000 }, (_, i) => i - 500); // -500..499
    const bars = histogram(nets, 20);
    expect(bars).toHaveLength(20);
    expect(bars.reduce((a, b) => a + b.count, 0)).toBe(1000);
    expect(bars.every((b) => b.count === 50)).toBe(true);
    expect(bars[0].from).toBe(-500);
    expect(bars[19].to).toBeCloseTo(499, 6);
  });

  it('histogram handles a flat distribution (all nets equal)', () => {
    const bars = histogram(new Array(10).fill(-7000), 20);
    expect(bars.reduce((a, b) => a + b.count, 0)).toBe(10);
  });

  it('axisDollars drops cents on whole dollars only', () => {
    expect(axisDollars(5000)).toBe('$50');
    expect(axisDollars(1250)).toBe('$12.50');
    expect(axisDollars(100)).toBe('$1');
  });
});
