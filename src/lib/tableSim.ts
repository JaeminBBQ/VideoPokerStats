import { mulberry32, type EngineClient } from '../engine/index.ts';
import { MACHINE_RULES, TABLE_RULES, bankrollTiers, blackjackOdds, type BlackjackRules } from '../engine/blackjack.ts';
import { PASS_2X_ODDS, PASS_LINE, type Outcome } from '../engine/goals.ts';
import { leaveOddsTiered, type LeaveOdds, type StepTier, type TieredRule } from '../engine/leave.ts';
import { ADVICE_RULES, aliasSampler, pathRecorder, type EndReason, type LeaveAdviceRow, type SessionRun } from './simulate.ts';

/**
 * Blackjack and craps for the Simulator tab (D29). Same idea as the video poker simulator: each round's
 * net is drawn from the exact per-round distribution (blackjack: infinite-deck basic strategy from
 * src/engine/blackjack.ts; craps: exact from the dice), and the exact column comes from `leaveOddsTiered`.
 * Flat betting the chosen bet. When the bankroll can't cover a full round, the round is played with less
 * (blackjack: no split / no double; craps: no odds), so you never bet money you don't have. No comps: table
 * and machine ratings aren't modeled.
 */

export type TableSimId = 'bj-table' | 'bj-machine' | 'craps';

export interface TableSimGame {
  id: TableSimId;
  name: string;
  /** Rules line under the picker. */
  rules: string;
  /** What one round is called. */
  unit: 'hand' | 'bet';
  minBetCents: number;
  betOptionsCents: number[];
  /** Rounds per hour: the default and the preset choices (the UI also offers a custom number). */
  pace: number;
  paceOptions: number[];
}

export const TABLE_SIM_GAMES: TableSimGame[] = [
  {
    id: 'bj-table',
    name: 'Blackjack — $15 table',
    rules: '3:2, dealer hits soft 17, double any two, double after split, split to 4 hands (aces once), no surrender',
    unit: 'hand',
    minBetCents: 1500,
    betOptionsCents: [1500, 2500, 5000, 10000],
    pace: 60,
    paceOptions: [40, 60, 80, 100],
  },
  {
    id: 'bj-machine',
    name: 'Blackjack — $3 machine',
    rules: '6:5, dealer hits soft 17, otherwise the same as the table (owner: "same as the table", unconfirmed)',
    unit: 'hand',
    minBetCents: 300,
    betOptionsCents: [300, 500, 1000, 1500, 2500],
    pace: 150,
    paceOptions: [100, 150, 200, 250],
  },
  {
    id: 'craps',
    name: 'Craps — $3 bubble',
    rules: 'Pass line, optional 2× odds behind every point (odds pay true odds: 2:1, 3:2, 6:5)',
    unit: 'bet',
    minBetCents: 300,
    betOptionsCents: [300, 500, 1000, 1500, 2500],
    pace: 30,
    paceOptions: [20, 30, 40, 60],
  },
];

export const tableSimGame = (id: TableSimId): TableSimGame => TABLE_SIM_GAMES.find((g) => g.id === id)!;

export interface TableSimParams {
  game: TableSimId;
  /** Craps only: take 2× odds behind every point (when the bankroll covers line + odds). */
  crapsOdds: boolean;
  betCents: number;
  budgetCents: number;
  winGoalCents: number | null;
  lossLimitCents: number | null;
  maxRounds: number;
}

export interface TableModel {
  /** Units per base bet: every net in every tier is a whole number of units. */
  unitsPerBet: number;
  tiers: StepTier[];
  /** Expected net per round in base bets at the full policy, and average total wagered per round in base bets. */
  ev: number;
  avgWagerBets: number;
}

/** Smallest of 1, 2, 5, 10 units per bet that makes every net whole (3:2 → 2, 6:5 and craps odds → 5). */
function unitsFor(nets: number[]): number {
  for (const k of [1, 2, 5, 10]) if (nets.every((x) => Math.abs(x * k - Math.round(x * k)) < 1e-9)) return k;
  throw new Error(`nets ${nets.join(',')} are not tenths of a bet`);
}

