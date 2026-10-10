import { useMemo, useState } from 'react';
import { parseHand, type GameDef, type GameId } from '../engine/index.ts';
import { formatCents } from '../lib/bankroll.ts';
import { GOALS, goalTable, type GoalTable } from '../lib/goals.ts';
import { ODDS_BY_GAME, oneIn } from '../lib/odds.ts';
import { pct, pace, percent2, sessionLabel, signedBets, withArticle } from '../lib/oddsFormat.ts';
import { DENOM_LABELS } from '../lib/storage.ts';
import { isWildCard } from '../lib/wild.ts';
import MiniCard from './MiniCard.tsx';

interface Props {
  game: GameDef;
  gameId: GameId;
  /** Current max bet in cents (denomination × maxCoins, per-machine). */
  bet: number;
  denomination: number;
  maxCoins: number;
}

/** Categories too ordinary to headline the picker; they still appear in the table. */
const NOT_HEADLINE = new Set(['nothing', 'three-kind', 'two-pair', 'jacks-or-better']);

/** Index of the "Double" row in `GOALS` (and so in `GoalTable.rows`). */
const DOUBLE_INDEX = GOALS.findIndex((g) => g.multiple === 1);

type GoalTableOk = Extract<GoalTable, { ok: true }>;

/** The takeaway above the goal table, from whichever column is best at doubling. */
function goalTakeaway(table: GoalTableOk): string {
  const best = table.columns[table.rows[DOUBLE_INDEX].best];
  return best.id === 'video-poker'
    ? 'Video poker gives you the best shot at doubling here (the royal does the heavy lifting).'
    : `${best.short} gives you the best shot at doubling. Bigger bets reach a goal in fewer rounds, so the house edge has less time to work on you.`;
}

