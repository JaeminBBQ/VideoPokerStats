import { useState } from 'react';
import {
  betCents,
  centsToNextPoint,
  formatCents,
  netCents,
  theoLossCents,
  tierPoints,
  type Session,
} from '../lib/bankroll.ts';
import type { Lifetime } from '../lib/session.ts';
import { DENOM_LABELS } from '../lib/storage.ts';

interface Props {
  session: Session;
  lifetime: Lifetime;
  denomination: number;
  onEnd: () => void;
}

export default function BankrollBar({ session, lifetime, denomination, onEnd }: Props) {
  const [confirming, setConfirming] = useState(false);
  const net = netCents(session);
  return (
    <section className="panel bankroll-bar" aria-label="Bankroll">
      <div className="bankroll-grid">
        <div className="stat">
          <div className="stat-value">{formatCents(session.balanceCents)}</div>
          <div className="stat-label">Balance</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatCents(betCents(denomination))}</div>
          <div className="stat-label">Bet · {DENOM_LABELS[denomination]}</div>
        </div>
        <div className="stat">
          <div className={`stat-value ${net >= 0 ? 'net-up' : 'net-down'}`}>{formatCents(net)}</div>
          <div className="stat-label">Net</div>
        </div>
        <div className="stat">
          <div className="stat-value">{session.hands}</div>
          <div className="stat-label">Hands</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatCents(session.coinInCents)}</div>
          <div className="stat-label">Coin-in</div>
        </div>
        <div className="stat">
          <div className="stat-value">{tierPoints(session.coinInCents)}</div>
          <div className="stat-label">{formatCents(centsToNextPoint(session.coinInCents))} to next point</div>
        </div>
        <div className="stat">
          {/* Ended sessions plus this one, so the total moves as you play. */}
          <div className="stat-value">{tierPoints(lifetime.coinInCents + session.coinInCents)}</div>
          <div className="stat-label">Lifetime points</div>
        </div>
      </div>
      <div className="bankroll-sub">
        <span>Won {formatCents(session.wonCents)}</span>
        <span>Expected loss at perfect play: {formatCents(theoLossCents(session))}</span>
        {confirming ? (
          <span className="reset-confirm">
            End this session?
            <button type="button" className="btn danger" onClick={onEnd}>
              Yes, end
            </button>
            <button type="button" className="btn subtle" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn subtle" onClick={() => setConfirming(true)}>
            End session
          </button>
        )}
      </div>
    </section>
  );
}
