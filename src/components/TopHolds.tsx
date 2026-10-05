import { cardToString, hasChart, patternFor, type Card, type GameDef, type HoldEv } from '../engine/index.ts';
import { competitionRanks } from '../lib/grade.ts';

const TOP_COUNT = 5;

interface Props {
  holds: HoldEv[];
  hand: Card[];
  game: GameDef;
  userMask: number;
  userRank: number;
  evBest: number;
}

interface Row {
  mask: number;
  ev: number;
  rank: number;
  isUser: boolean;
  extra: boolean;
}

export default function TopHolds({ holds, hand, game, userMask, userRank, evBest }: Props) {
  const ranks = competitionRanks(holds);
  const rows: Row[] = holds.slice(0, TOP_COUNT).map((h, i) => ({
    mask: h.mask,
    ev: h.ev,
    rank: ranks[i],
    isUser: h.mask === userMask,
    extra: false,
  }));
  if (!rows.some((r) => r.isUser)) {
    const user = holds.find((h) => h.mask === userMask);
    if (user) rows.push({ mask: user.mask, ev: user.ev, rank: userRank, isUser: true, extra: true });
  }
  const showLine = hasChart(game);
  const label = (mask: number) =>
    mask === 0 ? 'Discard all' : hand.filter((_, i) => mask & (1 << i)).map(cardToString).join(' ');
  const line = (mask: number) =>
    mask === 0 ? '' : (patternFor(game, hand.filter((_, i) => mask & (1 << i)))?.label ?? '');
  return (
    <section className="panel" aria-label="Top holds">
      <h2>Top holds</h2>
      <table className="holds-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Hold</th>
            {showLine && <th>Line</th>}
            <th>EV</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mask} className={r.isUser ? 'yours' : undefined}>
              <td>{r.rank}</td>
              <td>
                {label(r.mask)}
                {r.extra && <span className="badge">yours</span>}
              </td>
              {showLine && <td className="line-cell">{line(r.mask)}</td>}
              <td>{r.ev.toFixed(4)}</td>
              <td>{(r.ev - evBest).toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
