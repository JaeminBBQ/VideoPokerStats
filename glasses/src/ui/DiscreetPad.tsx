import { GAMES } from '../../../src/engine/games.ts';
import type { AppState, Store } from '../app/store.ts';
import { GRID_RANKS, GRID_SUITS, PHONE_SUITS, phoneRank } from '../core/cards.ts';
import { DRAFT_JOKER, canAddRank, canAddSuit, draftPhase } from '../core/discreet.ts';
import { SLOTS } from '../core/entry.ts';

/**
 * Discreet mode: a plain keypad, all one color. Tap the five ranks in dealt order, then their five suits; the phone
 * never shows a card (the lens reads the draft back). The dots count taps in the current phase only.
 */
export function DiscreetPad({ store, state }: { store: Store; state: AppState }) {
  const { draft } = state;
  const jokerDeck = GAMES[state.gameId].deckSize === 53;
  const phase = draftPhase(draft);
  const done = phase === 'ranks' ? draft.cards.length : draft.cards.filter((c) => c.suit !== null || c.rank === DRAFT_JOKER).length;
  const canUndo = draft.cards.length > 0 || state.entry.order.length > 0;
  return (
    <main className="app discreet">
      <div className="dots" aria-label={`${phase} ${done} of ${SLOTS}`}>
        {Array.from({ length: SLOTS }, (_, i) => (
          <span key={i} className={i < done ? 'dot on' : 'dot'} />
        ))}
      </div>
      <div className="dpad-ranks">
        {GRID_RANKS.map((r) => (
          <button key={r} type="button" className="dkey" disabled={!canAddRank(draft, r, jokerDeck)} onClick={() => store.draftRank(r)}>
            {phoneRank(r)}
          </button>
        ))}
        {jokerDeck && (
          <button type="button" className="dkey" disabled={!canAddRank(draft, DRAFT_JOKER, jokerDeck)} onClick={() => store.draftRank(DRAFT_JOKER)}>
            Jk
          </button>
        )}
      </div>
      <div className="dpad-suits">
        {GRID_SUITS.map((s) => (
          <button key={s} type="button" className="dkey" disabled={!canAddSuit(draft, s)} onClick={() => store.draftSuit(s)} aria-label={PHONE_SUITS[s]}>
            {PHONE_SUITS[s]}
          </button>
        ))}
      </div>
      <div className="dpad-actions">
        <button type="button" className="dkey" disabled={!canUndo} onClick={() => store.draftUndo()}>
          Undo
        </button>
      </div>
      <button type="button" className="dexit" onClick={() => store.setDiscreet(false)}>
        exit discreet mode
      </button>
    </main>
  );
}
