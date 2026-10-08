import { describe, expect, it } from 'vitest';
import { GAMES, draw, mulberry32, parseHand } from '../engine/index.ts';
import {
  applyHand,
  betCents,
  canAfford,
  centsToNextPoint,
  denomCents,
  formatCents,
  netCents,
  settleHand,
  startSession,
  theoLossCents,
  tierPoints,
} from './bankroll.ts';
import { DENOMINATIONS, DENOM_LABELS } from './storage.ts';

const job = GAMES['job-8-5'];
const deuces = GAMES['lb-deuces-16-13'];

describe('draw', () => {
  it('keeps held cards in place and replaces the rest with distinct undealt cards', () => {
    const rng = mulberry32(7);
    for (let t = 0; t < 2000; t++) {
      const hand = parseHand('As Ks Qs Js 9d');
      const mask = t % 32;
      const out = draw(hand, mask, 52, rng);
      expect(out).toHaveLength(5);
      expect(new Set(out).size).toBe(5);
      for (let i = 0; i < 5; i++) {
        if (mask & (1 << i)) expect(out[i]).toBe(hand[i]);
        else expect(hand).not.toContain(out[i]);
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThan(52);
      }
    }
  });

  it('holding all five changes nothing', () => {
    const hand = parseHand('2c 2d 7h 8s Kd');
    expect(draw(hand, 31, 52, mulberry32(1))).toEqual(hand);
  });

  it('draws every stub card about equally often', () => {
    const hand = parseHand('As Ks Qs Js 9d');
    const counts = new Array<number>(52).fill(0);
    const rng = mulberry32(42);
    const n = 47_000;
    for (let t = 0; t < n; t++) counts[draw(hand, 0b01111, 52, rng)[4]]++;
    for (const c of hand) expect(counts[c]).toBe(0);
    const stub = counts.filter((_, c) => !hand.includes(c));
    for (const k of stub) expect(Math.abs(k - 1000)).toBeLessThan(150); // ~4.7σ
  });
});

describe('bankroll', () => {
  it('converts denominations to integer cents, max bet', () => {
    expect(denomCents(0.05)).toBe(5);
    expect(denomCents(0.1)).toBe(10);
    expect(denomCents(0.25)).toBe(25);
    expect(betCents(0.05, 5)).toBe(25);
    expect(betCents(0.25, 5)).toBe(125);
    expect(betCents(0.05, 20)).toBe(100); // GSR 5¢ max bet is 20 coins
    expect(betCents(1, 10)).toBe(1000);
    expect(DENOMINATIONS.map(denomCents)).toEqual([1, 5, 10, 25, 50, 100, 200, 500]);
    for (const d of DENOMINATIONS) expect(DENOM_LABELS[d]).toBeTruthy();
  });

  it('settles at max bet: royal at 5¢ pays $200, jacks pay the bet back, nothing pays 0', () => {
    expect(settleHand(job, parseHand('As Ks Qs Js Ts'), 0.05)).toEqual({ betCents: 25, winCents: 20000, rowIndex: 0 });
    const jacks = settleHand(job, parseHand('Jc Jd 3h 4s 9c'), 0.05);
    expect(jacks.winCents).toBe(25);
    expect(job.rows[jacks.rowIndex].key).toBe('jacks-or-better');
    expect(settleHand(job, parseHand('2c 5d 8h Js Kc'), 0.25)).toEqual({ betCents: 125, winCents: 0, rowIndex: -1 });
    // Deuces 16/13: four deuces pay 200 per coin → $50 at 5¢ max bet.
    expect(settleHand(deuces, parseHand('2c 2d 2h 2s 9c'), 0.05).winCents).toBe(5000);
  });

  it('settles GSR games at their own max bet (D16)', () => {
    const job95 = GAMES['gsr-job-9-5'];
    const db = GAMES['gsr-db-9-7-5'];
    // 5¢ × 20 coins = $1.00 a hand; a royal pays 800 per coin = $800.
    expect(settleHand(job95, parseHand('As Ks Qs Js Ts'), 0.05)).toEqual({ betCents: 100, winCents: 80000, rowIndex: 0 });
    // $1 × 10 coins = $10 a hand; four aces pay 160 per coin = $1,600.
    expect(settleHand(db, parseHand('Ac Ad Ah As 3c'), 1).winCents).toBe(160000);
    expect(canAfford(startSession(99, 0), job95, 0.05)).toBe(false);
    expect(canAfford(startSession(100, 0), job95, 0.05)).toBe(true);
    expect(() => settleHand(job95, parseHand('As Ks Qs Js Ts'), 0.25)).toThrow(); // not offered at 25¢
  });

  it('tracks balance, coin-in, wins and net', () => {
    let s = startSession(10000, 0);
    s = applyHand(s, job, settleHand(job, parseHand('2c 5d 8h Js Kc'), 0.05));
    s = applyHand(s, job, settleHand(job, parseHand('Kc Kd 3h 4s 9c'), 0.05));
    s = applyHand(s, job, settleHand(job, parseHand('9c 9d 9h 4s 2c'), 0.05));
    expect(s.hands).toBe(3);
    expect(s.coinInCents).toBe(75);
    expect(s.wonCents).toBe(25 + 75);
    expect(s.balanceCents).toBe(10000 - 75 + 100);
    expect(netCents(s)).toBe(25);
    expect(theoLossCents(s)).toBeCloseTo(75 * (1 - job.publishedReturn), 9);
  });

  it('refuses a bet the balance cannot cover', () => {
    const s = startSession(30, 0);
    expect(canAfford(s, job, 0.05)).toBe(true);
    const after = applyHand(s, job, settleHand(job, parseHand('2c 5d 8h Js Kc'), 0.05));
    expect(after.balanceCents).toBe(5);
    expect(canAfford(after, job, 0.05)).toBe(false);
    expect(() => applyHand(after, job, settleHand(job, parseHand('2c 5d 8h Js Kc'), 0.05))).toThrow();
  });

  it('rejects a non-positive or fractional starting bankroll', () => {
    expect(() => startSession(0, 0)).toThrow();
    expect(() => startSession(12.5, 0)).toThrow();
  });

  it('earns 1 tier point per $2 of coin-in', () => {
    expect(tierPoints(0)).toBe(0);
    expect(tierPoints(175)).toBe(0); // seven 5¢ max-bet hands
    expect(tierPoints(200)).toBe(1); // eight 5¢ hands
    expect(tierPoints(125 * 9)).toBe(5); // nine 25¢ hands = $11.25
    expect(centsToNextPoint(75)).toBe(125);
    expect(centsToNextPoint(200)).toBe(200);
  });

  it('formats cents', () => {
    expect(formatCents(12345)).toBe('$123.45');
    expect(formatCents(-25)).toBe('-$0.25');
    expect(formatCents(0)).toBe('$0.00');
  });
});
