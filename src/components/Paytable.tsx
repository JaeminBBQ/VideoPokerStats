import type { GameDef } from '../engine/index.ts';

interface Props {
  game: GameDef;
  /** Coins in a max bet at the current denomination. */
  maxCoins: number;
  open: boolean;
  onToggle: () => void;
}

export default function Paytable({ game, maxCoins, open, onToggle }: Props) {
  return (
    <div className="paytable">
      <button type="button" className="paytable-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? '▾' : '▸'} Paytable — return {(game.publishedReturn * 100).toFixed(game.publishedDecimals)}%
      </button>
      {open && (
        <table className="paytable-table">
          <thead>
            <tr>
              <th>Hand</th>
              <th>Pays</th>
              <th>× {maxCoins} coins</th>
            </tr>
          </thead>
          <tbody>
            {game.rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{row.pays}</td>
                <td>{row.pays * maxCoins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
