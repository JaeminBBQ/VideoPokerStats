import { RANKS, SUIT_SYMBOLS, isRedSuit, rankOf, suitOf, type Card } from '../engine/index.ts';
import type { CardEmphasis } from './CardView.tsx';

interface Props {
  card: Card;
  wild: boolean;
  /** Grading emphasis (used for the dealt hand inside the feedback panel). */
  emphasis?: CardEmphasis;
}

/** Tiny non-interactive card face for chart examples (no jokers: chart games deal 52-card decks). */
export default function MiniCard({ card, wild, emphasis = 'normal' }: Props) {
  const red = isRedSuit(suitOf(card));
  return (
    <span className={`mini-card${wild ? ' wild' : ''} ${red ? 'red' : 'black'} emphasis-${emphasis}`} aria-hidden>
      <span className="mini-rank">{RANKS[rankOf(card)]}</span>
      <span className="mini-suit">{SUIT_SYMBOLS[suitOf(card)]}</span>
      {wild && <span className="mini-wild">W</span>}
    </span>
  );
}
