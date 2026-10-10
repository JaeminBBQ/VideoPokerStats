import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { EngineClient, GameDef, GameId, Venue } from '../engine/index.ts';
import type { LeaveOdds } from '../engine/leave.ts';
import { formatCents } from '../lib/bankroll.ts';
import { ODDS_BY_GAME } from '../lib/odds.ts';
import {
  axisDollars,
  centsTicks,
  clockFromHands,
  edgePct,
  histogram,
  hoursText,
  hourTicks,
  niceCentsStep,
  pathCentsAt,
  pct1,
} from '../lib/simChart.ts';
import {
  compRatePerMultiplier,
  exactForAsync,
  leaveAdviceAsync,
  returnAndBreakEven,
  runMany,
  runSession,
  type EndReason,
  type LeaveAdviceRow,
  type ManyRuns,
  type SessionRun,
  type SimParams,
} from '../lib/simulate.ts';

interface Props {
  game: GameDef;
  gameId: GameId;
  engine: EngineClient;
  /** Current max bet in cents (denomination × maxCoins, per-machine). */
  bet: number;
  denomination: number;
  maxCoins: number;
}

const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
const MISTAKE_OPTIONS = [0, 0.5, 1, 2, 5];
const MULTIPLIER_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

type GoalMode = 'none' | 'p25' | 'p50' | 'double' | 'custom';
const GOAL_FRACTIONS: Record<Exclude<GoalMode, 'none' | 'custom'>, number> = { p25: 0.25, p50: 0.5, double: 1 };

/** The owner's tier: GSR Premier 2× everyday, no Legends Bay tier (D24). */
const DEFAULT_MULTIPLIER: Record<Venue, number> = { GSR: 2, 'Legends Bay': 1 };

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
};

/** Marker colors by hand category (the ones `simulate.ts` records as events). */
const EVENT_COLORS: Record<string, string> = {
  royal: '#e6c15c',
  'four-deuces': '#4ade80',
  'wild-royal': '#c084fc',
  'five-kind': '#60a5fa',
  'straight-flush': '#2dd4bf',
  'four-kind': '#fb923c',
};

const END_ROWS: { key: EndReason; label: string; exact: (o: LeaveOdds) => number }[] = [
  { key: 'win', label: 'Hit the goal', exact: (o) => o.pWin },
  { key: 'loss-limit', label: 'Hit the loss limit', exact: (o) => o.pLossLimit },
  { key: 'broke', label: 'Out of money', exact: (o) => o.pBroke },
  { key: 'time', label: 'Time ran out', exact: (o) => o.pTime },
];

/** Container width so SVG text stays fixed-size at any screen width. */
function useChartWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** A 5-point star polygon for royal markers. */
function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const ang = (Math.PI / 5) * k - Math.PI / 2;
    const rad = k % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** The bankroll line chart for one simulated session. */
