import { useEffect, useMemo, useState } from 'react';
import { SIDE_BETS_CONFIRMED, type CrapsSide, type CrapsStyle } from '../engine/craps.ts';
import type { EngineClient } from '../engine/index.ts';
import type { LeaveOdds } from '../engine/leave.ts';
import { formatCents } from '../lib/bankroll.ts';
import { hoursText, pct1 } from '../lib/simChart.ts';
import type { LeaveAdviceRow } from '../lib/simulate.ts';
import {
  exactTableAsync,
  runTableMany,
  runTableSession,
  SIDE_BET_TABLE,
  sideBetCostPerRollCents,
  tableEdge,
  tableLeaveAdviceAsync,
  tableSimGame,
  type SideBetId,
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

/** What the flat bets are called on the edge line: one line bet, or a molly's line plus come bets. */
function lineLabel(side: CrapsSide, style: CrapsStyle): string {
  if (style === 'single') return side === 'pass' ? 'pass-line' : "don't pass";
  return side === 'pass' ? 'pass and come' : "don't pass and don't come";
}

/** The four craps systems compared under the edge line (D31). */
const CRAPS_COMPARE: { label: string; side: CrapsSide; style: CrapsStyle }[] = [
  { label: 'One pass bet', side: 'pass', style: 'single' },
  { label: 'Pass molly', side: 'pass', style: 'molly' },
  { label: "One don't bet", side: 'dont', style: 'single' },
  { label: "Don't molly", side: 'dont', style: 'molly' },
];

export default function TableSimulator({ engine, gameId }: Props) {
  const g = tableSimGame(gameId);

  // Inputs: scratch state, not persisted. `gameId` is fixed per mount (the tab remounts on switch).
  const [betCents, setBetCents] = useState(g.minBetCents);
  const [crapsOdds, setCrapsOdds] = useState(true);
  const [crapsSide, setCrapsSide] = useState<CrapsSide>('pass');
  const [crapsStyle, setCrapsStyle] = useState<CrapsStyle>('single');
  const [sideText, setSideText] = useState<Record<SideBetId, string>>({ small: '', tall: '', all: '' });
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

  /** Side bet stakes in cents; empty and zero inputs are omitted (0 = no side bet). */
  const sideBetsCents = useMemo<Partial<Record<SideBetId, number>>>(() => {
    const cents: Partial<Record<SideBetId, number>> = {};
    for (const id of ['small', 'tall', 'all'] as const) {
      const c = (Number.parseInt(sideText[id], 10) || 0) * 100;
      if (c > 0) cents[id] = c;
    }
    return cents;
  }, [sideText]);
  const sideAny = Object.values(sideBetsCents).length > 0;

  const edge = useMemo(
    () => tableEdge({ game: g.id, crapsOdds, crapsSide, crapsStyle }),
    [g.id, crapsOdds, crapsSide, crapsStyle],
  );
  const params = useMemo<TableSimParams | null>(
    () =>
      budgetCents > 0 && maxRounds > 0
        ? { game: g.id, crapsOdds, crapsSide, crapsStyle, sideBetsCents, betCents, budgetCents, winGoalCents, lossLimitCents, maxRounds }
        : null,
    [g.id, crapsOdds, crapsSide, crapsStyle, sideBetsCents, betCents, budgetCents, winGoalCents, lossLimitCents, maxRounds],
  );

  // "When to leave": exact odds for six rules, off-thread (same rules as video poker).
  const adviceKey = `${g.id}|${crapsOdds}|${crapsSide}|${crapsStyle}|${JSON.stringify(sideBetsCents)}|${betCents}|${budgetCents}|${maxRounds}`;
  useEffect(() => {
    if (budgetCents <= 0 || maxRounds <= 0) return;
    let cancelled = false;
    tableLeaveAdviceAsync(engine, {
      game: g.id,
      crapsOdds,
      crapsSide,
      crapsStyle,
      sideBetsCents,
      betCents,
      budgetCents,
      maxRounds,
    })
      .then((r) => {
        if (!cancelled) setAdviceResult({ key: adviceKey, rows: r, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setAdviceResult({ key: adviceKey, rows: null, error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [engine, g.id, crapsOdds, crapsSide, crapsStyle, sideBetsCents, betCents, budgetCents, maxRounds, adviceKey]);

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
  // "—" somewhere for craps: the line under the leave table says which exact odds are missing and why.
  const adviceHasNull = advice !== null && advice.some((r) => r.odds === null);
  const exactHasNull = manyRun !== null && !exactLoading && exactOdds === null;
  const runDisabled = budgetCents <= 0 || maxRounds <= 0;

  return (
    <>
      <h2>Simulator — {g.name}</h2>
      <p className="sim-note sim-rules">{g.rules}</p>

      {g.id === 'craps' ? (
        <p className="sim-edge">
          House edge {pct2(edge.perBet)} of each {lineLabel(crapsSide, crapsStyle)} bet
          {crapsOdds && ` (${pct2(edge.perWagered)} of all money bet, odds included)`}
          {' → '}about {formatCents(Math.round(lossPerHour))} an hour
          {sideAny &&
            ` + side bets about ${formatCents(Math.round(pace * sideBetCostPerRollCents(sideBetsCents)))} an hour`}
        </p>
      ) : (
        <p className="sim-edge">
          House edge {pct2(edge.perBet)} of each hand
          {' → '}about {formatCents(Math.round(lossPerHour))} an hour at {dollars(betCents)} × {pace}/hour
        </p>
      )}

      {g.id === 'craps' && (
        <>
          <table className="sim-compare-table">
            <thead>
              <tr>
                <th />
                <th>Edge per bet</th>
                <th>Per $ out</th>
                <th>Per hour</th>
              </tr>
            </thead>
            <tbody>
              {CRAPS_COMPARE.map((c) => {
                const e = tableEdge({ game: 'craps', crapsOdds, crapsSide: c.side, crapsStyle: c.style });
                const selected = c.side === crapsSide && c.style === crapsStyle;
                return (
                  <tr key={c.label} className={selected ? 'best' : ''}>
                    <th>{c.label}</th>
                    <td>{pct2(e.perBet)}</td>
                    <td>{pct2(e.perWagered)}</td>
                    <td>{formatCents(Math.round(pace * betCents * e.perRound))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="sim-note">
            A molly has the same edge as one bet, on about 2.4× the money. The don&apos;t side is a little
            cheaper.
          </p>
        </>
      )}

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
          <>
            <div className="sim-control">
              <span className="sim-label">Bets</span>
              <div className="sim-chip-row" role="group" aria-label="Bets">
                <button type="button" className={chipClass(crapsSide === 'pass')} onClick={() => setCrapsSide('pass')}>
                  Pass
                </button>
                <button type="button" className={chipClass(crapsSide === 'dont')} onClick={() => setCrapsSide('dont')}>
                  Don&apos;t pass
                </button>
              </div>
            </div>

            <div className="sim-control">
              <span className="sim-label">System</span>
              <div className="sim-chip-row" role="group" aria-label="System">
                <button
                  type="button"
                  className={chipClass(crapsStyle === 'single')}
                  onClick={() => setCrapsStyle('single')}
                >
                  One bet
                </button>
                <button
                  type="button"
                  className={chipClass(crapsStyle === 'molly')}
                  onClick={() => setCrapsStyle('molly')}
                >
                  3-point molly
                </button>
              </div>
            </div>

            <div className="sim-control">
              <span className="sim-label">Odds</span>
              <div className="sim-chip-row" role="group" aria-label="Odds">
                <button type="button" className={chipClass(crapsOdds)} onClick={() => setCrapsOdds(true)}>
                  On
                </button>
                <button type="button" className={chipClass(!crapsOdds)} onClick={() => setCrapsOdds(false)}>
                  Off
                </button>
              </div>
              <span className="sim-note">
                {crapsSide === 'pass'
                  ? '1× on 4 and 10, 2× on 5, 6, 8, 9'
                  : 'Lay to win 1× on 4 and 10, 2× on 5, 6, 8, 9'}
              </span>
            </div>

            <div className="sim-control">
              <span className="sim-label">Side bets (per round)</span>
              {SIDE_BET_TABLE.map((b) => (
                <div className="sim-dollar-row" key={b.id}>
                  <span className="sim-dollar">$</span>
                  <input
                    className="sim-input"
                    inputMode="numeric"
                    value={sideText[b.id]}
                    onChange={(e) =>
                      setSideText((s) => ({ ...s, [b.id]: e.target.value.replace(/[^0-9]/g, '') }))
                    }
                    aria-label={`${b.name} side bet in whole dollars`}
                  />
                  <span className="sim-note">{b.name}</span>
                </div>
              ))}
              {sideAny && (
                <>
                  <span className="sim-note">
                    Side bets are placed at the start and after every 7; they lose on a 7 and pay as soon
                    as every number is in. Session results with side bets are simulated only.
                  </span>
                  {!SIDE_BETS_CONFIRMED && (
                    <span className="sim-note">
                      Pays (31 for 1, 151 for 1) are from memory, not yet photographed.
                    </span>
                  )}
                </>
              )}
            </div>
          </>
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

      {g.id === 'craps' && (sideAny || adviceHasNull || exactHasNull) && (
        <p className="sim-note">
          {sideAny
            ? "Exact odds aren't available with side bets; the simulated results above still apply."
            : 'Too long a molly session to compute exactly; the simulated results above still apply.'}
        </p>
      )}

      <p className="sim-footnote">
        {g.id === 'craps' ? (
          <>
            Craps is played roll by roll from exact dice odds. A 3-point molly keeps a line bet and up to
            two come bets working. Pass-side come odds are off on the come-out roll; lay odds always work.
            When the session stops (goal, loss limit, or time), you stop betting and the bets already out
            play to the end, so results are what you&apos;d leave with. If your bankroll can&apos;t cover a
            bet plus its odds, you bet without odds or skip the come bet.{' '}
          </>
        ) : (
          <>
            Each round is drawn from exact odds: blackjack is infinite-deck basic strategy for these rules.
            When your bankroll can&apos;t cover a full round you play a smaller one (no split or double).{' '}
          </>
        )}
        Exact columns are computed, not simulated. No comps: table and machine ratings aren&apos;t modeled.
        {g.id === 'bj-machine' &&
          ' Machine rules other than 6:5 and hitting soft 17 are assumed to match the table.'}
      </p>
    </>
  );
}