const blackjackCache = new Map<BlackjackRules, { coverBets: number; outcomes: Outcome[] }[]>();
function blackjackTiers(rules: BlackjackRules): { coverBets: number; outcomes: Outcome[] }[] {
  let t = blackjackCache.get(rules);
  if (!t) {
    t = bankrollTiers(rules).map((x) => ({ coverBets: x.coverBets, outcomes: blackjackOdds(x.rules).outcomes }));
    blackjackCache.set(rules, t);
  }
  return t;
}

/** Per-round distributions by bankroll tier, in units. */
export function tableModel(game: TableSimId, crapsOdds: boolean): TableModel {
  const raw =
    game === 'craps'
      ? crapsOdds
        ? [
            { coverBets: 3, outcomes: PASS_2X_ODDS },
            { coverBets: 1, outcomes: PASS_LINE },
          ]
        : [{ coverBets: 1, outcomes: PASS_LINE }]
      : blackjackTiers(game === 'bj-table' ? TABLE_RULES : MACHINE_RULES);
  const k = unitsFor(raw.flatMap((t) => t.outcomes.map((o) => o.net)));
  const tiers: StepTier[] = raw.map((t) => ({
    coverUnits: t.coverBets * k,
    steps: t.outcomes.filter((o) => o.p > 0).map((o) => [Math.round(o.net * k), o.p] as const),
  }));
  const ev = raw[0].outcomes.reduce((a, o) => a + o.net * o.p, 0);
  // Craps odds ride on the 24/36 of decisions that set a point; blackjack's extra money (doubles,
  // splits) is already in the per-round nets, so its edge is quoted per initial bet, as casinos do.
  const avgWagerBets = game === 'craps' && crapsOdds ? 1 + 2 * (24 / 36) : 1;
  return { unitsPerBet: k, tiers, ev, avgWagerBets };
}

export interface TableRun {
  end: EndReason;
  rounds: number;
  finalCents: number;
  netCents: number;
  /** Bankroll path for the graph (same shape as the video poker one; `hand` = round). */
  path: SessionRun['path'];
}

function simulateTable(p: TableSimParams, rand: () => number, keepPath: boolean): TableRun {
  const m = tableModel(p.game, p.crapsOdds);
  const unitCents = p.betCents / m.unitsPerBet;
  const samplers = m.tiers.map((t) => aliasSampler(t.steps.map(([, q]) => q), rand));
  // Bankroll in units; change smaller than a unit just rides along.
  const start = Math.floor(p.budgetCents / unitCents);
  const spare = p.budgetCents - start * unitCents;
  const winLine = p.winGoalCents === null ? Infinity : start + Math.ceil(p.winGoalCents / unitCents);
  const minCover = m.tiers[m.tiers.length - 1].coverUnits;
  const lossAt = p.lossLimitCents === null ? -Infinity : start - Math.ceil(p.lossLimitCents / unitCents);
  const lossLine = lossAt < minCover ? -Infinity : lossAt; // same convention as leaveOddsTiered
  const rec = keepPath ? pathRecorder(p.maxRounds, p.budgetCents) : null;
  let bank = start;
  let rounds = 0;
  let end: EndReason = bank < minCover ? 'broke' : 'time';
  while (end === 'time' && rounds < p.maxRounds) {
    const t = m.tiers.findIndex((x) => bank >= x.coverUnits);
    bank += m.tiers[t].steps[samplers[t]()][0];
    rounds++;
    rec?.add(rounds, bank * unitCents + spare);
    if (bank >= winLine) end = 'win';
    else if (bank <= lossLine) end = 'loss-limit';
    else if (bank < minCover) end = 'broke';
  }
  const finalCents = Math.round(bank * unitCents + spare);
  return {
    end,
    rounds,
    finalCents,
    netCents: finalCents - p.budgetCents,
    path: rec ? rec.finish(rounds, finalCents) : [],
  };
}