function SessionChart({ run, p }: { run: SessionRun; p: SimParams }) {
  const [wrapRef, width] = useChartWidth<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const H = 200;
  const TOP = 8;
  const BOTTOM = 22;
  const RIGHT = 12;

  const goal = p.winGoalCents === null ? null : p.budgetCents + p.winGoalCents;
  const loss = p.lossLimitCents === null ? null : p.budgetCents - p.lossLimitCents;
  let lo = p.budgetCents;
  let hi = p.budgetCents;
  for (const q of run.path) {
    if (q.cents < lo) lo = q.cents;
    if (q.cents > hi) hi = q.cents;
  }
  if (goal !== null) {
    lo = Math.min(lo, goal);
    hi = Math.max(hi, goal);
  }
  if (loss !== null) {
    lo = Math.min(lo, loss);
    hi = Math.max(hi, loss);
  }
  const pad = Math.max((hi - lo) * 0.05, 100);
  // A bankroll never goes below 0, so the axis stops there (broke sits on the bottom edge).
  lo = Math.max(lo - pad, 0);
  hi += pad;
  const step = niceCentsStep(hi - lo);
  const yTicks = centsTicks(lo, hi, step);
  const xTicks = hourTicks(p.maxHands / 600);
  const left = Math.min(84, 32 + Math.max(...yTicks.map((v) => axisDollars(v).length)) * 6.2);
  const plotW = Math.max(width - left - RIGHT, 1);
  const plotH = H - TOP - BOTTOM;
  const X = (hand: number) => left + (hand / p.maxHands) * plotW;
  const Y = (cents: number) => TOP + ((hi - cents) / (hi - lo)) * plotH;

  // Keep the tooltip inside the chart: clamp by its estimated width (~6.2px/char at this font).
  const showTip = (x: number, y: number, text: string): { x: number; y: number; text: string } => {
    const half = Math.min((text.length * 6.2 + 18) / 2 / width, 0.45);
    return { x: Math.min(Math.max(x, half), 1 - half), y: Math.max(y, 0.02), text };
  };

  if (width < 40) return <div ref={wrapRef} className="sim-chart-wrap" style={{ height: H }} />;

  return (
    <div ref={wrapRef} className="sim-chart-wrap">
      <svg width={width} height={H} role="img" aria-label="Session bankroll chart">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={left} x2={left + plotW} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,0.05)" />
            <text x={left - 6} y={Y(v) + 3.5} textAnchor="end" className="sim-axis">
              {axisDollars(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t}>
            <line x1={X(t * 600)} x2={X(t * 600)} y1={TOP} y2={TOP + plotH} stroke="rgba(255,255,255,0.05)" />
            <text x={X(t * 600)} y={H - 8} textAnchor="middle" className="sim-axis">
              {String(t)}h
            </text>
          </g>
        ))}
        <line x1={left} x2={left + plotW} y1={Y(p.budgetCents)} y2={Y(p.budgetCents)} className="sim-ref" />
        <text x={left + plotW - 2} y={Y(p.budgetCents) - 3} textAnchor="end" className="sim-ref-label">
          start {axisDollars(p.budgetCents)}
        </text>
        {goal !== null && (
          <>
            <line x1={left} x2={left + plotW} y1={Y(goal)} y2={Y(goal)} className="sim-ref goal" />
            <text x={left + plotW - 2} y={Y(goal) - 3} textAnchor="end" className="sim-ref-label goal">
              goal {axisDollars(goal)}
            </text>
          </>
        )}
        {loss !== null && (
          <>
            <line x1={left} x2={left + plotW} y1={Y(loss)} y2={Y(loss)} className="sim-ref loss" />
            <text x={left + plotW - 2} y={Y(loss) - 3} textAnchor="end" className="sim-ref-label loss">
              loss {axisDollars(loss)}
            </text>
          </>
        )}
        <polyline
          points={run.path.map((q) => `${X(q.hand).toFixed(1)},${Y(q.cents).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#e6c15c"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        {run.events.map((e) => {
          const cy = pathCentsAt(run.path, e.hand);
          if (cy === null) return null;
          const x = X(e.hand);
          const y = Y(cy);
          const color = EVENT_COLORS[e.category] ?? '#9db3a0';
          const text = `${e.label} +${formatCents(e.winCents)} at hand ${e.hand}`;
          return (
            <g
              key={`${e.hand}-${e.label}`}
              className="sim-event"
              onPointerEnter={(ev) => {
                if (ev.pointerType === 'mouse') setTip(showTip(x / width, y / H, text));
              }}
              onPointerLeave={(ev) => {
                if (ev.pointerType === 'mouse') setTip(null);
              }}
              onClick={() =>
                setTip((t) => (t !== null && t.text === text ? null : showTip(x / width, y / H, text)))
              }
            >
              <circle cx={x} cy={y} r={10} fill="transparent" />
              {e.category === 'royal' ? (
                <polygon points={starPoints(x, y, 6)} fill={color} />
              ) : (
                <circle cx={x} cy={y} r={3} fill={color} />
              )}
            </g>
          );
        })}
      </svg>
      {tip !== null && (
        <div className="sim-tip" style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

/** Histogram of 1,000 session results: red below zero, green above. */
function Histogram({ nets }: { nets: number[] }) {
  const [wrapRef, width] = useChartWidth<HTMLDivElement>();
  const H = 140;
  const TOP = 6;
  const BOTTOM = 18;
  const SIDE = 4;
  const bars = histogram(nets, 20);
  const first = bars[0];
  const last = bars[bars.length - 1];
  const maxCount = Math.max(...bars.map((b) => b.count), 1);

  if (width < 40) return <div ref={wrapRef} className="sim-hist-wrap" style={{ height: H }} />;

  const plotW = Math.max(width - 2 * SIDE, 1);
  const plotH = H - TOP - BOTTOM;
  const range = last.to - first.from || 1;
  const bw = plotW / bars.length;
  const zeroInRange = first.from <= 0 && last.to >= 0;
  const zeroX = SIDE + ((0 - first.from) / range) * plotW;

  return (
    <div ref={wrapRef} className="sim-hist-wrap">
      <svg width={width} height={H} role="img" aria-label="Histogram of 1,000 session results">
        {bars.map((b, i) => {
          const h = (b.count / maxCount) * plotH;
          const mid = (b.from + b.to) / 2;
          return (
            <rect
              key={i}
              x={SIDE + i * bw + 0.5}
              y={TOP + plotH - h}
              width={bw - 1}
              height={Math.max(h, b.count > 0 ? 1 : 0)}
              fill={mid < 0 ? 'rgba(248,113,113,0.72)' : 'rgba(74,222,128,0.72)'}
            />
          );
        })}
        {zeroInRange && (
          <line
            x1={zeroX}
            x2={zeroX}
            y1={TOP}
            y2={TOP + plotH}
            stroke="rgba(255,255,255,0.4)"
            strokeDasharray="4 3"
          />
        )}
        <text x={SIDE} y={H - 6} className="sim-axis">
          {formatCents(first.from)}
        </text>
        <text x={SIDE + plotW} y={H - 6} textAnchor="end" className="sim-axis">
          {formatCents(last.to)}
        </text>
      </svg>
    </div>
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

export default function SimulatorTab({ game, gameId, engine, bet }: Props) {
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
      <section className="panel sim-panel">
        <h2>Simulator — {game.name}</h2>
        <p>Odds for this game are coming; the simulator needs them to draw hands from exact play.</p>
      </section>
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
    <section className="panel sim-panel">
      <h2>Simulator — {game.name}</h2>

      <p className="sim-edge">
        Return {edgePct(edge.ret)} + points {edgePct(compRate)} ={' '}
        <strong className="sim-edge-total">{edgePct(total)}</strong>
        {hasEdge ? (
          <span className="sim-edge-win"> — you have the edge</span>
        ) : (
          <>
            . The house keeps {edgePct(1 - total)}%. Break-even needs {edgePct(edge.breakEvenCompRate)} back
            (about {(edge.breakEvenCompRate / compRatePerMultiplier(game.venue)).toFixed(1)}× points).
          </>
        )}
      </p>

      <div className="sim-inputs">
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
          <SessionChart run={oneRun.run} p={oneRun.p} />
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
    </section>
  );
}
