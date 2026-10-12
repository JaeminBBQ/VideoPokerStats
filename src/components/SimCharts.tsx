import { useEffect, useRef, useState, type RefObject } from 'react';
import { formatCents } from '../lib/bankroll.ts';
import {
  axisDollars,
  centsTicks,
  histogram,
  hourTicks,
  niceCentsStep,
  pathCentsAt,
} from '../lib/simChart.ts';
import type { SessionRun } from '../lib/simulate.ts';
import { EVENT_COLORS, heldText } from './simShared.ts';

/**
 * The Simulator tab's charts, shared by the video poker and table-game simulators (T017).
 * Geometry helpers stay in src/lib/simChart.ts; these are the SVG components.
 */

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

/**
 * The bankroll line chart for one simulated session. The x axis is hours = round / roundsPerHour
 * (video poker passes 600). `events` are the marker-worthy hands (video poker only).
 */
export function SessionChart({
  path,
  events = [],
  budgetCents,
  winGoalCents,
  lossLimitCents,
  maxRounds,
  roundsPerHour,
}: {
  path: SessionRun['path'];
  events?: SessionRun['events'];
  budgetCents: number;
  winGoalCents: number | null;
  lossLimitCents: number | null;
  maxRounds: number;
  roundsPerHour: number;
}) {
  const [wrapRef, width] = useChartWidth<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const H = 200;
  const TOP = 8;
  const BOTTOM = 22;
  const RIGHT = 12;

  const goal = winGoalCents === null ? null : budgetCents + winGoalCents;
  const loss = lossLimitCents === null ? null : budgetCents - lossLimitCents;
  let lo = budgetCents;
  let hi = budgetCents;
  for (const q of path) {
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
  const xTicks = hourTicks(maxRounds / roundsPerHour);
  const left = Math.min(84, 32 + Math.max(...yTicks.map((v) => axisDollars(v).length)) * 6.2);
  const plotW = Math.max(width - left - RIGHT, 1);
  const plotH = H - TOP - BOTTOM;
  const X = (round: number) => left + (round / maxRounds) * plotW;
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
            <line
              x1={X(t * roundsPerHour)}
              x2={X(t * roundsPerHour)}
              y1={TOP}
              y2={TOP + plotH}
              stroke="rgba(255,255,255,0.05)"
            />
            <text x={X(t * roundsPerHour)} y={H - 8} textAnchor="middle" className="sim-axis">
              {String(t)}h
            </text>
          </g>
        ))}
        <line x1={left} x2={left + plotW} y1={Y(budgetCents)} y2={Y(budgetCents)} className="sim-ref" />
        <text x={left + plotW - 2} y={Y(budgetCents) - 3} textAnchor="end" className="sim-ref-label">
          start {axisDollars(budgetCents)}
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
          points={path.map((q) => `${X(q.hand).toFixed(1)},${Y(q.cents).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#e6c15c"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        {events.map((e) => {
          const cy = pathCentsAt(path, e.hand);
          if (cy === null) return null;
          const x = X(e.hand);
          const y = Y(cy);
          const color = EVENT_COLORS[e.category] ?? '#9db3a0';
          const held = heldText(e.held);
          const text = `${e.label} +${formatCents(e.winCents)} at hand ${e.hand}${held === '' ? '' : ` · ${held}`}`;
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
export function Histogram({ nets }: { nets: number[] }) {
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
