import { useState } from 'react';
import { errorRate, type TotalsEntry } from '../lib/stats.ts';
import { DENOM_LABELS, DENOMINATIONS } from '../lib/storage.ts';

interface Props {
  gameName: string;
  totals: TotalsEntry;
  denomination: number;
  onDenominationChange: (d: number) => void;
  onReset: () => void;
}

export default function StatsPanel({ gameName, totals, denomination, onDenominationChange, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  const money = (bets: number) => '$' + (bets * denomination * 5).toFixed(2);
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
        <label className="denom-picker">
          Denomination{' '}
          <select
            value={denomination}
            onChange={(e) => onDenominationChange(Number(e.target.value))}
            aria-label="Denomination"
          >
            {DENOMINATIONS.map((d) => (
              <option key={d} value={d}>
                {DENOM_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
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
