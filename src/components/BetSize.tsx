import { useEffect, useMemo, useState } from 'react';
import type { EngineClient, GameDef, GameId } from '../engine/index.ts';
import { formatCents } from '../lib/bankroll.ts';
import {
  BET_SIZE_HANDS_PER_HOUR,
  LAST_HANDS,
  bestForGoal,
  bestForLasting,
  betOptions,
  goalChance,
  isFullRoyal,
  lastChanceShortcut,
  lastRule,
  lossPerHourCents,
  type BetOption,
} from '../lib/betSize.ts';
import { GOALS } from '../lib/goals.ts';
import { ODDS_BY_GAME } from '../lib/odds.ts';
import { pct } from '../lib/oddsFormat.ts';
import { DENOM_LABELS } from '../lib/storage.ts';

interface Props {
  game: GameDef;
  gameId: GameId;
  engine: EngineClient;
}

type Mode = 'goal' | 'last';

const SAFETY = [0.9, 0.95, 0.99];
/** Caps on the bet per hand; $1 is the owner's usual limit. */
const CAPS = [25, 50, 100, 200, 500, 1000];
const LAST_LABELS: Record<number, string> = { 500: '~1 hour', 1000: '~2 hours', 2000: '~4 hours' };

/** "5¢ × 20" plus what the royal pays at this bet. */
function howLabel(o: BetOption): string {
  const coins = `${DENOM_LABELS[o.denomination] ?? `$${o.denomination}`} × ${o.coins}`;
  if (o.coins === o.maxCoins) return `${coins} (max)`;
  return isFullRoyal(o) ? `${coins} (full royal)` : `${coins} (short royal)`;
}

/**
 * "How much should I bet?" (D34): for a budget, every photographed bet on this game, ranked for a win goal
 * (highest exact chance) or for lasting a session (the biggest full-royal bet that lasts with the chosen
 * safety). Short bets pay the royal at 250 per coin on most machines; the table says which.
 */
