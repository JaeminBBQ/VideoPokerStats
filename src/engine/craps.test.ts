import { describe, expect, it } from 'vitest';
import { mulberry32 } from './cards.ts';
import { allBeforeSeven, crapsLeaveOdds, crapsModel, crapsPerRoll, SIDE_BETS, sideBetOdds, windDowns, type CrapsRule, type CrapsSystem } from './craps.ts';
import { leaveOddsTiered } from './leave.ts';

describe('craps model (D31)', () => {
  it('every transition list sums to 1 and every wind-down ends', () => {
    for (const side of ['pass', 'dont'] as const)
      for (const style of ['single', 'molly'] as const)
        for (const odds of [true, false]) {
          const m = crapsModel({ side, style, odds });
          for (const byClass of m.steps) for (const list of byClass) expect(list.reduce((a, s) => a + s.q, 0)).toBeCloseTo(1, 14);
          for (const w of windDowns(m)) expect([...w.gains.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        }
  });

  it('long-run edges: 7/495 pass, 3/220 don\'t per flat bet; one line bet per 557/165 rolls', () => {
    const r = crapsPerRoll({ side: 'pass', style: 'single', odds: true });
    expect(r.flatsPerRoll).toBeCloseTo(165 / 557, 12);
    expect(-r.netPerRoll / r.flatsPerRoll).toBeCloseTo(7 / 495, 12);
    const d = crapsPerRoll({ side: 'dont', style: 'molly', odds: true });
    expect(-d.netPerRoll / d.flatsPerRoll).toBeCloseTo(3 / 220, 12);
  });

  it('a single line bet with odds matches the per-decision DP exactly', () => {
    // Pass line + odds per decision in fifths of a bet (owner's limits), bare line below 3 bets.
    const pts: [number, number, number][] = [
      [3, 5, 10], // 4/10: ways, odds stake, odds win
      [4, 10, 15],
      [5, 10, 12],
    ];
    const steps = new Map<number, number>([[5, 8 / 36], [-5, 4 / 36]]);
    const add = (d: number, p: number) => steps.set(d, (steps.get(d) ?? 0) + p);
    for (const [w, a, win] of pts) {
      const pw = w / (w + 6);
      add(5 + win, 2 * (w / 36) * pw);
      add(-5 - a, 2 * (w / 36) * (1 - pw));
    }
    const tiers = [
      { coverUnits: 15, steps: [...steps] },
      { coverUnits: 5, steps: [[5, 244 / 495], [-5, 251 / 495]] as [number, number][] },
    ];
    for (const [w, l] of [[50, Infinity], [100, 50], [40, 60]]) {
      const a = leaveOddsTiered(tiers, 100, 5, { winUnits: w, lossUnits: l, maxRounds: 6000 })!;
      const b = crapsLeaveOdds({ side: 'pass', style: 'single', odds: true }, 100, { winUnits: w, lossUnits: l, maxRolls: 60000 })!;
      expect(b.pWin).toBeCloseTo(a.pWin, 10);
      expect(b.pLossLimit).toBeCloseTo(a.pLossLimit, 10);
      expect(b.pBroke).toBeCloseTo(a.pBroke, 10);
      expect(b.expNetBets).toBeCloseTo(a.expNetBets, 8);
      expect(b.dropped).toBeLessThan(1e-11);
    }
  });
});

/**
 * An independent dice-level player, written from the casino rules (not from the chain): real dice, a
 * puck, and bet objects. Same policy as the engine. Returns [end reason, final rack in units].
 */
function playSession(sys: CrapsSystem, start: number, rule: CrapsRule, rand: () => number): [string, number] {
  const dont = sys.side === 'dont';
  const mult: Record<number, number> = { 4: 1, 5: 2, 6: 2, 8: 2, 9: 2, 10: 1 };
  const trueOdds: Record<number, [number, number]> = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };
  // Take: stake 5·mult, wins stake·a/b. Lay: wins 5·mult, stakes win·a/b.
  const oddsStake = (p: number) => (dont ? (5 * mult[p] * trueOdds[p][0]) / trueOdds[p][1] : 5 * mult[p]);
  const oddsWin = (p: number) => (dont ? 5 * mult[p] : (5 * mult[p] * trueOdds[p][0]) / trueOdds[p][1]);
  const cover = sys.odds ? 5 + (dont ? 15 : 10) : 5;
  type Bet = { line: boolean; point: number | null; odds: number };
  let bets: Bet[] = [];
  let puck: number | null = null;
  let rack = start;
  const winLine = start + rule.winUnits;
  const lossLine = start - rule.lossUnits < 5 ? -Infinity : start - rule.lossUnits;
  const onTable = () => bets.reduce((a, b) => a + 5 + b.odds, 0);
  let end: string | null = rack < 5 ? 'broke' : null;
  let rolls = 0;
  for (;;) {
    const betting = end === null && rolls < rule.maxRolls;
    if (!betting && bets.length === 0) break;
    if (betting) {
      const hasLine = bets.some((b) => b.line);
      const comes = bets.filter((b) => !b.line).length;
      if (puck === null && !hasLine && rack >= 5) {
        bets.push({ line: true, point: null, odds: rack >= cover && sys.odds ? -1 : 0 }); // -1: odds once a point is set
        rack -= 5;
      } else if (sys.style === 'molly' && puck !== null && hasLine && comes < 2 && !bets.some((b) => !b.line && b.point === null) && rack >= cover) {
        bets.push({ line: false, point: null, odds: sys.odds ? -1 : 0 });
        rack -= 5;
      }
    }
    const t = 2 + Math.floor(rand() * 6) + Math.floor(rand() * 6);
    rolls++;
    const kept: Bet[] = [];
    for (const b of bets) {
      const comeOut = b.point === null;
      if (comeOut) {
        const win = dont ? t === 2 || t === 3 : t === 7 || t === 11;
        const push = dont && t === 12;
        const lose = dont ? t === 7 || t === 11 : t === 2 || t === 3 || t === 12;
        if (win) rack += 10;
        else if (push) rack += 5;
        else if (!lose) {
          b.point = t;
          if (b.odds === -1) {
            b.odds = oddsStake(t);
            rack -= b.odds;
          }
          kept.push(b);
        }
        continue;
      }
      const p = b.point!;
      // Pass-side come bets' odds are off on the come-out roll.
      const oddsOff = !dont && !b.line && puck === null;
      if (t === 7) {
        if (dont) rack += 10 + (b.odds ? b.odds + oddsWin(p) : 0);
        else if (oddsOff) rack += b.odds;
      } else if (t === p) {
        if (!dont) rack += 10 + (b.odds ? (oddsOff ? b.odds : b.odds + oddsWin(p)) : 0);
      } else kept.push(b);
    }
    bets = kept;
    if (puck === null) {
      if ([4, 5, 6, 8, 9, 10].includes(t)) puck = t;
    } else if (t === 7 || t === puck) puck = null;
    if (end === null && rolls <= rule.maxRolls) {
      const total = rack + onTable();
      if (total >= winLine) end = 'win';
      else if (total <= lossLine) end = 'loss';
      else if (bets.length === 0 && rack < 5) end = 'broke';
    }
  }
  return [end ?? 'time', rack];
}

describe('craps exact vs an independent dice simulation (sampled check only)', () => {
  it.each([
    [{ side: 'pass', style: 'molly', odds: true }, 166, { winUnits: 83, lossUnits: Infinity, maxRolls: 200 }],
    [{ side: 'dont', style: 'molly', odds: true }, 166, { winUnits: Infinity, lossUnits: 83, maxRolls: 200 }],
    [{ side: 'pass', style: 'molly', odds: false }, 60, { winUnits: 40, lossUnits: Infinity, maxRolls: 300 }],
    [{ side: 'dont', style: 'single', odds: true }, 100, { winUnits: 50, lossUnits: 50, maxRolls: 300 }],
  ] as [CrapsSystem, number, CrapsRule][])('%o', (sys, start, rule) => {
    const exact = crapsLeaveOdds(sys, start, rule)!;
    const rand = mulberry32(4242);
    const runs = 20000;
    const ends: Record<string, number> = { win: 0, loss: 0, broke: 0, time: 0 };
    let ahead = 0;
    let net = 0;
    for (let i = 0; i < runs; i++) {
      const [e, fin] = playSession(sys, start, rule, rand);
      ends[e]++;
      if (fin > start) ahead++;
      net += fin - start;
    }
    const near = (sim: number, p: number) => expect(Math.abs(sim / runs - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / runs) + 1e-3);
    near(ends.win, exact.pWin);
    near(ends.loss, exact.pLossLimit);
    near(ends.broke, exact.pBroke);
    near(ends.time, exact.pTime);
    near(ahead, exact.pAhead);
    // Net per session: loose check (heavy tails), within 15% of a bet-scaled tolerance.
    expect(Math.abs(net / runs / 5 - exact.expNetBets)).toBeLessThan(0.6);
  });
});

describe('side bets (D32)', () => {
  it('exact chances: All Small / All Tall 20049/760760, Make Em All 1 in 190.2; edges at 31 / 151 for 1', () => {
    const [small, tall, all] = SIDE_BETS.map(sideBetOdds);
    expect(small.p).toBeCloseTo(20049 / 760760, 15);
    expect(tall.p).toBeCloseTo(20049 / 760760, 15);
    expect(all.p).toBeCloseTo(126538525259 / 24067258815600, 15);
    expect(small.edge).toBeCloseTo(1 - (31 * 20049) / 760760, 14); // 18.30%
    expect(all.edge).toBeCloseTo(0.206087, 6); // 20.61%
    // Published sizes: 34 to 1 is 7.76%, 175 to 1 is 7.46%.
    expect(1 - 35 * small.p).toBeCloseTo(0.07761, 5);
    expect(1 - 176 * all.p).toBeCloseTo(0.07464, 5);
  });

  it('allBeforeSeven matches a direct dice simulation (sampled check only)', () => {
    const rand = mulberry32(77);
    const runs = 200_000;
    let small = 0;
    for (let i = 0; i < runs; i++) {
      let hit = 0;
      for (;;) {
        const t = 2 + Math.floor(rand() * 6) + Math.floor(rand() * 6);
        if (t === 7) break;
        hit |= 1 << t;
        if ((hit & 0b1111100) === 0b1111100) {
          small++;
          break;
        }
      }
    }
    const p = allBeforeSeven([2, 3, 4, 5, 6]);
    expect(Math.abs(small / runs - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / runs));
  });
});
