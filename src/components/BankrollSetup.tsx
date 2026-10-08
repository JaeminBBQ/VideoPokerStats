import { useState, type FormEvent } from 'react';
import { maxCoinsAt, offerAt, type GameDef } from '../engine/index.ts';
import { betCents, formatCents } from '../lib/bankroll.ts';
import { DENOM_LABELS } from '../lib/storage.ts';

const PRESETS = [20, 50, 100, 200];

interface Props {
  game: GameDef;
  denomination: number;
  onDenominationChange: (d: number) => void;
  onStart: (bankrollCents: number) => void;
}

export default function BankrollSetup({ game, denomination, onDenominationChange, onStart }: Props) {
  const [text, setText] = useState('');
  const minBet = betCents(denomination, maxCoinsAt(game, denomination));
  const confirmed = offerAt(game, denomination)?.confirmed ?? false;
  const error = (() => {
    if (text.trim() === '') return null;
    const n = Number(text);
    if (!Number.isFinite(n)) return 'Enter a dollar amount';
    if (n <= 0) return 'Enter an amount greater than $0';
    if (Math.round(n * 100) < minBet) return `Must cover one max bet (${formatCents(minBet)})`;
    return null;
  })();
  const canStart = error === null && text.trim() !== '';
  const start = (e: FormEvent) => {
    e.preventDefault();
    if (!canStart) return;
    onStart(Math.round(Number(text) * 100));
  };
  return (
    <section className="panel bankroll-setup" aria-label="Bankroll setup">
      <h2>Start a session</h2>
      <div className="setup-denoms" role="group" aria-label="Denomination">
        {game.offers.map((o) => (
          <button
            key={o.denomination}
            type="button"
            className={`denom-chip${o.denomination === denomination ? ' active' : ''}`}
            onClick={() => onDenominationChange(o.denomination)}
          >
            {DENOM_LABELS[o.denomination]} · {formatCents(betCents(o.denomination, o.maxCoins))}/hand
            {!o.confirmed && <span className="denom-unconfirmed">*</span>}
          </button>
        ))}
      </div>
      {!confirmed && (
        <p className="setup-note">
          * Paytable not yet confirmed at {DENOM_LABELS[denomination]}. Plays the photographed paytable ({game.where}).
        </p>
      )}
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p} type="button" className="btn subtle" onClick={() => setText(String(p))}>
            ${p}
          </button>
        ))}
      </div>
      <form className="setup-form" onSubmit={start} noValidate>
        <label className="setup-amount">
          ${' '}
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="20"
            aria-label="Starting bankroll in dollars"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button type="submit" className="btn primary" disabled={!canStart}>
          Start session
        </button>
      </form>
      {error !== null && <p className="setup-error">{error}</p>}
    </section>
  );
}
