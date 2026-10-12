import { mulberry32, type EngineClient } from '../engine/index.ts';
import { MACHINE_RULES, TABLE_RULES, bankrollTiers, blackjackOdds, type BlackjackRules } from '../engine/blackjack.ts';
import { classFor, crapsLeaveOdds, crapsModel, crapsPerRoll, SIDE_BETS, SIDE_ROUNDS_PER_ROLL, sideBetOdds, UNITS_PER_BET as CRAPS_UNITS, type CrapsRule, type CrapsSide, type CrapsStyle, type CrapsSystem } from '../engine/craps.ts';
import type { Outcome } from '../engine/goals.ts';
import { leaveOddsTiered, type LeaveOdds, type StepTier, type TieredRule } from '../engine/leave.ts';
import { ADVICE_RULES, aliasSampler, pathRecorder, type EndReason, type LeaveAdviceRow, type SessionRun } from './simulate.ts';

/**
 * Blackjack and craps for the Simulator tab (D29, D31). Same idea as the video poker simulator.
 * Blackjack: each hand's net is drawn from the exact per-hand distribution (infinite-deck basic strategy,
 * src/engine/blackjack.ts) and the exact column comes from `leaveOddsTiered`. Craps: played roll by roll
 * on the exact table-state chain of src/engine/craps.ts (pass or don't, one bet or a 3-point molly, odds at
 * the owner's limits), with `crapsLeaveOdds` as the exact column. Flat betting the chosen bet. When the
 * bankroll can't cover a full round, the round is played with less (blackjack: no split / no double;
 * craps: no odds, no new come bets), so you never bet money you don't have. No comps: table and machine
 * ratings aren't modeled.
 */

export type TableSimId = 'bj-table' | 'bj-machine' | 'craps';

export interface TableSimGame {
  id: TableSimId;
  name: string;
  /** Rules line under the picker. */
  rules: string;
  /** What one round is called (craps is played roll by roll). */
  unit: 'hand' | 'roll';
  minBetCents: number;
  betOptionsCents: number[];
  /** Rounds per hour (rolls for craps): the default and the preset choices (the UI also offers a custom number). */
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
    rules: 'Pass or don\'t pass, one bet or a 3-point molly; odds 1× on 4/10, 2× on 5/6/8/9 (lay odds win the same)',
    unit: 'roll',
    minBetCents: 300,
    betOptionsCents: [300, 500, 1000, 1500, 2500],
    pace: 100,
    paceOptions: [60, 80, 100, 120, 150],
  },
];

export const tableSimGame = (id: TableSimId): TableSimGame => TABLE_SIM_GAMES.find((g) => g.id === id)!;

