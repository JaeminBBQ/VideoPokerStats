import { JOKER, RANKS, SUIT_SYMBOLS, rankOf, suitOf, type Card } from '../engine/index.ts';

export type CardEmphasis = 'normal' | 'correct' | 'dimmed';

interface Props {
  card: Card;
  held: boolean;
  emphasis: CardEmphasis;
  isWild: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export default function CardView({ card, held, emphasis, isWild, disabled, onToggle }: Props) {
  const joker = card === JOKER;
  const red = joker || suitOf(card) % 2 === 1;
  return (
    <div className={`card-slot${held ? ' held' : ''} emphasis-${emphasis}`}>
      <div className="hold-tag">{held ? 'HELD' : ''}</div>
      <button
        type="button"
        className={`card ${red ? 'red' : 'black'}`}
        onClick={onToggle}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={held ? 'Unhold' : 'Hold'}
      >
        <span className="card-rank">{joker ? 'JOKER' : RANKS[rankOf(card)]}</span>
        <span className="card-suit" aria-hidden>
          {joker ? '★' : SUIT_SYMBOLS[suitOf(card)]}
        </span>
        {isWild && <span className="wild-tag">WILD</span>}
      </button>
    </div>
  );
}