export default function OddsTab({ game, gameId, bet, denomination, maxCoins }: Props) {
  const odds = ODDS_BY_GAME[gameId];
  const [selectedKey, setSelectedKey] = useState<string>(() => odds?.categories[0]?.key ?? '');
  // Not persisted: the goal table is a scratch comparison.
  const [budgetDollars, setBudgetDollars] = useState('100');
  const budgetCents = (Number.parseInt(budgetDollars, 10) || 0) * 100;
  const goalData = useMemo(
    () => (odds ? goalTable(game.name, odds.perHand, budgetCents, bet) : null),
    [odds, game.name, budgetCents, bet],
  );

  if (!odds) {
    return (
      <section className="panel odds-panel">
        <h2>Odds — {game.name}</h2>
        <p>Odds for this game are coming; the trainer&apos;s feedback is exact either way.</p>
      </section>
    );
  }

  const headlines = odds.categories.filter((c) => !NOT_HEADLINE.has(c.key));
  const selected = odds.categories.find((c) => c.key === selectedKey) ?? headlines[0];
  const rows = odds.draws.filter(
    (d) => d.targets.includes(selected.key) && Number.isFinite(d.odds[selected.key]),
  );
  const perfectPace = pace(selected.perfect);
  const fourHour = odds.sessions.find((s) => s.hands === 2400);
  const denomLabel = DENOM_LABELS[denomination] ?? `$${denomination}`;
  const takeaway = goalData && goalData.ok ? goalTakeaway(goalData) : null;
  const rouletteCol = goalData && goalData.ok ? goalData.columns.find((c) => c.id === 'roulette') : undefined;

  return (
    <section className="panel odds-panel">
      <h2>Odds — {game.name}</h2>

      <h3>Pick a hand</h3>
      <div className="odds-chips" role="group" aria-label="Hand to see odds for">
        {headlines.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`odds-chip${c.key === selected.key ? ' active' : ''}`}
            onClick={() => setSelectedKey(c.key)}
            aria-pressed={c.key === selected.key}
          >
            {c.label}
          </button>
        ))}
      </div>

      <h3>Odds by what you hold</h3>
      <p className="odds-intro">Chance the final hand is {withArticle(selected.label)} after the draw.</p>
      <div className="odds-draws">
        {rows.map((d) => (
          <div className="odds-draw" key={d.label}>
            <div className="odds-draw-left">
              <div className="odds-draw-label">{d.label}</div>
              <span className="mini-hand">
                {parseHand(d.hand).map((c, i) => (
                  <MiniCard
                    key={i}
                    card={c}
                    wild={isWildCard(game, c)}
                    emphasis={i < d.hold ? 'normal' : 'dimmed'}
                  />
                ))}
              </span>
            </div>
            <div className="odds-draw-value">
              <div className="odds-one-in">{oneIn(d.odds[selected.key])}</div>
              <div className="odds-pct">{percent2(d.odds[selected.key])}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="stats-grid odds-summary">
        <div className="stat">
          <div className="stat-value">{oneIn(selected.dealt)}</div>
          <div className="stat-label">Dealt to you</div>
        </div>
        <div className="stat">
          <div className="stat-value">{oneIn(selected.perfect)}</div>
          <div className="stat-label">Over a session, playing perfectly</div>
          {perfectPace !== null && <div className="odds-hours">{perfectPace} at 600 hands/hour</div>}
        </div>
      </div>

      <h3>Chance you finish ahead</h3>
      {fourHour && (
        <p className="odds-ahead-headline">
          Play perfectly for 4 hours and you finish ahead <strong>{pct(fourHour.ahead)}</strong> of the
          time. Without a royal, only <strong>{pct(fourHour.aheadNoRoyal)}</strong>.
        </p>
      )}
      <div className="odds-ahead-legend">
        <span className="odds-ahead-legend-item">
          <span className="odds-ahead-swatch green" />
          ahead, no royal needed
        </span>
        <span className="odds-ahead-legend-item">
          <span className="odds-ahead-swatch gold" />
          ahead because of a royal
        </span>
      </div>
      <div className="odds-ahead-rows">
        {odds.sessions.map((s) => (
          <div className="odds-ahead-row" key={s.hands}>
            <div className="odds-ahead-label">
              {sessionLabel(s.hands)}
              {s.hands >= 600 && (
                <div className="odds-ahead-sub">{s.hands.toLocaleString('en-US')} hands</div>
              )}
            </div>
            <div className="odds-ahead-bar">
              <div className="odds-ahead-track">
                <div className="odds-ahead-seg green" style={{ width: `${(s.aheadNoRoyal * 100).toFixed(3)}%` }} />
                <div
                  className="odds-ahead-seg gold"
                  style={{ width: `${((s.ahead - s.aheadNoRoyal) * 100).toFixed(3)}%` }}
                />
              </div>
            </div>
            <div className="odds-ahead-value">
              {pct(s.ahead)}
              <div className="odds-ahead-sub">avg {signedBets(s.avgBets)} bets</div>
            </div>
          </div>
        ))}
      </div>
      <p className="odds-footnote">
        Exact, not simulated. Perfect play at max bet, 600 hands/hour, and enough bankroll to finish the
        session (whether you&apos;d go broke first is the Bankroll tab). 1 bet = one max-bet hand. Longer
        isn&apos;t always worse: a royal pays 800 bets, so once a session is long enough for one royal to
        cover the losses, the chance of being ahead can bump up. Break-even sessions count as not ahead.
      </p>

      <h3>Reach a goal before you go broke</h3>
      <label className="odds-goal-label" htmlFor="odds-budget">
        Starting budget
      </label>
      <div className="odds-goal-input-row">
        <span className="odds-goal-dollar">$</span>
        <input
          id="odds-budget"
          className="odds-goal-input"
          inputMode="numeric"
          value={budgetDollars}
          onChange={(e) => setBudgetDollars(e.target.value.replace(/[^0-9]/g, ''))}
          aria-label="Starting budget in whole dollars"
        />
      </div>
      <p className="odds-goal-sub">
        Video poker bets {formatCents(bet)} a hand ({maxCoins} coins × {denomLabel}): {goalData?.budgetBets ?? 0}{' '}
        bets.{' '}
        {goalData && goalData.ok && (
          <>
            Tables bet their minimum ({goalData.columns
              .filter((c) => c.minBetCents > 0)
              .map((c) => `${c.short} $${c.minBetCents / 100}`)
              .join(', ')}) or the video poker bet if that&apos;s bigger.
          </>
        )}
      </p>
      {goalData && goalData.ok && takeaway !== null && <p className="odds-goal-takeaway">{takeaway}</p>}
      {goalData && goalData.ok ? (
        <>
          <table className="odds-goal-table">
            <thead>
              <tr>
                <th>Goal</th>
                {goalData.columns.map((c) => {
                  const atMin = c.betCents === c.minBetCents && c.minBetCents > 0;
                  const whole = c.betCents % 100 === 0 ? `$${c.betCents / 100}` : formatCents(c.betCents);
                  return (
                    <th key={c.id}>
                      {c.short}
                      <div className="odds-goal-head-bet">
                        <span className="odds-goal-head-bet-full">
                          {formatCents(c.betCents)}/hand{atMin ? ' (min)' : ''}
                        </span>
                        <span className="odds-goal-head-bet-short">
                          {whole}
                          {atMin ? ' min' : '/hand'}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {goalData.rows.map((r, i) => (
                <tr key={r.label}>
                  <td>
                    <div className="odds-goal-goal-label">{r.label}</div>
                    <div className="odds-goal-goal-sub">
                      {GOALS[i].multiple !== undefined && <div>+{formatCents(r.goalCents)}</div>}
                      <div>{r.goalBets} bets</div>
                    </div>
                  </td>
                  {r.odds.map((p, ci) => (
                    <td key={ci} className={ci === r.best ? 'best' : ''}>
                      {goalData.columns[ci].playable ? pct(p) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="odds-goal-edge">
                <td>House edge</td>
                {goalData.columns.map((c) => (
                  <td key={c.id}>{`${(c.edge * 100).toFixed(2)}%`}</td>
                ))}
              </tr>
            </tbody>
          </table>
          {goalData.columns
            .filter((c) => !c.playable)
            .map((c) => (
              <p className="odds-goal-sub" key={c.id}>
                {c.short}: your budget is under the {formatCents(c.betCents)} bet.
              </p>
            ))}
          <p className="odds-footnote">
            Play until you reach the goal or can&apos;t cover a bet. No time limit. Exact, not simulated.
            Video poker: this paytable, perfect play.{' '}
            {goalData.columns.slice(1).map((c) => (
              <span key={c.id}>
                {c.short}: {c.rules}.{' '}
              </span>
            ))}
            Craps 2× counts the odds money in its house edge; the odds bet itself has no edge, so taking
            odds adds swing, not expected loss. Blackjack assumes you can always afford a double or split.
            Tables bet their minimum or the video poker bet if that&apos;s bigger. Goals round up to the
            smallest win each game can reach: whole bets in video poker, half a bet in blackjack.{' '}
            {rouletteCol && `At ${formatCents(rouletteCol.betCents)} roulette, one win covers a +$5 goal.`}
          </p>
        </>
      ) : goalData ? (
        <p className="odds-goal-sub">
          {goalData.reason === 'below-one-bet'
            ? `Your budget doesn't cover one ${formatCents(bet)} bet.`
            : "That's over 5,000 bets. Try a smaller budget."}
        </p>
      ) : null}

      <h3>Every hand at a glance</h3>
      <table className="odds-table">
        <thead>
          <tr>
            <th>Hand</th>
            <th>Dealt</th>
            <th>Perfect play</th>
          </tr>
        </thead>
        <tbody>
          {odds.categories.map((c) => (
            <tr key={c.key} className={c.key === selected.key ? 'selected' : ''}>
              <td>{c.label}</td>
              <td>{oneIn(c.dealt)}</td>
              <td>{oneIn(c.perfect)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="odds-footnote">
        Dealt = in your first 5 cards. Perfect play = the final hand when every hold is the
        engine&apos;s best. Example hands&apos; discards don&apos;t block the draw. Every number is exact
        enumeration, not simulation.
      </p>
    </section>
  );
}
