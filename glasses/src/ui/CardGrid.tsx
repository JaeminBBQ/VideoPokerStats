import { GAMES } from '../../../src/engine/games.ts';
import type { AppState, Store } from '../app/store.ts';
import { GRID_RANKS, GRID_SUITS, JOKER, PHONE_SUITS, isRedSuit, phoneRank } from '../core/cards.ts';
import { usedCards } from '../core/entry.ts';

/**
 * One row per suit (♠ ♥ ♦ ♣), ranks A → 2 across, like a sorted deck. Buttons are narrow at phone width
 * (~23px at 360px), so rows are tall to keep each target large; the suit is shown once per row.
 */
export function CardGrid({ store, state }: { store: Store; state: AppState }) {
  const used = usedCards(state.entry);
  const joker = GAMES[state.gameId].deckSize === 53;
  const empty = state.entry.order.length === 0;
  return (
    <div className="grid" aria-label="Cards">
      {GRID_SUITS.map((s) => (
        <div key={s} className={`suit-row ${isRedSuit(s) ? 'red' : 'black'}`}>
          <span className="suit-label" aria-hidden="true">
            {PHONE_SUITS[s]}
          </span>
          {GRID_RANKS.map((r) => {
            const card = r * 4 + s;
            return (
              <button
                key={card}
                type="button"
                className="gcard"
                disabled={used.has(card)}
                onClick={() => store.tapCard(card)}
                aria-label={phoneRank(r) + PHONE_SUITS[s]}
              >
                {phoneRank(r)}
              </button>
            );
          })}
        </div>
      ))}
      <div className="actions">
        <button type="button" className="act" onClick={() => store.undo()} disabled={empty}>
          Undo
        </button>
        {joker && (
          <button type="button" className="act joker-btn" disabled={used.has(JOKER)} onClick={() => store.tapCard(JOKER)}>
            Joker
          </button>
        )}
        <button type="button" className="act" onClick={() => store.clear()} disabled={empty}>
          Clear
        </button>
      </div>
    </div>
  );
}
