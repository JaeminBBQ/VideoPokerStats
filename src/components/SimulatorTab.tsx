import { useEffect, useMemo, useState } from 'react';
import { offerAt, type EngineClient, type GameDef, type GameId, type Venue } from '../engine/index.ts';
import type { LeaveOdds } from '../engine/leave.ts';
import { formatCents } from '../lib/bankroll.ts';
import { ODDS_BY_GAME } from '../lib/odds.ts';
import { clockFromHands, edgePct, hoursText, pct1 } from '../lib/simChart.ts';
import {
  compRatePerMultiplier,
  exactForAsync,
  leaveAdviceAsync,
  returnAndBreakEven,
  runMany,
  runSession,
  type LeaveAdviceRow,
  type ManyRuns,
  type SessionRun,
  type SimParams,
} from '../lib/simulate.ts';
import { DENOM_LABELS } from '../lib/storage.ts';
import type { TableSimId } from '../lib/tableSim.ts';
import { Histogram, SessionChart } from './SimCharts.tsx';
import { END_ROWS, EVENT_COLORS, GOAL_FRACTIONS, heldText, HOUR_OPTIONS, type GoalMode } from './simShared.ts';
import TableSimulator from './TableSimulator.tsx';

interface Props {
  game: GameDef;
  gameId: GameId;
  engine: EngineClient;
  /** Current max bet in cents (denomination × maxCoins, per-machine). */
  bet: number;
  denomination: number;
  maxCoins: number;
  onDenominationChange: (d: number) => void;
}

const MISTAKE_OPTIONS = [0, 0.5, 1, 2, 5];
const MULTIPLIER_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

/** The four games on the Simulator tab: the video poker machine plus the three table games (D29). */
const GAME_CHIPS: { id: 'vp' | TableSimId; label: string }[] = [
  { id: 'vp', label: 'Video poker' },
  { id: 'bj-table', label: 'Blackjack $15' },
  { id: 'bj-machine', label: 'Blackjack $3 machine' },
  { id: 'craps', label: 'Craps $3' },
];

/** The owner's tier: GSR Premier 2× everyday, no Legends Bay tier (D24). */
const DEFAULT_MULTIPLIER: Record<Venue, number> = { GSR: 2, 'Legends Bay': 1, "Dotty's": 1 };

/** Multiplier hint and points rate per venue (D24; the rate feeds the footnote). */
const VENUE_POINTS: Record<Venue, { hint: string; rate: string }> = {
  GSR: {
    hint: "Premier: everyday 2× · Thursday 4× · Sunday 5× (promos replace your tier rate, they don't stack). 1 point per $2, 1,000 points = $1.",
    rate: '1 per $2, 1,000 = $1',
  },
  'Legends Bay': {
    hint: 'Everyday 1× · Monster Multiplier Mondays 3×–5× (spin to reveal; points days capped at 10,000 points). 1 point per $6, 100 points = $1.',
    rate: '1 per $6, 100 = $1',
  },
  "Dotty's": {
    hint: "Dotty's points aren't modeled yet (no confirmed rate), so comps count as zero here.",
    rate: 'not modeled',
  },
};

/** The biggest hands of the session with what was held, in hand order (markers are tiny on a phone). */
function BigHands({ events }: { events: SessionRun['events'] }) {
  if (events.length === 0) {
    return <p className="sim-big-none">No four of a kind or better this session.</p>;
  }
  const top = [...events].sort((a, b) => b.winCents - a.winCents || a.hand - b.hand).slice(0, 8);
  const more = events.length - top.length;
  top.sort((a, b) => a.hand - b.hand);
  return (
    <ul className="sim-big-hands">
      {top.map((e) => {
        const held = heldText(e.held);
        return (
          <li key={`${e.hand}-${e.label}`}>
            <span
              className="sim-big-dot"
              style={{ background: EVENT_COLORS[e.category] ?? '#9db3a0' }}
              aria-hidden="true"
            />
            <span>
              Hand {e.hand} · {e.label} +{formatCents(e.winCents)}
              {held !== '' && <span className="sim-big-held"> · {held}</span>}
            </span>
          </li>
        );
      })}
      {more > 0 && <li className="sim-big-more">+{more} more</li>}
    </ul>
  );
}

/** What happened to the one session, in the spec's words. */
function endMessage(run: SessionRun, p: SimParams): string {
  switch (run.end) {
    case 'win':
      return `Hit your goal after ${clockFromHands(run.hands)}`;
    case 'loss-limit':
      return `Hit your loss limit after ${clockFromHands(run.hands)}`;
    case 'broke':
      return `Out of money after ${clockFromHands(run.hands)}`;
    case 'time':
      return `Played the full ${p.maxHands / 600} hours`;
  }
}

