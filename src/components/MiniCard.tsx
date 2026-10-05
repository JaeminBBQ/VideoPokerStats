import { RANKS, SUIT_SYMBOLS, rankOf, suitOf, type Card } from '../engine/index.ts';

interface Props {
  card: Card;
  wild: boolean;
}

/** Tiny non-interactive card face for chart examples (no jokers: chart games deal 52-card decks). */
export default function MiniCard({ card, wild }: Props) {
  const red = suitOf(card) % 2 === 1;
  return (
    <span className={`mini-card${wild ? ' wild' : ''} ${red ? 'red' : 'black'}`} aria-hidden>
      <span className="mini-rank">{RANKS[rankOf(card)]}</span>
      <span className="mini-suit">{SUIT_SYMBOLS[suitOf(card)]}</span>
      {wild && <span className="mini-wild">W</span>}
    </span>
  );
}
