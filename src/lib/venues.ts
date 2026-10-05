import { gamesAt, type GameId, type Venue } from '../engine/index.ts';

/** The game a venue tab selects: the current game if it's at that venue, else the venue's best game. */
export function pickGameForVenue(venue: Venue, currentGameId: GameId): GameId {
  const games = gamesAt(venue);
  return games.some((g) => g.id === currentGameId) ? currentGameId : games[0].id;
}
