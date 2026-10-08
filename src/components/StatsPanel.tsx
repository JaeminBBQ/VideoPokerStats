import { useState } from 'react';
import { errorRate, type TotalsEntry } from '../lib/stats.ts';

interface Props {
  gameName: string;
  totals: TotalsEntry;
  denomination: number;
  maxCoins: number;
  onReset: () => void;
}

export default function StatsPanel({ gameName, totals, denomination, maxCoins, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  const money = (bets: number) => '$' + (bets * denomination * maxCoins).toFixed(2);
  const avg = totals.hands === 0 ? 0 : totals.evLost / totals.hands;
  return (
    <section className="panel" aria-label="Stats">
      <h2>Stats — {gameName}</h2>
      <div className="stats-grid">
        <div className="stat">
          <div className="stat-value">{totals.hands}</div>
          <div className="stat-label">Hands</div>
        </div>
        <div className="stat">
          <div className="stat-value">{totals.mistakes}</div>
          <div className="stat-label">Mistakes</div>
        </div>
        <div className="stat">
          <div className="stat-value">{errorRate(totals).toFixed(1)}%</div>
          <div className="stat-label">Error rate</div>
        </div>
        <div className="stat">
          <div className="stat-value">{totals.evLost.toFixed(4)}</div>
          <div className="stat-label">EV lost (bets) · {money(totals.evLost)}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{avg.toFixed(4)}</div>
          <div className="stat-label">Avg EV lost / hand · {money(avg)}</div>
        </div>
      </div>
      <div className="stats-controls">
        {confirming ? (
          <span className="reset-confirm">
            Reset all stats for this game?
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirming(false);
                onReset();
              }}
            >
              Yes, reset
            </button>
            <button type="button" className="btn subtle" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn subtle"
            onClick={() => setConfirming(true)}
            disabled={totals.hands === 0}
          >
            Reset stats
          </button>
        )}
      </div>
    </section>
  );
}