/** The video poker simulator, exactly as before (T017 moved its charts to SimCharts.tsx). */
function VideoPokerSimulator(props: Props) {
  const { game, gameId, engine, bet, denomination, maxCoins, onDenominationChange } = props;
  const rows = ODDS_BY_GAME[gameId]?.perRow ?? null;

  // Inputs: scratch state, not persisted.
  const [budgetText, setBudgetText] = useState('100');
  const [goalMode, setGoalMode] = useState<GoalMode>('none');
  const [goalText, setGoalText] = useState('');
  const [lossMode, setLossMode] = useState<'none' | 'custom'>('none');
  const [lossText, setLossText] = useState('');
  const [hours, setHours] = useState(4);
  const [mistakePct, setMistakePct] = useState(0);
  const [multiplier, setMultiplier] = useState(DEFAULT_MULTIPLIER[game.venue]);

  const [oneRun, setOneRun] = useState<{ run: SessionRun; p: SimParams } | null>(null);
  const [manyRun, setManyRun] = useState<{ m: ManyRuns; p: SimParams } | null>(null);
  // Keyed by the run they were computed for: a fresh run shows "…" until its exact odds land.
  const [exactMany, setExactMany] = useState<{ m: ManyRuns; odds: LeaveOdds | null } | null>(null);
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
  const maxHands = Math.round(hours * 600);
  const errorRate = mistakePct / 100;
  const compRate = compRatePerMultiplier(game.venue) * multiplier;

  const edge = useMemo(() => (rows === null ? null : returnAndBreakEven(rows, errorRate)), [rows, errorRate]);
  const params = useMemo<SimParams | null>(
    () =>
      rows === null
        ? null
        : { rows, errorRate, betCents: bet, budgetCents, winGoalCents, lossLimitCents, maxHands, compRate },
    [rows, errorRate, bet, budgetCents, winGoalCents, lossLimitCents, maxHands, compRate],
  );

  // "When to leave": exact odds for six rules, off-thread. Comps don't change the leave math
  // (they're passed through, so a multiplier change just recomputes the same rows).
  const adviceKey = rows === null ? '' : `${gameId}|${errorRate}|${bet}|${budgetCents}|${maxHands}`;
  useEffect(() => {
    if (rows === null || budgetCents <= 0) return;
    let cancelled = false;
    leaveAdviceAsync(engine, { rows, errorRate, betCents: bet, budgetCents, maxHands, compRate })
      .then((r) => {
        if (!cancelled) setAdviceResult({ key: adviceKey, rows: r, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setAdviceResult({ key: adviceKey, rows: null, error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [engine, rows, errorRate, bet, budgetCents, maxHands, compRate, adviceKey]);

  // The exact column beside the 1,000-session summary: the same rule, computed by the worker.
  useEffect(() => {
    if (manyRun === null) return;
    let cancelled = false;
    const { p, m } = manyRun;
    exactForAsync(engine, p)
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

  if (rows === null || edge === null || params === null) {
    return (
      <>
        <h2>Simulator — {game.name}</h2>
        <p>Odds for this game are coming; the simulator needs them to draw hands from exact play.</p>
      </>
    );
  }

  const total = edge.ret + compRate;
  const hasEdge = total >= 1;
  const lossPerHour = 600 * bet * (1 - edge.ret - compRate);
  const chipClass = (active: boolean) => `sim-chip${active ? ' active' : ''}`;

  const runOne = () => setOneRun({ run: runSession(params, Date.now()), p: params });
  const runAThousand = () => setManyRun({ m: runMany(params, 1000, Date.now()), p: params });

  // Results are only shown once they match the inputs (or the run) they were computed for.
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

  return (
    <>
      <h2>Simulator — {game.name}</h2>

      <p className="sim-edge">
        Return {edgePct(edge.ret)} + points {edgePct(compRate)} ={' '}
        <strong className="sim-edge-total">{edgePct(total)}</strong>
        {hasEdge ? (
          <span className="sim-edge-win"> — you have the edge</span>
        ) : (
          <>
            . The house keeps {edgePct(1 - total)}%. Break-even needs {edgePct(edge.breakEvenCompRate)} back
            {compRatePerMultiplier(game.venue) > 0 &&
              ` (about ${(edge.breakEvenCompRate / compRatePerMultiplier(game.venue)).toFixed(1)}× points)`}
            .
          </>
        )}
      </p>

      <div className="sim-inputs">
        <div className="sim-control">
          <span className="sim-label">Denomination</span>
          <div className="sim-chip-row" role="group" aria-label="Denomination">
            {game.offers.map((o) => (
              <button
                key={o.denomination}
                type="button"
                className={chipClass(o.denomination === denomination)}
                onClick={() => onDenominationChange(o.denomination)}
              >
                {DENOM_LABELS[o.denomination]}
                {!o.confirmed && <span className="denom-unconfirmed">*</span>}
                <span className="sim-chip-bet"> · {formatCents(Math.round(o.denomination * o.maxCoins * 100)).replace(/\.00$/, '')}</span>
              </button>
            ))}
          </div>
          <span className="sim-note">
            {DENOM_LABELS[denomination]} × {maxCoins} coins = {formatCents(bet)} a hand
          </span>
          {offerAt(game, denomination)?.progressive && (
            <span className="sim-note">
              Progressive royal at this denomination: simulated at the base 800 per coin, so results are a
              little low when the meter is up.
            </span>
          )}
        </div>

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
          <span className="sim-note">≈ {maxHands.toLocaleString('en-US')} hands at 600/hour</span>
        </div>

        <div className="sim-control">
          <span className="sim-label">Mistake rate</span>
          <select
            className="sim-select"
            value={mistakePct}
            onChange={(e) => setMistakePct(Number(e.target.value))}
            aria-label="Mistake rate"
          >
            {MISTAKE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}%
              </option>
            ))}
          </select>
          <span className="sim-note">a mistake = the best wrong hold</span>
        </div>

        <div className="sim-control">
          <span className="sim-label">Points multiplier</span>
          <select
            className="sim-select"
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            aria-label="Points multiplier"
          >
            {MULTIPLIER_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}×
              </option>
            ))}
          </select>
          <span className="sim-note sim-venue-hint">{VENUE_POINTS[game.venue].hint}</span>
        </div>
      </div>

      <h3>Run one session</h3>
      <div className="sim-actions">
        <button type="button" className="btn primary" onClick={runOne} disabled={budgetCents <= 0}>
          Run one session
        </button>
      </div>
      {oneRun !== null && (
        <div className="sim-result">
          <SessionChart
            path={oneRun.run.path}
            events={oneRun.run.events}
            budgetCents={oneRun.p.budgetCents}
            winGoalCents={oneRun.p.winGoalCents}
            lossLimitCents={oneRun.p.lossLimitCents}
            maxRounds={oneRun.p.maxHands}
            roundsPerHour={600}
          />
          <BigHands events={oneRun.run.events} />
          <p className="sim-end">{endMessage(oneRun.run, oneRun.p)}</p>
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
              <div className="stat-value">+{formatCents(oneRun.run.compsCents)}</div>
              <div className="stat-label">Comps</div>
            </div>
            <div className="stat">
              <div className="stat-value">{formatCents(oneRun.run.coinInCents)}</div>
              <div className="stat-label">Coin-in</div>
            </div>
          </div>
        </div>
      )}

      <h3>Run 1,000 sessions</h3>
      <div className="sim-actions">
        <button type="button" className="btn" onClick={runAThousand} disabled={budgetCents <= 0}>
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
                <th>Average comps</th>
                <td>{formatCents(manyRun.m.avgCompsCents)}</td>
                <td>{exactCell((o) => formatCents(o.expHands * manyRun.p.betCents * manyRun.p.compRate))}</td>
              </tr>
              <tr>
                <th>Average time</th>
                <td>{hoursText(manyRun.m.avgHands / 600)} h</td>
                <td>{exactCell((o) => `${hoursText(o.expHands / 600)} h`)}</td>
              </tr>
            </tbody>
          </table>
          <Histogram nets={manyRun.m.nets} />
        </div>
      )}

      <h3>When to leave</h3>
      <p className="sim-advice-expl">
        {lossPerHour < 0 ? (
          <>
            You earn about <strong>{formatCents(-lossPerHour)}</strong> an hour on average
          </>
        ) : (
          <>
            You lose about <strong>{formatCents(lossPerHour)}</strong> an hour on average
          </>
        )}{' '}
        whichever rule you pick (house edge × money bet). Leave rules only change <em>how</em> sessions end.
        Quitting at a goal makes winning trips more common, and a loss limit means you never bust. Neither
        changes the hourly cost. The cheapest session is a shorter one.
      </p>
      {hasEdge && (
        <p className="sim-advice-edge">With these comps the math is on your side: longer sessions earn more on average.</p>
      )}
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
                    <td>{formatCents(r.odds.expNetBets * bet)}</td>
                    <td>{hoursText(r.odds.expHands / 600)} h</td>
                    <td>{pct1(r.odds.pBroke)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : budgetCents <= 0 ? (
        <p className="sim-advice-none">Enter a budget to see leave advice.</p>
      ) : (
        <p className="status">Computing…</p>
      )}

      <p className="sim-footnote">
        Simulated hands are drawn from the exact perfect-play odds (or the mistake rate you set), which is
        statistically the same as dealing and playing them. Exact columns are computed, not simulated. Max
        bet every hand. Points: {VENUE_POINTS[game.venue].rate}. The multiplier assumes it applies to
        redeemable points.
      </p>
    </>
  );
}

export default function SimulatorTab(props: Props) {
  // The game choice is scratch state (not persisted). Changing the video poker game remounts the tab
  // (App keys it by gameId), which resets the choice to video poker — fine per the task.
  const [simGame, setSimGame] = useState<'vp' | TableSimId>('vp');
  const chipClass = (active: boolean) => `sim-chip${active ? ' active' : ''}`;

  return (
    <section className="panel sim-panel">
      <div className="sim-control sim-game-switch">
        <span className="sim-label">Game</span>
        <div className="sim-chip-row" role="group" aria-label="Game">
          {GAME_CHIPS.map((c) => (
            <button key={c.id} type="button" className={chipClass(c.id === simGame)} onClick={() => setSimGame(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {simGame === 'vp' ? (
        <VideoPokerSimulator {...props} />
      ) : (
        <TableSimulator key={simGame} engine={props.engine} gameId={simGame} />
      )}
    </section>
  );
}
