import { JOKER, rankOf, type Card, type GameDef } from '../engine/index.ts';

/** True when the card is wild in this game: deuces in deuces games, the joker in Joker Poker. */
export function isWildCard(game: GameDef, card: Card): boolean {
  if (card === JOKER) return game.deckSize === 53;
  return game.rows.some((r) => r.key === 'four-deuces') && rankOf(card) === 0;
}
