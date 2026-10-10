import { useEffect, useState } from 'react';
import {
  EV_EPSILON,
  SUIT_SYMBOLS,
  isRedSuit,
  cardToString,
  hasChart,
  patternFor,
  type Card,
  type EngineClient,
  type GameDef,
  type GameId,
  type HoldEv,
} from '../engine/index.ts';
import {
  NUM_SLOTS,
  RANK_LABELS,
  clear,
  emptyEntry,
  pickRank,
  pickSuit,
  rankDisabled,
  selectSlot,
  suitDisabled,
  toHand,
  undo,
  type EntryState,
} from '../lib/handEntry.ts';
import { isWildCard } from '../lib/wild.ts';
import MiniCard from './MiniCard.tsx';
import TopHolds from './TopHolds.tsx';

interface Props {
  game: GameDef;
  gameId: GameId;
  engine: EngineClient;
  /** While 'preparing', the result area shows "Loading …" and no analysis runs. */
  phase: 'preparing' | 'ready' | 'dealt' | 'graded' | 'error';
}

/** Hold label for the result: positions in the entered hand, "Discard all" for mask 0. */
const holdLabel = (hand: Card[], mask: number): string =>
  mask === 0 ? 'Discard all' : hand.filter((_, i) => mask & (1 << i)).map(cardToString).join(' ');

const sameHand = (a: Card[], b: Card[]): boolean => a.length === b.length && a.every((c, i) => c === b[i]);

export default function AssistTab({ game, gameId, engine, phase }: Props) {
  const [entry, setEntry] = useState<EntryState>(emptyEntry);
  // Result and error carry the hand they describe, so a stale one never shows for a new hand.
  const [result, setResult] = useState<{ hand: Card[]; holds: HoldEv[] } | null>(null);
  const [error, setError] = useState<{ hand: Card[]; message: string } | null>(null);

  // Re-analyze whenever the entered hand or the game changes; stale responses are dropped.
  useEffect(() => {
    let cancelled = false;
    const hand = toHand(entry);
    if (phase === 'preparing' || hand === null) return;
    engine.analyze(gameId, hand).then(
      (h) => {
        if (cancelled) return;
        setResult({ hand, holds: h });
        setError(null);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError({ hand, message: String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [engine, gameId, phase, entry]);

  const hand = toHand(entry);
  const complete = hand !== null;
  const canUndo = entry.ranks.some((r) => r !== null) || entry.suits.some((su) => su !== null);
  const holds = hand !== null && result !== null && sameHand(result.hand, hand) ? result.holds : null;
  const analysisError = hand !== null && error !== null && sameHand(error.hand, hand) ? error.message : null;

  const bestLine =
    hand !== null && holds !== null && holds[0].mask !== 0 && hasChart(game)
      ? (patternFor(game, hand.filter((_, i) => holds[0].mask & (1 << i)))?.label ?? null)
      : null;

  let optimalMasks: number[] = [];
  let tied = false;
  if (hand !== null && holds !== null) {
    const evBest = holds[0].ev;
    optimalMasks = holds.filter((h) => evBest - h.ev <= EV_EPSILON).map((h) => h.mask);
    tied = optimalMasks.length > 1;
  }

  const suitPadLabel = (() => {
    if (complete) return 'Tap a card to edit';
    const r = entry.ranks[entry.cursor];
    return r === null ? `Suit for card ${entry.cursor + 1}` : `Suit for card ${entry.cursor + 1} (${RANK_LABELS[r]})`;
  })();

  return (
    <section className="panel assist-panel">
      <h2>Assist — {game.name}</h2>

      <div className="assist-slots">
        {Array.from({ length: NUM_SLOTS }, (_, i) => {
          const rank = entry.ranks[i];
          const suit = entry.suits[i];
          const card = rank !== null && suit !== null ? rank * 4 + suit : null;
          const label =
            card !== null ? cardToString(card) : rank !== null ? `${RANK_LABELS[rank]} ?` : `empty slot ${i + 1}`;
          return (
            <button
              key={i}
              type="button"
              className={`assist-slot${entry.cursor === i ? ' cursor' : ''}${card === null ? ' empty' : ''}`}
              onClick={() => setEntry((s) => selectSlot(s, i))}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={label}
              title={label}
            >
              {card !== null ? (
                <MiniCard card={card} wild={isWildCard(game, card)} />
              ) : rank !== null ? (
                <span className="assist-pending">
                  <span className="assist-pending-rank">{RANK_LABELS[rank]}</span>
                  <span className="assist-pending-suit">?</span>
                </span>
              ) : (
                <span className="assist-empty-mark">?</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="assist-pad">
        <div className="assist-pad-label">{complete ? 'Tap a card to edit' : `Rank for card ${entry.cursor + 1}`}</div>
        <div className="assist-ranks">
          {RANK_LABELS.map((label, r) => (
            <button
              key={label}
              type="button"
              className="assist-rank-btn"
              disabled={entry.stage !== 'rank' || rankDisabled(entry, r)}
              onClick={() => setEntry((s) => pickRank(s, r))}
              onMouseDown={(e) => e.preventDefault()}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="assist-pad">
        <div className="assist-pad-label">{suitPadLabel}</div>
        <div className="assist-suits">
          {SUIT_SYMBOLS.map((symbol, suit) => (
            <button
              key={suit}
              type="button"
              className={`assist-suit-btn${isRedSuit(suit) ? ' red' : ''}`}
              disabled={complete || entry.stage !== 'suit' || suitDisabled(entry, suit)}
              onClick={() => setEntry((s) => pickSuit(s, suit))}
              onMouseDown={(e) => e.preventDefault()}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="assist-actions">
        <button type="button" className="btn" onClick={() => setEntry((s) => undo(s))} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="btn" onClick={() => setEntry(clear())}>
          New hand
        </button>
      </div>

      {phase === 'preparing' ? (
        <div className="status">Loading {game.name}…</div>
      ) : hand === null ? (
        <div className="status">Enter the 5 cards: ranks first, then suits.</div>
      ) : analysisError ? (
        <div className="status error">Engine error: {analysisError}</div>
      ) : holds === null ? null : (
        <div className="assist-result" aria-live="polite">
          <div className="assist-result-cards">
            {hand.map((card, i) => (
              <span key={i} className="mini-slot">
                {!tied && (
                  <span className={`mini-held${holds[0].mask & (1 << i) ? ' on' : ''}`}>
                    {holds[0].mask & (1 << i) ? 'HOLD' : ''}
                  </span>
                )}
                <MiniCard
                  card={card}
                  wild={isWildCard(game, card)}
                  emphasis={!tied && (holds[0].mask & (1 << i)) === 0 ? 'dimmed' : 'normal'}
                />
              </span>
            ))}
          </div>
          {tied ? (
            <>
              <div className="banner tie">Tie: any of these is correct · EV {holds[0].ev.toFixed(4)}</div>
              <ul className="assist-ties">
                {optimalMasks.map((m) => (
                  <li key={m}>{holdLabel(hand, m)}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="assist-best">
              <strong>{holdLabel(hand, holds[0].mask)}</strong>
              {bestLine ? ` — ${bestLine}` : ''} · EV {holds[0].ev.toFixed(4)}
            </div>
          )}
          <TopHolds holds={holds} hand={hand} game={game} />
        </div>
      )}
    </section>
  );
}
