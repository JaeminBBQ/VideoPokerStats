import { TABLE_GAMES, edgeOf, goalProbability, type Outcome } from '../engine/goals.ts';

/** Win goals for "reach a goal before going broke": fixed dollar amounts, then doubling and tripling. */
export const GOALS: { label: string; dollars?: number; multiple?: number }[] = [
  { label: '+$5', dollars: 5 },
  { label: '+$10', dollars: 10 },
  { label: '+$15', dollars: 15 },
  { label: '+$25', dollars: 25 },
  { label: '+$50', dollars: 50 },
  { label: 'Double', multiple: 1 },
  { label: 'Triple', multiple: 2 },
];

/** Above this many bets of budget the table isn't computed (keeps the page instant). */
export const MAX_BUDGET_BETS = 5000;

export interface GoalColumn {
  id: string;
  /** Short header for phone width. */
  short: string;
  name: string;
  rules: string;
  /** House edge as a fraction (0.0028 = 0.28%). */
  edge: number;
}

export interface GoalRow {
  label: string;
  /** Profit needed, in dollars and in whole bets (rounded up: the goal is "at least"). */
  goalCents: number;
  goalBets: number;
  /** P(reach the goal before the budget can't cover a bet), one per column. */
  odds: number[];
  /** Column index of the best odds (ties → first). */
  best: number;
}

export type GoalTable =
  | { ok: true; budgetBets: number; columns: GoalColumn[]; rows: GoalRow[] }
  | { ok: false; reason: 'below-one-bet' | 'too-many-bets'; budgetBets: number };

/**
 * The comparison table: this video poker game at perfect play (first column) against flat betting the
 * same dollar amount per round at blackjack, craps, and roulette. Integer cents throughout.
 */
export function goalTable(vpName: string, vpPerHand: Outcome[], budgetCents: number, betCents: number): GoalTable {
  const budgetBets = Math.floor(budgetCents / betCents);
  if (budgetBets < 1) return { ok: false, reason: 'below-one-bet', budgetBets };
  if (budgetBets > MAX_BUDGET_BETS) return { ok: false, reason: 'too-many-bets', budgetBets };
  const games = [
    { id: 'video-poker', short: 'Video poker', name: vpName, rules: 'Perfect play, max bet', outcomes: vpPerHand },
    ...TABLE_GAMES,
  ];
  const columns = games.map(({ id, short, name, rules, outcomes }) => ({ id, short, name, rules, edge: -edgeOf(outcomes) }));
  const rows = GOALS.map(({ label, dollars, multiple }) => {
    const goalCents = dollars !== undefined ? dollars * 100 : budgetCents * (multiple ?? 1);
    const goalBets = Math.ceil(goalCents / betCents);
    const odds = games.map((g) => goalProbability(g.outcomes, budgetBets, goalBets));
    const best = odds.reduce((bi, p, i) => (p > odds[bi] ? i : bi), 0);
    return { label, goalCents, goalBets, odds, best };
  });
  return { ok: true, budgetBets, columns, rows };
}
