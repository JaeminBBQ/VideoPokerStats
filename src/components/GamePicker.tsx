import { GAMES, VENUES, gamesAt, type GameId } from '../engine/index.ts';
import { pickGameForVenue } from '../lib/venues.ts';

interface Props {
  gameId: GameId;
  onSelect: (id: GameId) => void;
}

/** Casino tabs with tappable chips for the games at the selected venue. */
export default function GamePicker({ gameId, onSelect }: Props) {
  const venue = GAMES[gameId].venue;
  return (
    <div className="game-picker">
      <div className="venue-tabs" role="group" aria-label="Casino">
        {VENUES.map((v) => (
          <button
            key={v}
            type="button"
            className={`venue-tab${v === venue ? ' active' : ''}`}
            aria-pressed={v === venue}
            onClick={() => {
              if (v !== venue) onSelect(pickGameForVenue(v, gameId));
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="game-chips" role="group" aria-label={`Games at ${venue}`}>
        {gamesAt(venue).map((g) => (
          <button
            key={g.id}
            type="button"
            className={`game-chip${g.id === gameId ? ' active' : ''}`}
            aria-pressed={g.id === gameId}
            onClick={() => {
              if (g.id !== gameId) onSelect(g.id);
            }}
          >
            {g.name.replace(' — ', ' ')}
            <span className="chip-return">· {(g.publishedReturn * 100).toFixed(2)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