/** One session. Deterministic for a given `seed`. */
export const runTableSession = (p: TableSimParams, seed: number): TableRun => simulateTable(p, mulberry32(seed), true);

export interface TableManyRuns {
  runs: number;
  ends: Record<EndReason, number>;
  pAhead: number;
  avgNetCents: number;
  avgRounds: number;
  /** Net results, sorted ascending. */
  nets: number[];
  medianNetCents: number;
}

export function runTableMany(p: TableSimParams, runs: number, seed: number): TableManyRuns {
  const rand = mulberry32(seed);
  const ends: Record<EndReason, number> = { win: 0, 'loss-limit': 0, broke: 0, time: 0 };
  const nets: number[] = [];
  let rounds = 0;
  let ahead = 0;
  for (let r = 0; r < runs; r++) {
    const s = simulateTable(p, rand, false);
    ends[s.end]++;
    nets.push(s.netCents);
    rounds += s.rounds;
    if (s.netCents > 0) ahead++;
  }
  nets.sort((a, b) => a - b);
  for (const k of Object.keys(ends) as EndReason[]) ends[k] /= runs;
  return {
    runs,
    ends,
    pAhead: ahead / runs,
    avgNetCents: nets.reduce((a, b) => a + b, 0) / runs,
    avgRounds: rounds / runs,
    nets,
    medianNetCents: nets[Math.floor(runs / 2)],
  };
}

function exactInputs(p: TableSimParams): { m: TableModel; start: number; rule: TieredRule } {
  const m = tableModel(p.game, p.crapsOdds);
  const unitCents = p.betCents / m.unitsPerBet;
  return {
    m,
    start: Math.floor(p.budgetCents / unitCents),
    rule: {
      winUnits: p.winGoalCents === null ? Infinity : Math.ceil(p.winGoalCents / unitCents),
      lossUnits: p.lossLimitCents === null ? Infinity : Math.ceil(p.lossLimitCents / unitCents),
      maxRounds: p.maxRounds,
    },
  };
}

/** Exact odds for the same parameters, on this thread (tests, scripts). Null when too large. */
export function exactTable(p: TableSimParams): LeaveOdds | null {
  const { m, start, rule } = exactInputs(p);
  return leaveOddsTiered(m.tiers, start, m.unitsPerBet, rule);
}

/** `exactTable` in the engine worker. */
export async function exactTableAsync(engine: EngineClient, p: TableSimParams): Promise<LeaveOdds | null> {
  const { m, start, rule } = exactInputs(p);
  const [o] = await engine.leaveTiered(m.tiers, start, m.unitsPerBet, [rule]);
  return o;
}

/** The six "when to leave" rules (same as video poker), exact, in the engine worker. */
export async function tableLeaveAdviceAsync(
  engine: EngineClient,
  base: Omit<TableSimParams, 'winGoalCents' | 'lossLimitCents'>,
): Promise<LeaveAdviceRow[]> {
  const rules = ADVICE_RULES(base.budgetCents);
  const inputs = rules.map((r) => exactInputs({ ...base, ...r }));
  const odds = await engine.leaveTiered(inputs[0].m.tiers, inputs[0].start, inputs[0].m.unitsPerBet, inputs.map((x) => x.rule));
  return rules.map((r, i) => ({ ...r, odds: odds[i] }));
}

/** Synchronous `tableLeaveAdviceAsync` (tests). */
export function tableLeaveAdvice(base: Omit<TableSimParams, 'winGoalCents' | 'lossLimitCents'>): LeaveAdviceRow[] {
  return ADVICE_RULES(base.budgetCents).map((r) => ({ ...r, odds: exactTable({ ...base, ...r }) }));
}

/** House edge per round (per initial bet) and per dollar wagered, at the full policy. */
export function tableEdge(game: TableSimId, crapsOdds: boolean): { perBet: number; perWagered: number } {
  const m = tableModel(game, crapsOdds);
  return { perBet: -m.ev, perWagered: -m.ev / m.avgWagerBets };
}