export interface TableSimParams {
  game: TableSimId;
  /** Craps only: take / lay odds at the owner's limits (when the bankroll covers flat + odds). */
  crapsOdds: boolean;
  /** Craps only: pass / come or don't pass / don't come (default pass). */
  crapsSide?: CrapsSide;
  /** Craps only: one line bet, or a 3-point molly (line + up to two come bets; default single). */
  crapsStyle?: CrapsStyle;
  /**
   * Craps only: side bet stakes in cents per round (D32), placed at the start and after every 7 while
   * betting. Any non-zero stake makes the session odds simulated only (exact returns null).
   */
  sideBetsCents?: Partial<Record<SideBetId, number>>;
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

/** Blackjack's per-hand distributions by bankroll tier, in units. */
export function tableModel(game: Exclude<TableSimId, 'craps'>): TableModel {
  const raw = blackjackTiers(game === 'bj-table' ? TABLE_RULES : MACHINE_RULES);
  const k = unitsFor(raw.flatMap((t) => t.outcomes.map((o) => o.net)));
  const tiers: StepTier[] = raw.map((t) => ({
    coverUnits: t.coverBets * k,
    steps: t.outcomes.filter((o) => o.p > 0).map((o) => [Math.round(o.net * k), o.p] as const),
  }));
  const ev = raw[0].outcomes.reduce((a, o) => a + o.net * o.p, 0);
  // Doubles and splits are already in the per-hand nets, so the edge is quoted per initial bet, as casinos do.
  return { unitsPerBet: k, tiers, ev, avgWagerBets: 1 };
}

export type SideBetId = 'small' | 'tall' | 'all';

const hasSideBets = (p: Pick<TableSimParams, 'game' | 'sideBetsCents'>): boolean =>
  p.game === 'craps' && Object.values(p.sideBetsCents ?? {}).some((c) => (c ?? 0) > 0);

const crapsSystem = (p: Pick<TableSimParams, 'crapsOdds' | 'crapsSide' | 'crapsStyle'>): CrapsSystem => ({
  side: p.crapsSide ?? 'pass',
  style: p.crapsStyle ?? 'single',
  odds: p.crapsOdds,
});

export interface TableRun {
  end: EndReason;
  rounds: number;
  finalCents: number;
  netCents: number;
  /** Bankroll path for the graph (same shape as the video poker one; `hand` = round). */
  path: SessionRun['path'];
}

/**
 * Craps roll by roll on the exact chain: bet by the policy for the rack, roll the dice, stop betting at the
 * goal / loss limit (rack + everything on the table) or time, then let the bets out play to the end.
 * Side bets (D32) ride along: placed at the start and after each 7 while betting (when the rack covers
 * them), paid as soon as their numbers are all in, lost on a 7. `rounds` counts every roll.
 */
function simulateCraps(p: TableSimParams, rand: () => number, keepPath: boolean): TableRun {
  const m = crapsModel(crapsSystem(p));
  // Money in cents here (side bets are whole cents, not fifths of the line bet).
  const unitCents = p.betCents / CRAPS_UNITS;
  const flatCents = p.betCents;
  const sides = SIDE_BETS.map((b) => ({
    stake: p.sideBetsCents?.[b.id] ?? 0,
    paysFor: b.paysFor,
    need: b.numbers.reduce((acc, t) => acc | (1 << t), 0),
    active: false,
    hit: 0,
  })).filter((x) => x.stake > 0);
  const winLine = p.winGoalCents === null ? Infinity : p.budgetCents + p.winGoalCents;
  const lossAt = p.lossLimitCents === null ? -Infinity : p.budgetCents - p.lossLimitCents;
  const lossLine = lossAt < flatCents ? -Infinity : lossAt; // same convention as crapsLeaveOdds
  const rec = keepPath ? pathRecorder(p.maxRounds, p.budgetCents) : null;
  let rack = p.budgetCents;
  let s = m.start;
  let rolls = 0;
  const sideOut = () => sides.reduce((a, x) => a + (x.active ? x.stake : 0), 0);
  const placeSides = () => {
    for (const x of sides)
      if (!x.active && rack >= x.stake) {
        rack -= x.stake;
        x.active = true;
        x.hit = 0;
      }
  };
  const roll = (betting: boolean) => {
    // Main bets: policy class from the rack in units (floor: change smaller than a unit can't be bet).
    const cls = betting ? classFor(m, Math.floor(rack / unitCents)) : 0;
    let u = rand() * 36;
    let t = 2;
    while (u >= 6 - Math.abs(7 - t)) u -= 6 - Math.abs(7 - t++);
    const st = m.byRoll[cls][s][t - 2];
    rack += st.d * unitCents;
    s = st.to;
    rolls++;
    for (const x of sides) {
      if (!x.active) continue;
      if (t === 7) x.active = false;
      else {
        x.hit |= 1 << t;
        if ((x.hit & x.need) === x.need) {
          rack += x.stake * x.paysFor;
          x.active = false;
        }
      }
    }
    if (t === 7 && betting) placeSides();
  };
  let end: EndReason | null = rack < flatCents ? 'broke' : null;
  if (end === null) placeSides();
  while (end === null && rolls < p.maxRounds) {
    roll(true);
    const total = rack + m.face[s] * unitCents + sideOut();
    rec?.add(rolls, total);
    if (total >= winLine) end = 'win';
    else if (total <= lossLine) end = 'loss-limit';
    else if (m.empty[s] && sideOut() === 0 && rack < flatCents) end = 'broke';
  }
  end ??= 'time';
  // Wind-down: no new bets; what's out plays to the end.
  while (!m.empty[s] || sideOut() > 0) {
    roll(false);
    rec?.add(rolls, rack + m.face[s] * unitCents + sideOut());
  }
  const finalCents = Math.round(rack);
  return { end, rounds: rolls, finalCents, netCents: finalCents - p.budgetCents, path: rec ? rec.finish(rolls, finalCents) : [] };
}

function simulateTable(p: TableSimParams, rand: () => number, keepPath: boolean): TableRun {
  if (p.game === 'craps') return simulateCraps(p, rand, keepPath);
  const m = tableModel(p.game);
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

function crapsInputs(p: TableSimParams): { system: CrapsSystem; start: number; rule: CrapsRule } {
  const unitCents = p.betCents / CRAPS_UNITS;
  return {
    system: crapsSystem(p),
    start: Math.floor(p.budgetCents / unitCents),
    rule: {
      winUnits: p.winGoalCents === null ? Infinity : Math.ceil(p.winGoalCents / unitCents),
      lossUnits: p.lossLimitCents === null ? Infinity : Math.ceil(p.lossLimitCents / unitCents),
      maxRolls: p.maxRounds,
    },
  };
}

function exactInputs(p: TableSimParams & { game: Exclude<TableSimId, 'craps'> }): { m: TableModel; start: number; rule: TieredRule } {
  const m = tableModel(p.game);
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
  if (hasSideBets(p)) return null; // simulated only (D32)
  if (p.game === 'craps') {
    const { system, start, rule } = crapsInputs(p);
    return crapsLeaveOdds(system, start, rule);
  }
  const { m, start, rule } = exactInputs({ ...p, game: p.game });
  return leaveOddsTiered(m.tiers, start, m.unitsPerBet, rule);
}

/** `exactTable` in the engine worker (craps molly sessions can take a few seconds). */
export async function exactTableAsync(engine: EngineClient, p: TableSimParams): Promise<LeaveOdds | null> {
  if (hasSideBets(p)) return null; // simulated only (D32)
  if (p.game === 'craps') {
    const { system, start, rule } = crapsInputs(p);
    const [o] = await engine.craps(system, start, [rule]);
    return o;
  }
  const { m, start, rule } = exactInputs({ ...p, game: p.game });
  const [o] = await engine.leaveTiered(m.tiers, start, m.unitsPerBet, [rule]);
  return o;
}

/** The six "when to leave" rules (same as video poker), exact, in the engine worker. */
export async function tableLeaveAdviceAsync(
  engine: EngineClient,
  base: Omit<TableSimParams, 'winGoalCents' | 'lossLimitCents'>,
): Promise<LeaveAdviceRow[]> {
  const rules = ADVICE_RULES(base.budgetCents);
  if (hasSideBets(base)) return rules.map((r) => ({ ...r, odds: null })); // simulated only (D32)
  if (base.game === 'craps') {
    const ci = rules.map((r) => crapsInputs({ ...base, ...r }));
    const odds = await engine.craps(ci[0].system, ci[0].start, ci.map((x) => x.rule));
    return rules.map((r, i) => ({ ...r, odds: odds[i] }));
  }
  const inputs = rules.map((r) => exactInputs({ ...base, ...r, game: base.game as Exclude<TableSimId, 'craps'> }));
  const odds = await engine.leaveTiered(inputs[0].m.tiers, inputs[0].start, inputs[0].m.unitsPerBet, inputs.map((x) => x.rule));
  return rules.map((r, i) => ({ ...r, odds: odds[i] }));
}

/** Synchronous `tableLeaveAdviceAsync` (tests). */
export function tableLeaveAdvice(base: Omit<TableSimParams, 'winGoalCents' | 'lossLimitCents'>): LeaveAdviceRow[] {
  if (hasSideBets(base)) return ADVICE_RULES(base.budgetCents).map((r) => ({ ...r, odds: null }));
  return ADVICE_RULES(base.budgetCents).map((r) => ({ ...r, odds: exactTable({ ...base, ...r }) }));
}

export interface TableEdge {
  /** House edge per flat bet (blackjack: per initial bet; craps: per line / come bet). */
  perBet: number;
  /** Per dollar actually put out (craps counts the odds money, which has no edge). */
  perWagered: number;
  /** Average loss per round (hand, or roll for craps) in base bets: the hourly cost is pace × bet × this. */
  perRound: number;
}

/** House edge at the full policy (bankroll never short). */
export function tableEdge(p: Pick<TableSimParams, 'game' | 'crapsOdds' | 'crapsSide' | 'crapsStyle'>): TableEdge {
  if (p.game === 'craps') {
    const r = crapsPerRoll(crapsSystem(p));
    return { perBet: -r.netPerRoll / r.flatsPerRoll, perWagered: -r.netPerRoll / r.stakedPerRoll, perRound: -r.netPerRoll };
  }
  const m = tableModel(p.game);
  return { perBet: -m.ev, perWagered: -m.ev / m.avgWagerBets, perRound: -m.ev };
}

/** Side bets for display (D32): exact chance, 1-in-N, house edge, pays (for 1). Pays are unconfirmed. */
export const SIDE_BET_TABLE = SIDE_BETS.map((b) => ({ ...b, ...sideBetOdds(b) }));

/**
 * Average side-bet cost per roll in cents for these stakes (exact): one round per 7 rolled, each losing
 * stake × edge on average. Hourly cost = pace × this.
 */
export function sideBetCostPerRollCents(stakes: Partial<Record<SideBetId, number>>): number {
  return SIDE_BET_TABLE.reduce((a, b) => a + (stakes[b.id] ?? 0) * b.edge, 0) * SIDE_ROUNDS_PER_ROLL;
}