export default function BetSize({ game, gameId, engine }: Props) {
  const odds = ODDS_BY_GAME[gameId];
  const [budgetDollars, setBudgetDollars] = useState('100');
  const [mode, setMode] = useState<Mode>('goal');
  const [goalIndex, setGoalIndex] = useState(() => GOALS.findIndex((g) => g.multiple === 1));
  const [hands, setHands] = useState(1000);
  const [safety, setSafety] = useState(0.95);
  const [capCents, setCapCents] = useState(100);
  const budgetCents = (Number.parseInt(budgetDollars, 10) || 0) * 100;

  const options = useMemo(() => (odds ? betOptions(game, odds) : []), [game, odds]);
  const affordable = useMemo(
    () => options.filter((o) => o.betCents <= budgetCents && o.betCents <= capCents),
    [options, budgetCents, capCents],
  );

  const goal = GOALS[goalIndex];
  const goalCents = goal.dollars !== undefined ? goal.dollars * 100 : budgetCents * (goal.multiple ?? 1);
  const goalChances = useMemo(
    () => (mode === 'goal' ? affordable.map((o) => goalChance(o, budgetCents, goalCents)) : []),
    [mode, affordable, budgetCents, goalCents],
  );

  // Lasting odds: certain cases are worked out here; the rest come from the engine worker (exact DP),
  // keyed by bet so stale results never show. undefined while computing, null when too large.
  const lastKey = `${gameId}|${budgetCents}|${hands}`;
  const [computed, setComputed] = useState<{ key: string; byBet: Record<number, number | null> }>({ key: '', byBet: {} });
  useEffect(() => {
    if (mode !== 'last') return;
    let cancelled = false;
    const byBet: Record<number, number | null> = {};
    for (const o of affordable) {
      if (lastChanceShortcut(o, budgetCents, hands) !== undefined) continue;
      const done = (p: number | null) => {
        if (cancelled) return;
        byBet[o.betCents] = p;
        setComputed({ key: lastKey, byBet: { ...byBet } });
      };
      engine.leave(o.pays, o.probs, Math.floor(budgetCents / o.betCents), [lastRule(hands)]).then(
        ([r]) => done(r ? 1 - r.pBroke : null),
        () => done(null),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [mode, affordable, budgetCents, hands, engine, lastKey]);

  if (!odds || options.length === 0) return null;

  const lastChances: (number | null | undefined)[] = affordable.map(
    (o) => lastChanceShortcut(o, budgetCents, hands) ?? (computed.key === lastKey ? computed.byBet[o.betCents] : undefined),
  );
  const lastPending = lastChances.some((p) => p === undefined);
  const best =
    mode === 'goal'
      ? affordable.length
        ? bestForGoal(goalChances)
        : -1
      : lastPending
        ? -1
        : bestForLasting(affordable, lastChances as (number | null)[], safety);
  const pick = best >= 0 ? affordable[best] : undefined;
  const chanceOf = (i: number): string => {
    const p = mode === 'goal' ? goalChances[i] : lastChances[i];
    if (p === undefined) return '…';
    if (p === null) return '—';
    return pct(p);
  };

  let advice: string;
  if (affordable.length === 0)
    advice =
      options[0].betCents > capCents
        ? `The smallest bet here is ${formatCents(options[0].betCents)}, over your ${formatCents(capCents)} limit.`
        : `Your budget doesn't cover the smallest bet here (${formatCents(options[0].betCents)}).`;
  else if (mode === 'last' && lastPending) advice = 'Working it out…';
  else if (!pick) advice = `No bet here lasts ${hands.toLocaleString()} hands with a ${Math.round(safety * 100)}% chance. Bring more or play shorter.`;
  else if (mode === 'goal')
    advice = `Bet ${formatCents(pick.betCents)} a hand (${howLabel(pick)}): ${pct(goalChances[best])} chance to reach ${goal.label === 'Double' || goal.label === 'Triple' ? `${goal.label.toLowerCase()} (+${formatCents(goalCents)})` : goal.label} before your ${formatCents(budgetCents)} runs out.`;
  else
    advice = `Bet up to ${formatCents(pick.betCents)} a hand (${howLabel(pick)}): ${pct(lastChances[best] as number)} chance your ${formatCents(budgetCents)} lasts ${hands.toLocaleString()} hands.`;

  return (
    <div className="betsize">
      <h3>How much should I bet?</h3>
      <label className="odds-goal-label" htmlFor="betsize-budget">
        Budget
      </label>
      <div className="odds-goal-input-row">
        <span className="odds-goal-dollar">$</span>
        <input
          id="betsize-budget"
          className="odds-goal-input"
          inputMode="numeric"
          value={budgetDollars}
          onChange={(e) => setBudgetDollars(e.target.value.replace(/[^0-9]/g, ''))}
          aria-label="Budget in whole dollars"
        />
      </div>

      <div className="bankroll-controls">
        <div className="bankroll-control">
          <span className="bankroll-control-label">I want to</span>
          <div className="chip-row" role="group" aria-label="What you want">
            <button type="button" className={`chip${mode === 'goal' ? ' active' : ''}`} onClick={() => setMode('goal')}>
              Reach a win goal
            </button>
            <button type="button" className={`chip${mode === 'last' ? ' active' : ''}`} onClick={() => setMode('last')}>
              Make it last
            </button>
          </div>
        </div>
        <div className="bankroll-control">
          <span className="bankroll-control-label">Most I&apos;d bet a hand</span>
          <div className="chip-row" role="group" aria-label="Most you'd bet a hand">
            {CAPS.map((c) => (
              <button key={c} type="button" className={`chip${c === capCents ? ' active' : ''}`} onClick={() => setCapCents(c)}>
                {formatCents(c)}
              </button>
            ))}
          </div>
        </div>
        {mode === 'goal' ? (
          <div className="bankroll-control">
            <span className="bankroll-control-label">Goal</span>
            <div className="chip-row" role="group" aria-label="Win goal">
              {GOALS.map((g, i) => (
                <button key={g.label} type="button" className={`chip${i === goalIndex ? ' active' : ''}`} onClick={() => setGoalIndex(i)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="bankroll-control">
              <span className="bankroll-control-label">Session length</span>
              <div className="chip-row" role="group" aria-label="Session length">
                {LAST_HANDS.map((h) => (
                  <button key={h} type="button" className={`chip${h === hands ? ' active' : ''}`} onClick={() => setHands(h)}>
                    {h.toLocaleString()} · {LAST_LABELS[h]}
                  </button>
                ))}
              </div>
            </div>
            <div className="bankroll-control">
              <span className="bankroll-control-label">Safety</span>
              <div className="chip-row" role="group" aria-label="Safety">
                {SAFETY.map((t) => (
                  <button key={t} type="button" className={`chip${t === safety ? ' active' : ''}`} onClick={() => setSafety(t)}>
                    {Math.round(t * 100)}%
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <p className="betsize-advice">{advice}</p>

      {affordable.length > 0 && (
        <table className="compare-table betsize-table">
          <thead>
            <tr>
              <th>Bet</th>
              <th>How</th>
              <th>Return</th>
              <th>{mode === 'goal' ? 'Chance' : 'Lasts'}</th>
              <th>Loss/hour</th>
            </tr>
          </thead>
          <tbody>
            {affordable.map((o, i) => (
              <tr key={o.betCents} className={i === best ? 'current' : undefined}>
                <th scope="row">{formatCents(o.betCents)}</th>
                <td className="betsize-how">{howLabel(o)}</td>
                <td className={isFullRoyal(o) ? undefined : 'betsize-short'}>{(o.ret * 100).toFixed(2)}%</td>
                <td>{chanceOf(i)}</td>
                <td>{formatCents(Math.round(lossPerHourCents(o)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="bankroll-footnote">
        Every bet the paytable photos show for this game, up to $10. Below max coins most machines pay the royal
        250 per coin instead of 800, which costs about 1.4% of return, so a short bet is only worth it when no
        full-royal bet fits. Same bet, more coins at a smaller denomination wins. Short bets are played with the
        max-bet strategy you train here. A win goal plays until it&apos;s reached or a bet can&apos;t be covered;
        lasting means every hand of the session without going broke. Exact, not simulated.{' '}
        {BET_SIZE_HANDS_PER_HOUR} hands an hour. Bets not shown (for example 1–15 coins on the GSR 5¢ Jacks
        machine) aren&apos;t photographed yet.
      </p>
    </div>
  );
}
