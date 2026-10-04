import type { Chart, GameId } from '../engine/index.ts';

/**
 * The generated strategy charts (src/charts/<id>.json), statically bundled. Games without a chart
 * classifier (Joker Poker so far) key to undefined and the UI shows a placeholder.
 */
const modules = import.meta.glob('../charts/*.json', { eager: true }) as Record<string, { default: Chart }>;

export const CHART_BY_GAME: Partial<Record<GameId, Chart>> = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.replace(/^.*\/([^/]+)\.json$/, '$1'), mod.default]),
) as Partial<Record<GameId, Chart>>;
