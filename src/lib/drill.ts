import { EV_EPSILON, mistakeSignature, type GameDef, type GameId, type MistakeSignature, type Rng } from '../engine/index.ts';
import type { HandRecord } from './stats.ts';

/** One recurring mistake: everything the drill flow needs to re-pose the decision. */
export interface Confusion {
  key: string;
  /** Chart vocabulary for the mistake, or null for games without a chart. */
  signature: MistakeSignature | null;
  count: number;
  evLost: number;
  lastTs: number;
  example: HandRecord;
}

/**
 * Stable group key for a mistake. Chart games use (section, best line, chosen line); other games
 * use the dealt hand and held cards sorted, so the same mistake groups regardless of deal order.
 */
export function confusionKey(record: HandRecord, game: GameDef): string {
  const sig = mistakeSignature(game, record.hand, record.bestMask, record.heldMask);
  if (sig) return `${sig.section}|${sig.bestKey}|${sig.chosenKey}`;
  const hand = [...record.hand].sort((a, b) => a - b).join(',');
  const held = record.hand
    .filter((_, i) => record.heldMask & (1 << i))
    .sort((a, b) => a - b)
    .join(',');
  return `hand:${hand}|${held}`;
}

/** Groups one game's mistakes (deal and drill records), most expensive first. */
export function groupConfusions(history: readonly HandRecord[], game: GameDef): Confusion[] {
  const groups = new Map<string, Confusion>();
  for (const r of history) {
    if (r.gameId !== game.id) continue;
    const lost = r.evBest - r.evHeld;
    if (lost <= EV_EPSILON) continue;
    const key = confusionKey(r, game);
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.evLost += lost;
      if (r.ts >= g.lastTs) {
        g.lastTs = r.ts;
        g.example = r;
      }
    } else {
      groups.set(key, {
        key,
        signature: mistakeSignature(game, r.hand, r.bestMask, r.heldMask),
        count: 1,
        evLost: lost,
        lastTs: r.ts,
        example: r,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.evLost - a.evLost || b.lastTs - a.lastTs);
}

/** Per-game drill progress, keyed by confusion key. Persisted at `vp.v1.drill` (docs/ARCHITECTURE.md). */
export type DrillState = Partial<Record<GameId, Record<string, { streak: number; cleared: boolean }>>>;

const CLEAR_AT = 3;

function setEntry(state: DrillState, gameId: GameId, key: string, value: { streak: number; cleared: boolean }): DrillState {
  return { ...state, [gameId]: { ...(state[gameId] ?? {}), [key]: value } };
}

/** Correct drills build a streak; the confusion clears after 3 in a row. A wrong drill resets it. */
export function applyDrillResult(state: DrillState, gameId: GameId, key: string, correct: boolean): DrillState {
  if (!correct) return setEntry(state, gameId, key, { streak: 0, cleared: false });
  const streak = (state[gameId]?.[key]?.streak ?? 0) + 1;
  return setEntry(state, gameId, key, { streak, cleared: streak >= CLEAR_AT });
}

/** A new Deal-mode mistake reopens its confusion (it comes back into the drill pool). */
export function applyNewMistake(state: DrillState, gameId: GameId, key: string): DrillState {
  const cur = state[gameId]?.[key];
  if (!cur || (!cur.cleared && cur.streak === 0)) return state;
  return setEntry(state, gameId, key, { streak: 0, cleared: false });
}

/**
 * Picks a confusion to drill: uncleared ones weighted by total EV lost, avoiding `lastKey` when
 * another is available. Null when the pool is empty.
 */
export function pickConfusion(
  confusions: readonly Confusion[],
  state: DrillState,
  gameId: GameId,
  rng: Rng,
  lastKey?: string,
): Confusion | null {
  const eligible = confusions.filter((c) => !state[gameId]?.[c.key]?.cleared);
  if (eligible.length === 0) return null;
  let pool = eligible;
  if (lastKey !== undefined && eligible.length > 1) {
    const rest = eligible.filter((c) => c.key !== lastKey);
    if (rest.length > 0) pool = rest;
  }
  const total = pool.reduce((s, c) => s + c.evLost, 0);
  let r = rng() * total;
  for (const c of pool) {
    r -= c.evLost;
    if (r <= 0) return c;
  }
  return pool[pool.length - 1];
}

/** Drill hands graded in this session for a game, and how many were optimal. */
export function drillSessionStats(
  history: readonly HandRecord[],
  gameId: GameId,
  sinceTs: number,
): { hands: number; correct: number } {
  let hands = 0;
  let correct = 0;
  for (const r of history) {
    if (r.gameId !== gameId || r.mode !== 'drill' || r.ts < sinceTs) continue;
    hands++;
    if (r.evBest - r.evHeld <= EV_EPSILON) correct++;
  }
  return { hands, correct };
}

