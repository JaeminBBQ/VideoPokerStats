import { TABLE_GAMES, edgeOf, goalProbability, goalProbabilityTiered, type Outcome } from '../engine/goals.ts';

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
  /** What one round is called: "hand", "bet" (craps), "spin" (roulette). */
  unit: string;
  name: string;
  rules: string;
  /** House edge per dollar wagered, as a fraction (0.0028 = 0.28%); craps with odds counts the odds money. */
  edge: number;
  /** This game's bet per round: the machine's max bet for video poker; a table game's minimum (D25). */
  betCents: number;
  /** Table minimum (0 for video poker). */
  minBetCents: number;
  /** Budget in this game's bets (fractional for tables: spare change below a bet can't be bet). */
  budgetBets: number;
  /** False when the budget can't cover one bet here; its odds are 0. */
  playable: boolean;
}

export interface GoalRow {
  label: string;
  /** Profit needed, in dollars, and in whole video poker bets (rounded up: the goal is "at least"). Table
   * games round up to their own smallest reachable result (half a bet for blackjack). */
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
 * The comparison table: this video poker game at perfect play (first column) against flat betting at
 * blackjack, craps, and roulette. Each table always bets its minimum (D25, amends D20), so a $1 video poker
 * hand faces a $15 blackjack hand and a $3 craps bet. `budgetBets`/`ok: false` refer to the video poker
 * bet. Integer cents throughout.
 */
export function goalTable(vpName: string, vpPerHand: Outcome[], budgetCents: number, betCents: number): GoalTable {
  const budgetBets = Math.floor(budgetCents / betCents);
  if (budgetBets < 1) return { ok: false, reason: 'below-one-bet', budgetBets };
  if (budgetBets > MAX_BUDGET_BETS) return { ok: false, reason: 'too-many-bets', budgetBets };
  const games = [
    { id: 'video-poker', short: 'Video poker', unit: 'hand', name: vpName, rules: 'Perfect play, max bet', outcomes: vpPerHand, minBetCents: 0 },
    ...TABLE_GAMES,
  ];
  const columns: GoalColumn[] = games.map((g) => {
    // Tables always bet their minimum: what the owner would actually do (D25, amends D20).
    const bet = g.id === 'video-poker' ? betCents : g.minBetCents;
    const { id, short, unit, name, rules, outcomes, minBetCents } = g;
    const avgWager = 'avgWagerBets' in g && g.avgWagerBets ? g.avgWagerBets : 1;
    return { id, short, unit, name, rules, edge: -edgeOf(outcomes) / avgWager, betCents: bet, minBetCents, budgetBets: budgetCents / bet, playable: budgetCents >= bet };
  });
  const rows = GOALS.map(({ label, dollars, multiple }) => {
    const goalCents = dollars !== undefined ? dollars * 100 : budgetCents * (multiple ?? 1);
    const goalBets = Math.ceil(goalCents / betCents);
    // Video poker plays whole bets (pays are whole coins); tables may reach half-bet results, so they get
    // the fractional bet counts and goalProbability rounds within their own units.
    const odds = games.map((g, i) =>
      i === 0
        ? goalProbability(g.outcomes, budgetBets, goalBets)
        : 'tiers' in g && g.tiers
          ? goalProbabilityTiered(g.tiers, columns[i].budgetBets, goalCents / columns[i].betCents)
          : goalProbability(g.outcomes, columns[i].budgetBets, goalCents / columns[i].betCents),
    );
    const best = odds.reduce((bi, p, i) => (p > odds[bi] ? i : bi), 0);
    return { label, goalCents, goalBets, odds, best };
  });
  return { ok: true, budgetBets, columns, rows };
}
