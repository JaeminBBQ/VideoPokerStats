import { GAMES } from '../engine/index.ts';
import { formatCents } from '../lib/bankroll.ts';
import type { SessionLogEntry } from '../lib/session.ts';
import { DENOM_LABELS } from '../lib/storage.ts';

export default function SessionLog({ log }: { log: SessionLogEntry[] }) {
  return (
    <details className="panel session-log">
      <summary>Session log ({log.length})</summary>
      {log.length === 0 ? (
        <p className="session-log-empty">No sessions ended yet.</p>
      ) : (
        <div className="session-log-scroll">
          <table className="session-log-table">
            <thead>
              <tr>
                <th>Ended</th>
                <th>Games</th>
                <th>Denom</th>
                <th>Start</th>
                <th>End</th>
                <th>Hands</th>
                <th>Coin-in</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => (
                <tr key={`${e.endedAt}-${e.startedAt}`}>
                  <td>{new Date(e.endedAt).toLocaleDateString()}</td>
                  <td>{e.gameIds.length === 0 ? '—' : e.gameIds.map((id) => GAMES[id].name).join(', ')}</td>
                  <td>{(e.denominations ?? [e.denomination]).map((d) => DENOM_LABELS[d] ?? `$${d}`).join(', ')}</td>
                  <td>{formatCents(e.startCents)}</td>
                  <td>{formatCents(e.endCents)}</td>
                  <td>{e.hands}</td>
                  <td>{formatCents(e.coinInCents)}</td>
                  <td>{e.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
