/**
 * Exact bankroll requirements (risk of ruin) from per-hand outcome distributions.
 *
 *   node scripts/bankroll-risk.ts [in.json] [outDir]
 *
 * Reads docs/bankroll/outcome-dist.json (exact per-hand final-outcome probabilities under perfect
 * play and under "next-best hold" mistakes) and writes docs/bankroll/risk.json and RISK.md.
 * All numbers come from the backward DP in src/lib/risk.ts; nothing is simulated.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bankrollNeeded, collapseOutcomes, mixDistribution, moments, survivalTables } from '../src/lib/risk.ts';

interface Row {
  key: string;
  label: string;
  pays: number;
}
interface GameDist {
  gameId: string;
  name: string;
  publishedReturn: number;
  rows: Row[];
  best: number[];
  second: number[];
  returnBest: number;
  returnSecond: number;
  mistakeCostPerHand: number;
}

const inPath = process.argv[2] ?? 'docs/bankroll/outcome-dist.json';
const outDir = process.argv[3] ?? 'docs/bankroll';

const ERROR_RATES = [0, 0.005, 0.01, 0.02];
const HORIZONS = [500, 2000, 10000];
const HORIZON_LABEL: Record<number, string> = { 500: '~1 hour', 2000: '~4-hour session', 10000: 'long trip' };
const TARGETS = [0.9, 0.95, 0.99];
const DENOMS_CENTS = [1, 5, 10, 25, 50, 100, 200, 500];
const COINS_PER_BET = 5;
const MARGIN = 1000; // cap = maxBankroll + max pay + MARGIN
const CHECK_MARGIN_EXTRA = 3000; // verification rerun uses a cap this much higher

const dist = JSON.parse(readFileSync(inPath, 'utf8')) as { games: GameDist[] };

const t0 = performance.now();
const denomLabel = (c: number) => (c < 100 ? `${c}¢` : `$${c / 100}`);
const dollars = (bets: number, cents: number) => (bets * COINS_PER_BET * cents) / 100;
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmtInt = (x: number) => Math.round(x).toLocaleString('en-US');
const fmtUsd = (x: number) => `$${fmtInt(x)}`;

const gamesOut = [];
for (const g of dist.games) {
  const pays = g.rows.map((r) => r.pays);
  const maxPay = Math.max(...pays);
  const perError = [];
  let worstCapDiff = 0;
  let capChangedAnswer = false;
  for (const e of ERROR_RATES) {
    const probs = mixDistribution(g.best, g.second, e);
    const c = collapseOutcomes(pays, probs);
    const { ret, sd } = moments(c.pays, c.probs);
    // Size the table for the longest horizon and grow until every target is reached.
    const nMax = Math.max(...HORIZONS);
    let maxB = Math.ceil(nMax * Math.max(0, 1 - ret) + 3.5 * sd * Math.sqrt(nMax)) + 100;
    let tabs: Float64Array[];
    for (;;) {
      tabs = survivalTables(c.pays, c.probs, HORIZONS, maxB, MARGIN);
      if (tabs.every((s) => TARGETS.every((t) => bankrollNeeded(s, t) >= 0))) break;
      maxB *= 2;
    }
    // Truncation check: rerun with a much larger cap and compare.
    const loose = survivalTables(c.pays, c.probs, HORIZONS, maxB, MARGIN + CHECK_MARGIN_EXTRA);
    const horizons = HORIZONS.map((n, h) => {
      let diff = 0;
      for (let b = 0; b <= maxB; b++) diff = Math.max(diff, Math.abs(tabs[h][b] - loose[h][b]));
      worstCapDiff = Math.max(worstCapDiff, diff);
      const needed: Record<string, number> = {};
      const neededDollars: Record<string, Record<string, number>> = {};
      for (const t of TARGETS) {
        const b = bankrollNeeded(tabs[h], t);
        if (b !== bankrollNeeded(loose[h], t)) capChangedAnswer = true;
        needed[String(t)] = b;
        neededDollars[String(t)] = Object.fromEntries(DENOMS_CENTS.map((cents) => [denomLabel(cents), dollars(b, cents)]));
      }
      return {
        hands: n,
        expectedLossBets: n * (1 - ret),
        sdOfResultBets: sd * Math.sqrt(n),
        bankrollNeededBets: needed,
        bankrollNeededDollars: neededDollars,
        capTruncationMaxAbsDiff: diff,
      };
    });
    if (e === 0 && Math.abs(ret - g.returnBest) > 1e-6) console.warn(`${g.gameId}: distribution return ${ret} != returnBest ${g.returnBest}`);
    perError.push({ errorRate: e, return: ret, sdPerHandBets: sd, tableMaxBankrollBets: maxB, horizons });
  }
  if (capChangedAnswer) throw new Error(`${g.gameId}: cap truncation changed a bankroll answer; raise MARGIN`);
  gamesOut.push({
    gameId: g.gameId,
    name: g.name,
    publishedReturn: g.publishedReturn,
    returnBest: g.returnBest,
    returnSecond: g.returnSecond,
    maxPayBets: maxPay,
    capCheck: { margin: MARGIN, checkMargin: MARGIN + CHECK_MARGIN_EXTRA, maxAbsDiff: worstCapDiff },
    perError,
  });
  console.log(`${g.gameId}: done (${((performance.now() - t0) / 1000).toFixed(1)}s, cap diff ${worstCapDiff.toExponential(2)})`);
}
const secs = (performance.now() - t0) / 1000;

const out = {
  generatedBy: 'node scripts/bankroll-risk.ts',
  source: inPath,
  model: {
    unit: `1 bet = one max-bet hand = ${COINS_PER_BET} coins`,
    ruin: 'before a hand, bankroll < 1 bet (cannot cover a max bet)',
    mistakes: 'each hand independently, with probability errorRate, plays the next-best hold instead of the best',
    method: 'exact backward DP over integer bankrolls (src/lib/risk.ts); no simulation',
    excluded: 'comps, tier points, free play, promotions',
  },
  errorRates: ERROR_RATES,
  horizons: HORIZONS,
  targets: TARGETS,
  denominationsCents: DENOMS_CENTS,
  runtimeSeconds: secs,
  games: gamesOut,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'risk.json'), JSON.stringify(out, null, 2) + '\n');

// ---------- RISK.md ----------
const md: string[] = [
  '# Bankroll and risk of ruin',
  '',
  `Generated by \`node scripts/bankroll-risk.ts\` from \`${inPath}\`. Do not edit by hand. Full numbers (every denomination, target, horizon, and error rate) are in \`risk.json\`.`,
  '',
  '## Model',
  '',
  `- **Unit:** 1 bet = one max-bet hand = ${COINS_PER_BET} coins. Dollars = bets × ${COINS_PER_BET} × denomination.`,
  '- **Ruin** = you cannot cover a max bet. "Survival" = you play every hand of the horizon without that happening. Finishing the last hand with nothing left counts as surviving.',
  '- **Mistakes:** each hand independently, with probability *e*, you play the next-best hold instead of the best one. Real mistakes are not all "next-best", and not uniformly spread across hands, so treat the error columns as a guide.',
  '- **No comps:** tier points, free play, mailers, and promotions are not counted.',
  '- **Paytables** are the photographed 10¢ ones (D10). The dollar tables just scale bets by denomination; a different denomination may have a different paytable on the floor.',
  '- **Exact:** survival is computed by exact dynamic programming over every whole-bet bankroll, not simulation. Bankrolls above an internal cap are clamped, which can only understate survival; rerunning with a cap 3,000 bets higher changes no answer and moves no survival probability by more than the "cap check" figure shown per game.',
  `- Horizons: ${HORIZONS.map((n) => `${fmtInt(n)} hands (${HORIZON_LABEL[n]})`).join(', ')}. At ~500 hands/hour.`,
  '',
];
for (const g of gamesOut) {
  const e0 = g.perError[0];
  md.push(
    `## ${g.name}`,
    '',
    `Perfect play returns **${pct(e0.return, 3)}** (published ${pct(g.publishedReturn, 2)}); always playing the next-best hold returns ${pct(g.returnSecond, 2)}. Per-hand std dev (perfect play): **${e0.sdPerHandBets.toFixed(2)} bets**. Cap check: ${g.capCheck.maxAbsDiff.toExponential(1)}.`,
    '',
    '### Bankroll needed, in bets',
    '',
    `| Horizon | Survive | ${ERROR_RATES.map((e) => `${pct(e, 1)} errors`).join(' | ')} |`,
    `|---|---|${ERROR_RATES.map(() => '--:').join('|')}|`,
  );
  for (let h = 0; h < HORIZONS.length; h++)
    for (const t of TARGETS)
      md.push(
        `| ${fmtInt(HORIZONS[h])} hands | ${pct(t, 0)} | ${g.perError.map((pe) => fmtInt(pe.horizons[h].bankrollNeededBets[String(t)])).join(' | ')} |`,
      );
  md.push(
    '',
    '### Expected loss over the horizon, in bets',
    '',
    `| Horizon | ${ERROR_RATES.map((e) => `${pct(e, 1)} errors`).join(' | ')} |`,
    `|---|${ERROR_RATES.map(() => '--:').join('|')}|`,
  );
  for (let h = 0; h < HORIZONS.length; h++)
    md.push(`| ${fmtInt(HORIZONS[h])} hands | ${g.perError.map((pe) => pe.horizons[h].expectedLossBets.toFixed(1)).join(' | ')} |`);
  md.push(
    '',
    `Return with errors: ${g.perError.map((pe) => `${pct(pe.errorRate, 1)} → ${pct(pe.return, 3)}`).join(', ')}.`,
    '',
    '### Dollars for 95% survival',
    '',
  );
  const cols: { h: number; ei: number }[] = [];
  for (let h = 0; h < HORIZONS.length; h++) for (const e of [0, 0.01]) cols.push({ h, ei: ERROR_RATES.indexOf(e) });
  md.push(
    `| Denom | ${cols.map((c) => `${fmtInt(HORIZONS[c.h])} h, ${pct(ERROR_RATES[c.ei], 0)} err`).join(' | ')} |`,
    `|---|${cols.map(() => '--:').join('|')}|`,
  );
  for (const cents of DENOMS_CENTS)
    md.push(
      `| ${denomLabel(cents)} | ${cols.map((c) => fmtUsd(dollars(g.perError[c.ei].horizons[c.h].bankrollNeededBets['0.95'], cents))).join(' | ')} |`,
    );
  md.push('');
}
writeFileSync(join(outDir, 'RISK.md'), md.join('\n'));
console.log(`wrote ${join(outDir, 'risk.json')} and RISK.md in ${secs.toFixed(1)}s`);
