import { useEffect, useRef, useState } from 'react';
import { offerAt, type GameDef, type GameId } from '../engine/index.ts';
import { formatCents } from '../lib/bankroll.ts';
import { compareRows, mineFromTotals, rateLabel } from '../lib/bankrollTab.ts';
import { betsToCents, riskFor, RISK } from '../lib/riskData.ts';
import type { TotalsEntry } from '../lib/stats.ts';
import { DENOM_LABELS } from '../lib/storage.ts';

/** Short labels for the risk horizons (the parenthetical copy in RISK.md). */
const HORIZON_LABELS: Record<number, string> = {
  500: '~1 hour',
  2000: '~4 hours',
  10000: 'long trip',
};

/** Which error-rate column is selected: a fixed one, or "mine" (follows the game's totals). */
interface ErrSel {
  rate: number;
  source: 'mine' | 'rate';
}

interface Props {
  game: GameDef;
  gameId: GameId;
  denomination: number;
  onDenominationChange: (d: number) => void;
  totalsEntry: TotalsEntry;
  sessionActive: boolean;
  onStartSession: (cents: number) => void;
}

export default function BankrollTab({
  game,
  gameId,
  denomination,
  onDenominationChange,
  totalsEntry,
  sessionActive,
  onStartSession,
}: Props) {
  const [hands, setHands] = useState(2000); // default session length: ~4 hours
  const [target, setTarget] = useState(0.95);
  const [errSel, setErrSel] = useState<ErrSel>(() => {
    const mine = mineFromTotals(totalsEntry);
    return mine.available ? { source: 'mine', rate: mine.rate } : { source: 'rate', rate: 0 };
  });

  const mine = mineFromTotals(totalsEntry);
  const errorRate = errSel.source === 'mine' ? mine.rate : errSel.rate;

  // "Mine" follows the game the header picker selects. If the new game has no hands,
  // keep the chosen column but drop the Mine highlight (the chip is disabled anyway).
  const prevGameId = useRef(gameId);
  useEffect(() => {
    if (prevGameId.current === gameId) return;
    prevGameId.current = gameId;
    setErrSel((sel) => {
      if (sel.source !== 'mine') return sel;
      const m = mineFromTotals(totalsEntry);
      return m.available ? { source: 'mine', rate: m.rate } : { source: 'rate', rate: sel.rate };
    });
  }, [gameId, totalsEntry]);

  const rgame = riskFor(gameId);
  const perError = rgame?.perError.find((p) => p.errorRate === errorRate);
  const horizon = perError?.horizons.find((h) => h.hands === hands);
  const bets = horizon?.bankrollNeededBets[String(target)];
  const offer = offerAt(game, denomination);
  const maxCoins = offer?.maxCoins ?? 0;
  const cents = bets !== undefined && offer ? betsToCents(bets, denomination, maxCoins) : undefined;
  const startCents = cents !== undefined ? Math.ceil(cents / 100) * 100 : undefined;
  const rows = compareRows(denomination, errorRate, target);
  const targetLabel = `${Math.round(target * 100)}%`;

  if (!rgame) {
    return (
      <section className="panel bankroll-panel">
        <h2>Bankroll — {game.name}</h2>
        <p>Bankroll numbers for this game are coming.</p>
      </section>
    );
  }

  return (
    <section className="panel bankroll-panel" aria-label="Bankroll calculator">
      <h2>Bankroll — {game.name}</h2>

      <div className="bankroll-controls">
        <div className="bankroll-control">
          <span className="bankroll-control-label">Denomination</span>
          <div className="chip-row" role="group" aria-label="Denomination">
            {game.offers.map((o) => (
              <button
                key={o.denomination}
                type="button"
                className={`chip${o.denomination === denomination ? ' active' : ''}`}
                onClick={() => onDenominationChange(o.denomination)}
              >
                {DENOM_LABELS[o.denomination]}
                {!o.confirmed && <span className="denom-unconfirmed">*</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="bankroll-control">
          <span className="bankroll-control-label">Session length</span>
          <div className="chip-row" role="group" aria-label="Session length">
            {RISK.horizons.map((h) => (
              <button key={h} type="button" className={`chip${h === hands ? ' active' : ''}`} onClick={() => setHands(h)}>
                {h.toLocaleString()} · {HORIZON_LABELS[h]}
              </button>
            ))}
          </div>
        </div>

        <div className="bankroll-control">
          <span className="bankroll-control-label">Safety</span>
          <div className="chip-row" role="group" aria-label="Safety">
            {RISK.targets.map((t) => (
              <button key={t} type="button" className={`chip${t === target ? ' active' : ''}`} onClick={() => setTarget(t)}>
                {Math.round(t * 100)}%
              </button>
            ))}
          </div>
        </div>

        <div className="bankroll-control">
          <span className="bankroll-control-label">Error rate</span>
          <div className="chip-row" role="group" aria-label="Error rate">
            {RISK.errorRates.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip${errSel.source === 'rate' && r === errorRate ? ' active' : ''}`}
                onClick={() => setErrSel({ source: 'rate', rate: r })}
              >
                {rateLabel(r)}
              </button>
            ))}
            <button
              type="button"
              className={`chip${errSel.source === 'mine' ? ' active' : ''}`}
              disabled={!mine.available}
              title={mine.available ? undefined : 'No Deal-mode hands recorded for this game yet'}
              onClick={() => setErrSel({ source: 'mine', rate: mine.rate })}
            >
              Mine ({mine.percent.toFixed(1)}% → {rateLabel(mine.rate)})
            </button>
          </div>
        </div>
      </div>

      {bets !== undefined && cents !== undefined && horizon && perError && (
        <>
          <div className="bankroll-result">
            <div className="bankroll-amount">{formatCents(cents)}</div>
            <div className="bankroll-bets">{bets.toLocaleString()} bets</div>
            <p className="bankroll-sentence">
              Bring {formatCents(cents)} to play {hands.toLocaleString()} hands of {game.name} at{' '}
              {DENOM_LABELS[denomination]} with a {targetLabel} chance of not going broke.
            </p>
            <div className="bankroll-substats">
              <span>Expected loss: {formatCents(betsToCents(horizon.expectedLossBets, denomination, maxCoins))}</span>
              <span>Return at this error rate: {(perError.return * 100).toFixed(3)}%</span>
            </div>
          </div>

          <div className="bankroll-compare">
            <h3>Compare games</h3>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Game</th>
                  {RISK.horizons.map((h) => (
                    <th key={h}>
                      {HORIZON_LABELS[h]}
                      <span className="compare-hands">{h.toLocaleString()} hands</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const [base, qual] = row.game.name.split(' — ');
                  return (
                    <tr key={row.game.id} className={row.game.id === gameId ? 'current' : undefined}>
                      <th scope="row">
                        {base}
                        {qual !== undefined && <span className="compare-pay">{qual}</span>}
                      </th>
                      {row.cells.map((c) => (
                        <td key={c.hands}>{formatCents(c.cents)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bankroll-start">
            <button
              type="button"
              className="btn primary"
              disabled={sessionActive || startCents === undefined}
              onClick={() => startCents !== undefined && onStartSession(startCents)}
            >
              Start a session with {startCents !== undefined ? formatCents(startCents) : ''}
            </button>
            {sessionActive && <span className="bankroll-session-note">End your current session first</span>}
          </div>
        </>
      )}

      <p className="bankroll-footnote">
        One bet is one max-bet hand ({maxCoins} coins on this machine at {DENOM_LABELS[denomination]}); dollars =
        bets × coins × denomination. "Going broke" means your balance
        can&apos;t cover a max bet, and surviving means playing every hand of the session length without that
        happening. With an error rate, each hand independently plays the next-best hold with that chance — real
        mistakes aren&apos;t all next-best or evenly spread, so treat those columns as a guide. Tier points, free
        play, and other comps aren&apos;t counted. Each paytable is the one photographed at the denominations shown (an
        asterisk means not yet confirmed at that denomination). The numbers are exact and were checked
        against 240 million simulated hands.
      </p>
    </section>
  );
}
