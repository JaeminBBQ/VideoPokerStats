import { payout, type Card, type GameDef } from '../engine/index.ts';

/** Coins per hand: the trainer always plays max bet. */
export const MAX_COINS = 5;

/** Tier credit rate: 1 point per $2 of coin-in (owner's casino rule, D13). */
export const CENTS_PER_POINT = 200;

/**
 * A bankroll session. All money is integer cents so long sessions never drift.
 * Coin-in is what was wagered (bet × hands), which is what the casino's tier points count.
 */
export interface Session {
  startedAt: number;
  startCents: number;
  balanceCents: number;
  hands: number;
  coinInCents: number;
  wonCents: number;
  /** Coin-in weighted by each game's perfect-play return; expected loss = coinIn − this. */
  theoReturnCents: number;
}

export interface HandOutcome {
  betCents: number;
  winCents: number;
  /** Index into `game.rows` of the final hand, or -1 for no pay. */
  rowIndex: number;
}

/** Dollars per coin (0.05) → cents per coin (5). */
export const denomCents = (denomination: number): number => Math.round(denomination * 100);

export const betCents = (denomination: number): number => MAX_COINS * denomCents(denomination);

export function startSession(startCents: number, now: number): Session {
  if (!Number.isInteger(startCents) || startCents <= 0) throw new Error(`startSession: bad bankroll ${startCents}`);
  return { startedAt: now, startCents, balanceCents: startCents, hands: 0, coinInCents: 0, wonCents: 0, theoReturnCents: 0 };
}

export const canAfford = (s: Session, denomination: number): boolean => s.balanceCents >= betCents(denomination);

/** What a final hand pays at max bet and this denomination. */
export function settleHand(game: GameDef, finalHand: readonly Card[], denomination: number): HandOutcome {
  const rowIndex = game.evaluate(finalHand);
  const bet = betCents(denomination);
  return { betCents: bet, winCents: payout(game, finalHand) * bet, rowIndex };
}

/** Pure update: the bet comes off, the win goes on. Throws if the bet isn't affordable. */
export function applyHand(s: Session, game: GameDef, outcome: HandOutcome): Session {
  if (s.balanceCents < outcome.betCents) throw new Error('applyHand: bet exceeds balance');
  return {
    ...s,
    balanceCents: s.balanceCents - outcome.betCents + outcome.winCents,
    hands: s.hands + 1,
    coinInCents: s.coinInCents + outcome.betCents,
    wonCents: s.wonCents + outcome.winCents,
    theoReturnCents: s.theoReturnCents + outcome.betCents * game.publishedReturn,
  };
}

/** Whole tier points earned for `coinInCents` (partial dollars don't count yet). */
export const tierPoints = (coinInCents: number): number => Math.floor(coinInCents / CENTS_PER_POINT);

/** Cents of coin-in still needed for the next point. */
export const centsToNextPoint = (coinInCents: number): number => CENTS_PER_POINT - (coinInCents % CENTS_PER_POINT);

export const netCents = (s: Session): number => s.balanceCents - s.startCents;

/** Expected loss for the coin-in so far under perfect play, in cents (fractional). */
export const theoLossCents = (s: Session): number => s.coinInCents - s.theoReturnCents;

export const formatCents = (cents: number): string =>
  (cents < 0 ? '-$' : '$') + (Math.abs(cents) / 100).toFixed(2);
