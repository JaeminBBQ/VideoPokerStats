import { cardToString, type GameDef, type GameId } from '../engine/index.ts';
import type { Confusion, DrillState } from '../lib/drill.ts';

interface Props {
  game: GameDef;
  gameId: GameId;
  confusions: Confusion[];
  drillState: DrillState;
  session: { hands: number; correct: number };
}

export default function DrillPanel({ game, gameId, confusions, drillState, session }: Props) {
  const toDrill = confusions.filter((c) => !drillState[gameId]?.[c.key]?.cleared);
  const cleared = confusions.length - toDrill.length;
  const streakOf = (c: Confusion) => drillState[gameId]?.[c.key]?.streak ?? 0;
  const accuracy = session.hands === 0 ? null : Math.round((session.correct / session.hands) * 100);
  const rowLabel = (c: Confusion) =>
    c.signature
      ? `${c.signature.chosenLabel} over ${c.signature.bestLabel}${c.signature.sectionLabel ? ` · ${c.signature.sectionLabel}` : ''}`
      : c.example.hand.map(cardToString).join(' ');
  return (
    <section className="panel" aria-label="Drill">
      <h2>Drill — {game.name}</h2>
      <div className="drill-counts">
        {toDrill.length} to drill · {cleared} cleared
      </div>
      {toDrill.length > 0 && (
        <ul className="drill-list">
          {toDrill.slice(0, 5).map((c) => (
            <li key={c.key}>
              {rowLabel(c)} · {c.count}× · −{c.evLost.toFixed(2)} bets · streak {streakOf(c)}/3
            </li>
          ))}
        </ul>
      )}
      <div className="drill-session">
        Drill hands this session: {session.hands}
        {accuracy !== null ? ` · accuracy ${accuracy}%` : ''}
      </div>
    </section>
  );
}
