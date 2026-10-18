import { VENUES, gamesAt, type GameId } from '../../../src/engine/games.ts';
import type { AppState, Store } from '../app/store.ts';

const STATUS_LABEL = { loading: 'loading…', ready: 'ready' } as const;

export function GamePicker({ store, state }: { store: Store; state: AppState }) {
  const { engineStatus, engineError, gameId } = state;
  return (
    <header className="picker">
      <label className="picker-label">
        <span className="sr-only">Game</span>
        <select value={gameId} onChange={(e) => store.selectGame(e.target.value as GameId)} aria-label="Game">
          {VENUES.map((venue) => (
            <optgroup key={venue} label={venue}>
              {gamesAt(venue).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {engineStatus === 'error' ? (
        <button type="button" className="status status-error" title={engineError ?? undefined} onClick={() => store.selectGame(gameId)}>
          <span className="dot" aria-hidden="true" />
          error · retry
        </button>
      ) : (
        <span className={`status status-${engineStatus}`} role="status">
          <span className="dot" aria-hidden="true" />
          {STATUS_LABEL[engineStatus]}
        </span>
      )}
    </header>
  );
}
