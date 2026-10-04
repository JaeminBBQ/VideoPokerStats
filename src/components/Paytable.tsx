import type { GameDef } from '../engine/index.ts';

interface Props {
  game: GameDef;
  open: boolean;
  onToggle: () => void;
}

export default function Paytable({ game, open, onToggle }: Props) {
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
              <th>× 5 coins</th>
            </tr>
          </thead>
          <tbody>
            {game.rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{row.pays}</td>
                <td>{row.pays * 5}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
