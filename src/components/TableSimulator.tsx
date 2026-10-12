import { useEffect, useMemo, useState } from 'react';
import type { EngineClient } from '../engine/index.ts';
import type { LeaveOdds } from '../engine/leave.ts';
import { formatCents } from '../lib/bankroll.ts';
import { hoursText, pct1 } from '../lib/simChart.ts';
import type { LeaveAdviceRow } from '../lib/simulate.ts';
import {
  exactTableAsync,
  runTableMany,
  runTableSession,
  tableEdge,
  tableLeaveAdviceAsync,
  tableSimGame,
  type TableManyRuns,
  type TableRun,
  type TableSimGame,
  type TableSimId,
  type TableSimParams,
} from '../lib/tableSim.ts';
import { Histogram, SessionChart } from './SimCharts.tsx';
import { END_ROWS, GOAL_FRACTIONS, HOUR_OPTIONS, type GoalMode } from './simShared.ts';

interface Props {
  engine: EngineClient;
  gameId: TableSimId;
}

/** "$3" or "$7.50": dollars without the trailing ".00" for bet chips (formatCents always shows cents). */
function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : formatCents(cents);
}

/** Percentages for the edge line: two decimals, e.g. "1.41%". */
function pct2(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

/** "1h 12m": `rounds` at `pace` per hour. */
function clockAtPace(rounds: number, pace: number): string {
  const mins = Math.round((rounds / pace) * 60);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/** "Hand"/"Hands"/"Bet"/"Bets" for stat labels. */
function unitWord(g: TableSimGame, n: number): string {
  const w = g.unit + (n === 1 ? '' : 's');
  return w[0].toUpperCase() + w.slice(1);
}

/** What happened to the one session, in the spec's words. */
function endMessage(run: TableRun, p: TableSimParams, pace: number): string {
  switch (run.end) {
    case 'win':
      return `Hit your goal after ${clockAtPace(run.rounds, pace)}`;
    case 'loss-limit':
      return `Hit your loss limit after ${clockAtPace(run.rounds, pace)}`;
    case 'broke':
      return `Out of money after ${clockAtPace(run.rounds, pace)}`;
    case 'time':
      return `Played the full ${hoursText(p.maxRounds / pace)} hours`;
  }
}

export default function TableSimulator({ engine, gameId }: Props) {
  const g = tableSimGame(gameId);

  // Inputs: scratch state, not persisted. `gameId` is fixed per mount (the tab remounts on switch).
  const [betCents, setBetCents] = useState(g.minBetCents);
  const [crapsOdds, setCrapsOdds] = useState(true);
  const [budgetText, setBudgetText] = useState(g.minBetCents >= 1500 ? '300' : '100');
  const [goalMode, setGoalMode] = useState<GoalMode>('none');
  const [goalText, setGoalText] = useState('');
  const [lossMode, setLossMode] = useState<'none' | 'custom'>('none');
  const [lossText, setLossText] = useState('');
  const [hours, setHours] = useState(4);
  const [paceChoice, setPaceChoice] = useState(String(g.pace));
  const [paceOtherText, setPaceOtherText] = useState('');

  // Results carry the params and pace they were computed with, so stale results never show next to
  // new inputs (the same "result keyed by params" pattern as the video poker simulator).
  const [oneRun, setOneRun] = useState<{ run: TableRun; p: TableSimParams; pace: number } | null>(null);
  const [manyRun, setManyRun] = useState<{ m: TableManyRuns; p: TableSimParams; pace: number } | null>(null);
  // Keyed by the run they were computed for: a fresh run shows "…" until its exact odds land.
  const [exactMany, setExactMany] = useState<{ m: TableManyRuns; odds: LeaveOdds | null } | null>(null);
  // Keyed by the inputs they were computed for: stale results show "Computing…" until the new ones land.
  const [adviceResult, setAdviceResult] = useState<{
    key: string;
    rows: LeaveAdviceRow[] | null;
    error: string | null;
  } | null>(null);

  const budgetCents = (Number.parseInt(budgetText, 10) || 0) * 100;
  const customGoalCents = (Number.parseInt(goalText, 10) || 0) * 100;
  const winGoalCents =
    goalMode === 'none'
      ? null
      : goalMode === 'custom'
        ? customGoalCents || null
        : Math.round(budgetCents * GOAL_FRACTIONS[goalMode]);
  const customLossCents = (Number.parseInt(lossText, 10) || 0) * 100;
  const lossLimitCents =
    lossMode === 'none' || budgetCents <= 0
      ? null
      : customLossCents === 0
        ? null
        : Math.min(customLossCents, budgetCents);
  const lossCapped = lossMode === 'custom' && customLossCents > budgetCents && budgetCents > 0;
  const paceOther = (() => {
    const n = Number.parseInt(paceOtherText, 10);
    return n > 0 ? Math.min(1000, n) : 0;
  })();
  const pace = paceChoice === 'other' ? paceOther : Number(paceChoice);
  const maxRounds = Math.round(hours * pace);

  const edge = useMemo(() => tableEdge({ game: g.id, crapsOdds }), [g.id, crapsOdds]);
  const params = useMemo<TableSimParams | null>(
    () =>
      budgetCents > 0 && maxRounds > 0
        ? { game: g.id, crapsOdds, betCents, budgetCents, winGoalCents, lossLimitCents, maxRounds }
        : null,
    [g.id, crapsOdds, betCents, budgetCents, winGoalCents, lossLimitCents, maxRounds],
  );

  // "When to leave": exact odds for six rules, off-thread (same rules as video poker).
  const adviceKey = `${g.id}|${crapsOdds}|${betCents}|${budgetCents}|${maxRounds}`;
  useEffect(() => {
    if (budgetCents <= 0 || maxRounds <= 0) return;
    let cancelled = false;
    tableLeaveAdviceAsync(engine, { game: g.id, crapsOdds, betCents, budgetCents, maxRounds })
      .then((r) => {
        if (!cancelled) setAdviceResult({ key: adviceKey, rows: r, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setAdviceResult({ key: adviceKey, rows: null, error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [engine, g.id, crapsOdds, betCents, budgetCents, maxRounds, adviceKey]);

  // The exact column beside the 1,000-session summary: the same rule, computed by the worker.
  useEffect(() => {
    if (manyRun === null) return;
    let cancelled = false;
    const { p, m } = manyRun;
    exactTableAsync(engine, p)
      .then((o) => {
        if (!cancelled) setExactMany({ m, odds: o });
      })
      .catch(() => {
        if (!cancelled) setExactMany({ m, odds: null });
      });
    return () => {
      cancelled = true;
    };
  }, [manyRun, engine]);

  const lossPerHour = pace * betCents * edge.perRound;
  const chipClass = (active: boolean) => `sim-chip${active ? ' active' : ''}`;

  const runOne = () => {
    if (params === null) return;
    setOneRun({ run: runTableSession(params, Date.now()), p: params, pace });
  };
  const runAThousand = () => {
    if (params === null) return;
    setManyRun({ m: runTableMany(params, 1000, Date.now()), p: params, pace });
  };

  const adviceCurrent = adviceResult !== null && adviceResult.key === adviceKey ? adviceResult : null;
  const advice = adviceCurrent?.rows ?? null;
  const adviceError = adviceCurrent?.error ?? null;
  const bestAhead = advice?.reduce((m, r) => (r.odds !== null ? Math.max(m, r.odds.pAhead) : m), -1) ?? -1;
  const exactLoading = manyRun !== null && (exactMany === null || exactMany.m !== manyRun.m);
  const exactOdds = manyRun !== null && exactMany !== null && exactMany.m === manyRun.m ? exactMany.odds : null;
  const exactCell = (f: (o: LeaveOdds) => string): string => {
    if (exactLoading) return '…';
    if (exactOdds === null) return '—';
    return f(exactOdds);
  };
  const runDisabled = budgetCents <= 0 || maxRounds <= 0;

  return (
    <>
      <h2>Simulator — {g.name}</h2>
      <p className="sim-note sim-rules">{g.rules}</p>

      <p className="sim-edge">
        House edge {pct2(edge.perBet)} of each {g.id === 'craps' ? 'pass-line bet' : 'hand'}
        {g.id === 'craps' && crapsOdds && ` (${pct2(edge.perWagered)} of all money bet, odds included)`}
        {' → '}about {formatCents(Math.round(lossPerHour))} an hour
        {g.id !== 'craps' && ` at ${dollars(betCents)} × ${pace}/hour`}
      </p>

      <div className="sim-inputs">
        <div className="sim-control">
          <span className="sim-label">Bet</span>
          <div className="sim-chip-row" role="group" aria-label="Bet">
            {g.betOptionsCents.map((b) => (
              <button key={b} type="button" className={chipClass(b === betCents)} onClick={() => setBetCents(b)}>
                {dollars(b)}
              </button>
            ))}
          </div>
        </div>

        {g.id === 'craps' && (
          <div className="sim-control">
            <span className="sim-label">2× odds</span>
            <div className="sim-chip-row" role="group" aria-label="2× odds">
              <button type="button" className={chipClass(crapsOdds)} onClick={() => setCrapsOdds(true)}>
                On
              </button>
              <button type="button" className={chipClass(!crapsOdds)} onClick={() => setCrapsOdds(false)}>
                Off
              </button>
            </div>
          </div>
        )}

        <div className="sim-control">
          <span className="sim-label">Budget</span>
          <div className="sim-dollar-row">
            <span className="sim-dollar">$</span>
            <input
              className="sim-input"
              inputMode="numeric"
              value={budgetText}
              onChange={(e) => setBudgetText(e.target.value.replace(/[^0-9]/g, ''))}
              aria-label="Budget in whole dollars"
            />
          </div>
        </div>

        <div className="sim-control">
          <span className="sim-label">Win goal</span>
          <div className="sim-chip-row">
            <button type="button" className={chipClass(goalMode === 'none')} onClick={() => setGoalMode('none')}>
              None
            </button>
            <button type="button" className={chipClass(goalMode === 'p25')} onClick={() => setGoalMode('p25')}>
              +25%
            </button>
            <button type="button" className={chipClass(goalMode === 'p50')} onClick={() => setGoalMode('p50')}>
              +50%
            </button>
            <button type="button" className={chipClass(goalMode === 'double')} onClick={() => setGoalMode('double')}>
              Double
            </button>
            <button type="button" className={chipClass(goalMode === 'custom')} onClick={() => setGoalMode('custom')}>
              Custom $
            </button>
          </div>
          {goalMode === 'custom' && (
            <div className="sim-dollar-row">
              <span className="sim-dollar">$</span>
              <input
                className="sim-input"
                inputMode="numeric"
                value={goalText}
                onChange={(e) => setGoalText(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label="Win goal in whole dollars"
              />
            </div>
          )}
        </div>

        <div className="sim-control">
          <span className="sim-label">Loss limit</span>
          <div className="sim-chip-row">
            <button type="button" className={chipClass(lossMode === 'none')} onClick={() => setLossMode('none')}>
              None
            </button>
            <button type="button" className={chipClass(lossMode === 'custom')} onClick={() => setLossMode('custom')}>
              Custom $
            </button>
          </div>
          {lossMode === 'custom' && (
            <>
              <div className="sim-dollar-row">
                <span className="sim-dollar">$</span>
                <input
                  className="sim-input"
                  inputMode="numeric"
                  value={lossText}
                  onChange={(e) => setLossText(e.target.value.replace(/[^0-9]/g, ''))}
                  aria-label="Loss limit in whole dollars"
                />
              </div>
              {lossCapped && <span className="sim-note">capped at your budget</span>}
            </>
          )}
        </div>

        <div className="sim-control">
          <span className="sim-label">Session length</span>
          <select
            className="sim-select"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            aria-label="Session length in hours"
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>

        <div className="sim-control">
          <span className="sim-label">Pace</span>
          <select
            className="sim-select"
            value={paceChoice}
            onChange={(e) => setPaceChoice(e.target.value)}
            aria-label="Pace"
          >
            {g.paceOptions.map((p) => (
              <option key={p} value={p}>
                {p} {g.unit}s/hour
              </option>
            ))}
            <option value="other">Other…</option>
          </select>
          {paceChoice === 'other' && (
            <div className="sim-dollar-row">
              <input
                className="sim-input"
                inputMode="numeric"
                value={paceOtherText}
                onChange={(e) => setPaceOtherText(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label={`Pace in ${g.unit}s per hour, 1 to 1000`}
              />
              <span className="sim-note">
                {g.unit}s/hour, 1–1000
              </span>
            </div>
          )}
          <span className="sim-note">
            ≈ {maxRounds.toLocaleString('en-US')} {g.unit}
            {maxRounds === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <h3>Run one session</h3>
      <div className="sim-actions">
        <button type="button" className="btn primary" onClick={runOne} disabled={runDisabled}>
          Run one session
        </button>
      </div>
      {oneRun !== null && (
        <div className="sim-result">
          <SessionChart
            path={oneRun.run.path}
            budgetCents={oneRun.p.budgetCents}
            winGoalCents={oneRun.p.winGoalCents}
            lossLimitCents={oneRun.p.lossLimitCents}
            maxRounds={oneRun.p.maxRounds}
            roundsPerHour={oneRun.pace}
          />
          <p className="sim-end">{endMessage(oneRun.run, oneRun.p, oneRun.pace)}</p>
          <div className="stats-grid sim-run-stats">
            <div className="stat">
              <div
                className={`stat-value ${oneRun.run.netCents > 0 ? 'net-up' : oneRun.run.netCents < 0 ? 'net-down' : ''}`}
              >
                {oneRun.run.netCents > 0 ? `+${formatCents(oneRun.run.netCents)}` : formatCents(oneRun.run.netCents)}
              </div>
              <div className="stat-label">Net result</div>
            </div>
            <div className="stat">
              <div className="stat-value">{oneRun.run.rounds.toLocaleString('en-US')}</div>
              <div className="stat-label">{unitWord(g, oneRun.run.rounds)}</div>
            </div>
          </div>
        </div>
      )}

      <h3>Run 1,000 sessions</h3>
      <div className="sim-actions">
        <button type="button" className="btn" onClick={runAThousand} disabled={runDisabled}>
          Run 1,000 sessions
        </button>
      </div>
      {manyRun !== null && (
        <div className="sim-many">
          <p className="sim-many-note">
            Simulated (1,000 sessions) vs Exact — the exact column computes the same rule, not a simulation.
          </p>
          <table className="sim-many-table">
            <thead>
              <tr>
                <th />
                <th>Simulated (1,000 sessions)</th>
                <th>Exact</th>
              </tr>
            </thead>
            <tbody>
              {END_ROWS.map(({ key, label, exact }) => {
                const share = manyRun.m.ends[key];
                if (share === 0) return null;
                return (
                  <tr key={key}>
                    <th>{label}</th>
                    <td>{pct1(share)}</td>
                    <td>{exactCell((o) => pct1(exact(o)))}</td>
                  </tr>
                );
              })}
              <tr>
                <th>Leave ahead</th>
                <td>{pct1(manyRun.m.pAhead)}</td>
                <td>{exactCell((o) => pct1(o.pAhead))}</td>
              </tr>
              <tr>
                <th>Average result</th>
                <td>{formatCents(manyRun.m.avgNetCents)}</td>
                <td>{exactCell((o) => formatCents(o.expNetBets * manyRun.p.betCents))}</td>
              </tr>
              <tr>
                <th>Median result</th>
                <td>{formatCents(manyRun.m.medianNetCents)}</td>
                <td>—</td>
              </tr>
              <tr>
                <th>Average time</th>
                <td>{hoursText(manyRun.m.avgRounds / manyRun.pace)} h</td>
                <td>{exactCell((o) => `${hoursText(o.expHands / manyRun.pace)} h`)}</td>
              </tr>
            </tbody>
          </table>
          <Histogram nets={manyRun.m.nets} />
        </div>
      )}

      <h3>When to leave</h3>
      <p className="sim-advice-expl">
        You lose about <strong>{formatCents(Math.round(lossPerHour))}</strong> an hour on average
        whichever rule you pick (house edge × money bet). Leave rules only change <em>how</em> sessions
        end. Quitting at a goal makes winning trips more common, and a loss limit means you never bust.
        Neither changes the hourly cost. The cheapest session is a shorter one.
      </p>
      {adviceError !== null ? (
        <p className="sim-advice-none">Couldn&apos;t compute leave advice: {adviceError}</p>
      ) : advice !== null ? (
        <table className="sim-advice-table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Leave ahead</th>
              <th>Avg result</th>
              <th>Avg time</th>
              <th>Out of money</th>
            </tr>
          </thead>
          <tbody>
            {advice.map((r) => (
              <tr key={r.label} className={r.odds !== null && r.odds.pAhead === bestAhead ? 'best' : ''}>
                <th>{r.label}</th>
                {r.odds === null ? (
                  <>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </>
                ) : (
                  <>
                    <td>{pct1(r.odds.pAhead)}</td>
                    <td>{formatCents(r.odds.expNetBets * betCents)}</td>
                    <td>{hoursText(r.odds.expHands / pace)} h</td>
                    <td>{pct1(r.odds.pBroke)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : budgetCents <= 0 ? (
        <p className="sim-advice-none">Enter a budget to see leave advice.</p>
      ) : maxRounds <= 0 ? (
        <p className="sim-advice-none">Enter a pace to see leave advice.</p>
      ) : (
        <p className="status">Computing…</p>
      )}

      <p className="sim-footnote">
        Each round is drawn from exact odds: blackjack is infinite-deck basic strategy for these rules;
        craps is exact from the dice. When your bankroll can&apos;t cover a full round you play a smaller
        one (no split or double in blackjack, no odds in craps). Exact columns are computed, not
        simulated. No comps: table and machine ratings aren&apos;t modeled.
        {g.id === 'bj-machine' &&
          ' Machine rules other than 6:5 and hitting soft 17 are assumed to match the table.'}
      </p>
    </>
  );
}
