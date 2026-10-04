/**
 * Drill support: describe a mistake in chart vocabulary and find fresh hands that pose the same
 * decision (D6). "Similar" = same chart section, the same best line, and the line the player
 * wrongly chose is available again but still wrong.
 */
import { deal, rankOf, type Card, type Rng } from './cards.ts';
import { holdEvs, EV_EPSILON, type Tables } from './ev.ts';
import type { GameDef } from './games.ts';
import { deucesPattern, deucesSection, type Pattern } from './strategy.ts';

export const hasChart = (game: GameDef): boolean => game.rows.some((r) => r.key === 'four-deuces');

/** Chart-line name for a hold, or null for games without a classifier yet. */
export function patternFor(game: GameDef, held: readonly Card[]): Pattern | null {
  return hasChart(game) ? deucesPattern(game, held) : null;
}

/** What a mistake was about. `chosenKey` null = not classifiable; drills then reuse the same hand shape. */
export interface MistakeSignature {
  section: number;
  bestKey: string;
  chosenKey: string;
  bestLabel: string;
  chosenLabel: string;
}

export function mistakeSignature(game: GameDef, hand: readonly Card[], bestMask: number, heldMask: number): MistakeSignature | null {
  if (!hasChart(game)) return null;
  const pick = (m: number) => hand.filter((_, i) => m & (1 << i));
  const best = deucesPattern(game, pick(bestMask));
  const chosen = deucesPattern(game, pick(heldMask));
  return { section: deucesSection(hand), bestKey: best.key, chosenKey: chosen.key, bestLabel: best.label, chosenLabel: chosen.label };
}

export type SimilarMatch = 'exact' | 'best-line' | 'section';

/** Deals a hand with exactly `deuces` deuces (deuces games' chart sections). */
function dealWithDeuces(deuces: number, rng: Rng): Card[] {
  const deuceCards = deal(4, rng, deuces); // 0..3 are the four deuces
  const rest = deal(52, rng, 9).filter((c) => rankOf(c) !== 0).slice(0, 5 - deuces);
  if (rest.length < 5 - deuces) return dealWithDeuces(deuces, rng);
  const hand = [...deuceCards, ...rest];
  // Shuffle positions so deuces aren't always on the left.
  for (let i = hand.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [hand[i], hand[j]] = [hand[j], hand[i]];
  }
  return hand;
}

/**
 * Finds a random hand posing the same decision as `sig`. Tries for an exact match (same best line,
 * chosen line present and wrong), then relaxes to the same best line, then the same section.
 * Each try is a few microseconds; rare confusions may need thousands.
 */
export function findSimilarHand(t: Tables, sig: MistakeSignature, rng: Rng = Math.random, maxTries = 30_000): { hand: Card[]; match: SimilarMatch } {
  const game = t.game;
  let fallbackBest: Card[] | null = null;
  let fallbackSection: Card[] | null = null;
  for (let i = 0; i < maxTries; i++) {
    const hand = dealWithDeuces(sig.section, rng);
    fallbackSection ??= hand;
    const evs = holdEvs(t, hand);
    let best = 0;
    for (let m = 1; m < 32; m++) if (evs[m] > evs[best]) best = m;
    const pick = (m: number) => hand.filter((_, k) => m & (1 << k));
    if (deucesPattern(game, pick(best)).key !== sig.bestKey) continue;
    fallbackBest ??= hand;
    for (let m = 0; m < 32; m++) {
      if (evs[best] - evs[m] > EV_EPSILON && deucesPattern(game, pick(m)).key === sig.chosenKey) return { hand, match: 'exact' };
    }
  }
  if (fallbackBest) return { hand: fallbackBest, match: 'best-line' };
  return { hand: fallbackSection!, match: 'section' };
}

/**
 * The same hand in disguise: random suit relabeling and card order (the joker stays the joker).
 * Strategically identical; used for games without a chart classifier.
 */
export function disguiseHand(hand: readonly Card[], rng: Rng = Math.random): Card[] {
  const perm = deal(4, rng, 4);
  const out = hand.map((c) => (c === 52 ? c : (c & ~3) | perm[c & 3]));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
