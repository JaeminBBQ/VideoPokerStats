/**
 * Hold-pattern classifier and strategy-chart generation (D5).
 *
 * A pattern names a hold the way a strategy chart does ("4 to a Royal", "Pair"). A chart is an
 * ordered pattern list per section (for deuces games, the number of deuces dealt); you play the
 * first line that matches one of your hand's holds. Charts are derived from exact EVs, then
 * replayed over every starting hand to measure what they give up versus perfect play.
 */
import { ACE, JACK, RANKS, TEN, rankOf, suitOf, type Card } from './cards.ts';
import { holdEvs, EV_EPSILON, BINOM, type Tables } from './ev.ts';
import type { GameDef } from './games.ts';

const ROYAL_RANKS = 0b1_1111_0000_0000;
const isDeuce = (c: Card) => rankOf(c) === 0;

/**
 * Straight windows as rank masks, 3-7 … T-A. Windows that include the 2 (A-5, 2-6) are left out:
 * in deuces wild that slot can only be filled by a deuce, so those straights are much harder to make.
 */
const WINDOWS = Array.from({ length: 8 }, (_, i) => 0b11111 << (i + 1));
const WHEEL_WINDOWS = [(1 << ACE) | 0b1111, 0b11111];

/** Number of clean straight windows (3-7 … T-A) that contain every rank in `rankMask`. */
export function straightWays(rankMask: number): number {
  let n = 0;
  for (const w of WINDOWS) if ((rankMask & ~w) === 0) n++;
  return n;
}

/** True if the ranks only fit straights that need the 2 slot (e.g. A-3-4-5). */
const onlyLowWindows = (rankMask: number) => straightWays(rankMask) === 0 && WHEEL_WINDOWS.some((w) => (rankMask & ~w) === 0);

export interface Pattern {
  /** Stable key, unique per pattern. */
  key: string;
  /** Human chart line. */
  label: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Names a hold in a deuces-wild game. */
export function deucesPattern(game: GameDef, held: readonly Card[]): Pattern {
  const d = held.filter(isDeuce).length;
  const nats = held.filter((c) => !isDeuce(c));
  const n = held.length;
  const deuces = d ? `${plural(d, 'deuce')} + ` : '';
  if (n === 5) {
    const i = game.evaluate(held);
    const label = i < 0 ? 'Nothing (hold 5)' : game.rows[i].label;
    return { key: `made:${label}`, label: `Pat ${label}` };
  }
  if (nats.length === 0) {
    if (d === 0) return { key: 'none', label: 'Discard everything' };
    return { key: `d${d}`, label: d === 4 ? 'Four deuces' : `${plural(d, 'deuce')} only` };
  }
  const counts = new Map<number, number>();
  let rankMask = 0;
  let suits = 0;
  for (const c of nats) {
    counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
    rankMask |= 1 << rankOf(c);
    suits |= 1 << suitOf(c);
  }
  const maxCount = Math.max(...counts.values());
  const flush = (suits & (suits - 1)) === 0;
  if (counts.size === 1 && maxCount > 1) {
    const kind = maxCount + d;
    const name = kind === 4 ? 'Four of a Kind' : kind === 3 ? 'Three of a Kind' : 'Pair';
    return { key: `d${d}:kind${kind}`, label: d ? `${name} (${deuces.slice(0, -3)} + ${maxCount} natural)` : name };
  }
  if (d === 0 && n === 4 && counts.size === 2 && maxCount === 2) return { key: 'twopair', label: 'Two Pair' };
  if (maxCount === 1) {
    const ways = straightWays(rankMask);
    if (flush && (rankMask & ~ROYAL_RANKS) === 0) {
      // Small royal draws differ by whether an ace or ten blocks straights (and, for aces, straight flushes).
      if (n - d <= 3 && n < 4) {
        const ta = [rankMask & (1 << ACE) ? 'A' : '', rankMask & (1 << TEN) ? 'T' : ''].filter(Boolean).join('/');
        const q = ta ? `with ${ta}` : 'no T or A';
        return { key: `d${d}:royal${n}:${ta || 'none'}`, label: `${deuces}${n} to a Royal (${q})` };
      }
      return { key: `d${d}:royal${n}`, label: `${deuces}${n} to a Royal` };
    }
    const low = onlyLowWindows(rankMask);
    if (flush && ways > 0) return { key: `d${d}:sf${n}w${ways}`, label: `${deuces}${n} to a Straight Flush (${plural(ways, 'way')})` };
    if (flush && low) return { key: `d${d}:sf${n}low`, label: `${deuces}${n} to a Straight Flush (needs the 2 slot)` };
    if (flush) return { key: `d${d}:flush${n}`, label: `${deuces}${n} to a Flush` };
    if (ways > 0) return { key: `d${d}:str${n}w${ways}`, label: `${deuces}${n} to a Straight (${plural(ways, 'way')})` };
    if (low) return { key: `d${d}:str${n}low`, label: `${deuces}${n} to a Straight (needs the 2 slot)` };
  }
  return { key: `d${d}:other`, label: `${deuces}other (${n} cards)` };
}

export type Classifier = (game: GameDef, held: readonly Card[]) => Pattern;

/** Chart sections: deuces games split by deuces dealt. */
export const deucesSection = (hand: readonly Card[]): number => hand.filter(isDeuce).length;

// ---------------------------------------------------------------- natural games (Jacks or Better family)

/** All straight windows including the wheel, for natural-card games. */
const ALL_WINDOWS = [(1 << ACE) | 0b1111, ...Array.from({ length: 9 }, (_, lo) => 0b11111 << lo)];
const isHigh = (r: number) => r >= JACK;
const rankStr = (ranks: number[]) => [...ranks].sort((a, b) => b - a).map((r) => RANKS[r]).join('');

/** Fewest missing ranks inside any straight window that holds these ranks (0 = consecutive). */
function insideGaps(rankMask: number, n: number): number {
  let best = Infinity;
  for (const w of ALL_WINDOWS) {
    if ((rankMask & ~w) !== 0) continue;
    // Span of held ranks inside this window, ace low for the wheel.
    const ranks: number[] = [];
    for (let r = 0; r < 13; r++) if (rankMask & (1 << r)) ranks.push(w === ALL_WINDOWS[0] && r === ACE ? -1 : r);
    best = Math.min(best, Math.max(...ranks) - Math.min(...ranks) + 1 - n);
  }
  return best;
}

/**
 * Names a hold in a natural-card game (Jacks or Better, Bonus Poker, Bonus Poker Deluxe). High
 * cards (J, Q, K, A) matter here, so draws are qualified by how many they contain; small royal
 * draws and plain high-card holds are named by their exact ranks ("suited QJ", "KQJ").
 */
export function naturalPattern(game: GameDef, held: readonly Card[]): Pattern {
  const n = held.length;
  if (n === 5) {
    const i = game.evaluate(held);
    const label = i < 0 ? 'Nothing (hold 5)' : game.rows[i].label;
    return { key: `made:${label}`, label: `Pat ${label}` };
  }
  if (n === 0) return { key: 'none', label: 'Discard everything' };
  const counts = new Map<number, number>();
  let rankMask = 0;
  let suits = 0;
  for (const c of held) {
    counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
    rankMask |= 1 << rankOf(c);
    suits |= 1 << suitOf(c);
  }
  const ranks = [...counts.keys()];
  const maxCount = Math.max(...counts.values());
  const flush = (suits & (suits - 1)) === 0;
  const high = ranks.filter(isHigh).length;
  const acesMatter = game.rows.some((r) => r.key === 'four-aces');
  if (counts.size === 1 && maxCount > 1) {
    const r = ranks[0];
    if (maxCount === 4) return { key: 'quads', label: 'Four of a Kind' };
    if (maxCount === 3) return acesMatter && r === ACE ? { key: 'trips:A', label: 'Three Aces' } : { key: 'trips', label: 'Three of a Kind' };
    if (acesMatter && r === ACE) return { key: 'pair:A', label: 'Pair of Aces' };
    if (!isHigh(r)) return { key: 'pair:low', label: 'Low Pair (22–TT)' };
    return { key: 'pair:high', label: acesMatter ? 'High Pair (JJ–KK)' : 'High Pair (JJ–AA)' };
  }
  if (n === 4 && counts.size === 2 && maxCount === 2) return { key: 'twopair', label: 'Two Pair' };
  if (maxCount > 1) return { key: `other${n}`, label: `other (${n} cards)` };
  const fits = ALL_WINDOWS.filter((w) => (rankMask & ~w) === 0).length;
  const hc = (k: number) => `${k} high`;
  if (flush && (rankMask & ~(0b11111 << TEN)) === 0) {
    if (n >= 3) return { key: `royal${n}`, label: `${n} to a Royal` };
    if (n === 2) return { key: `royal2:${rankStr(ranks)}`, label: `Suited ${rankStr(ranks)}` };
  }
  if (flush && n >= 3 && fits > 0) {
    const gaps = insideGaps(rankMask, n);
    if (n === 4) return { key: `sf4`, label: '4 to a Straight Flush' };
    return { key: `sf3:h${high}g${gaps}`, label: `3 to a Straight Flush (${hc(high)}, ${gaps === 0 ? 'no gaps' : `${gaps} gap${gaps > 1 ? 's' : ''}`})` };
  }
  if (flush && n >= 3) return { key: `flush${n}:h${high}`, label: `${n} to a Flush (${hc(high)})` };
  if (n === 4 && fits > 0) {
    const open = fits === 2 && !(rankMask & (1 << ACE));
    return open ? { key: 'str4:open', label: '4 to an Open Straight' } : { key: `str4:in:h${high}`, label: `4 to an Inside Straight (${hc(high)})` };
  }
  if (high === n) return { key: `hc:${rankStr(ranks)}`, label: n === 1 ? `${rankStr(ranks)} only` : `${rankStr(ranks)} unsuited` };
  if (n === 3 && fits > 0) return { key: `str3:h${high}`, label: `3 to a Straight (${hc(high)})` };
  return { key: `other${n}`, label: `other (${n} cards)` };
}

/** The chart vocabulary for a game, or null if there's no classifier for it yet. */
export interface ChartKind {
  classify: Classifier;
  sectionOf: (hand: readonly Card[]) => number;
  sectionTitle: (section: number, share: number) => string;
  rule: string;
  /** Short context for a mistake, e.g. "1 deuce"; empty when the game has one section. */
  sectionLabel: (section: number) => string;
}

const pct = (x: number) => `${(x * 100).toFixed(2)}% of hands`;

export function chartKind(game: GameDef): ChartKind | null {
  if (game.rows.some((r) => r.key === 'four-deuces'))
    return {
      classify: deucesPattern,
      sectionOf: deucesSection,
      sectionTitle: (s, share) => `${s === 1 ? '1 deuce' : `${s} deuces`} dealt (${pct(share)})`,
      rule: 'Always hold every deuce. Find the section for the number of deuces you were dealt, then play the first line you can make.',
      sectionLabel: (s) => (s === 1 ? '1 deuce' : `${s} deuces`),
    };
  if (game.deckSize === 52 && game.rows.some((r) => r.key === 'jacks-or-better'))
    return {
      classify: naturalPattern,
      sectionOf: () => 0,
      sectionTitle: () => 'All hands',
      rule: 'Play the first line you can make. "High" cards are J, Q, K, A.',
      sectionLabel: () => '',
    };
  return null;
}

// ---------------------------------------------------------------- suit-canonical starting hands

const SUIT_PERMS: number[][] = (() => {
  const out: number[][] = [];
  const rec = (p: number[]) => {
    if (p.length === 4) return void out.push(p);
    for (let s = 0; s < 4; s++) if (!p.includes(s)) rec([...p, s]);
  };
  rec([]);
  return out;
})();

/**
 * Every 5-card hand of a 52-card deck, grouped by suit symmetry: yields one representative per
 * class with its multiplicity. 134,459 classes covering all 2,598,960 hands.
 */
export function canonicalHands(): { hand: Card[]; weight: number }[] {
  const classes = new Map<number, { hand: Card[]; weight: number }>();
  const h = [0, 0, 0, 0, 0];
  const tmp = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < 52; h[0]++)
    for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
      for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
        for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
          for (h[4] = h[3] + 1; h[4] < 52; h[4]++) {
            let best = Infinity;
            for (const p of SUIT_PERMS) {
              for (let i = 0; i < 5; i++) tmp[i] = (h[i] & ~3) | p[h[i] & 3];
              tmp.sort((a, b) => a - b);
              const key = (((tmp[0] * 52 + tmp[1]) * 52 + tmp[2]) * 52 + tmp[3]) * 52 + tmp[4];
              if (key < best) best = key;
            }
            const c = classes.get(best);
            if (c) c.weight++;
            else classes.set(best, { hand: [...h], weight: 1 });
          }
  return [...classes.values()];
}

// ---------------------------------------------------------------- chart generation

export interface ChartLine {
  key: string;
  label: string;
  /** Share of this section's hands where this line is the one that applies when following the chart. */
  share: number;
  /** A representative dealt hand where this line is the play. */
  example: Card[];
}

export interface ChartSection {
  section: number;
  title: string;
  /** Share of all starting hands in this section. */
  share: number;
  lines: ChartLine[];
}

export interface ChartError {
  hand: Card[];
  weight: number;
  chartLabel: string;
  bestLabel: string;
  cost: number;
}

export interface Chart {
  gameId: string;
  /** How to read the chart, shown above it. */
  rule: string;
  sections: ChartSection[];
  perfectReturn: number;
  chartReturn: number;
  /** Share of starting hands where following the chart loses EV. */
  errorRate: number;
  /** Worst chart mistakes by weighted EV cost. */
  worstErrors: ChartError[];
  /** Chart mistakes grouped by (chart line, better line), by total EV given up (as a share of all hands). */
  errorGroups: { chartLabel: string; bestLabel: string; share: number; evLost: number }[];
}

interface Analyzed {
  hand: Card[];
  weight: number;
  section: number;
  best: number;
  /** pattern key → best EV among holds with that pattern */
  byPattern: Map<string, number>;
}

/**
 * Orders patterns so that playing the first line present maximizes total EV over the section's hands.
 * Patterns that are never optimal go to the bottom (every hand has a catch-all line, so they never apply).
 * Start from a pairwise-majority order, then improve by moving single lines (local search).
 */
function orderPatterns(hands: Analyzed[]): string[] {
  const keys = new Set<string>();
  const optimalSomewhere = new Set<string>();
  for (const a of hands)
    for (const [k, ev] of a.byPattern) {
      keys.add(k);
      if (a.best - ev <= EV_EPSILON) optimalSomewhere.add(k);
    }
  const live = [...optimalSomewhere];
  const index = new Map(live.map((k, i) => [k, i]));
  // Compact per-hand view: live pattern indices and their EVs.
  const hp = hands.map((a) => {
    const idx: number[] = [];
    const evs: number[] = [];
    for (const [k, ev] of a.byPattern) {
      const i = index.get(k);
      if (i !== undefined) {
        idx.push(i);
        evs.push(ev);
      }
    }
    return { idx, evs, w: a.weight };
  });
  // Pairwise evidence for the initial order: Copeland-style score by weighted EV margin.
  const P = live.length;
  const margin = Array.from({ length: P }, () => new Float64Array(P));
  for (const h of hp)
    for (let x = 0; x < h.idx.length; x++)
      for (let y = 0; y < h.idx.length; y++) margin[h.idx[x]][h.idx[y]] += h.w * (h.evs[x] - h.evs[y]);
  let order = live.map((_, i) => i).sort((a, b) => {
    let sa = 0;
    let sb = 0;
    for (let o = 0; o < P; o++) {
      sa += Math.sign(margin[a][o]);
      sb += Math.sign(margin[b][o]);
    }
    return sb - sa;
  });
  const score = (ord: number[]): number => {
    const rank = new Int32Array(P);
    ord.forEach((p, r) => (rank[p] = r));
    let total = 0;
    for (const h of hp) {
      let br = Infinity;
      let ev = 0;
      for (let x = 0; x < h.idx.length; x++) {
        const r = rank[h.idx[x]];
        if (r < br) {
          br = r;
          ev = h.evs[x];
        }
      }
      total += h.w * ev;
    }
    return total;
  };
  let best = score(order);
  for (let improved = true; improved; ) {
    improved = false;
    for (let from = 0; from < P; from++) {
      const item = order[from];
      const rest = order.filter((_, i) => i !== from);
      for (let to = 0; to < P; to++) {
        if (to === from) continue;
        const cand = [...rest.slice(0, to), item, ...rest.slice(to)];
        const sc = score(cand);
        if (sc > best + 1e-9) {
          best = sc;
          order = cand;
          improved = true;
          break;
        }
      }
    }
  }
  // Readability: lines that never appear in the same hand can be swapped freely (the chart plays
  // identically), so bubble them into natural order: higher typical EV when optimal comes first.
  const together = Array.from({ length: P }, () => new Uint8Array(P));
  const evSum = new Float64Array(P);
  const evW = new Float64Array(P);
  hands.forEach((a, h) => {
    const { idx, evs, w } = hp[h];
    for (const x of idx) for (const y of idx) together[x][y] = 1;
    for (let x = 0; x < idx.length; x++)
      if (a.best - evs[x] <= EV_EPSILON) {
        evSum[idx[x]] += w * evs[x];
        evW[idx[x]] += w;
      }
  });
  const typical = (p: number) => evSum[p] / evW[p];
  for (let swapped = true; swapped; ) {
    swapped = false;
    for (let i = 0; i + 1 < order.length; i++) {
      const [a, b] = [order[i], order[i + 1]];
      if (!together[a][b] && typical(b) > typical(a) + 1e-12) {
        [order[i], order[i + 1]] = [b, a];
        swapped = true;
      }
    }
  }
  const tail = [...keys].filter((k) => !optimalSomewhere.has(k));
  return [...order.map((i) => live[i]), ...tail];
}

export function generateChart(tables: Tables, kind: ChartKind, hands: { hand: Card[]; weight: number }[]): Chart {
  const { classify, sectionOf } = kind;
  const game = tables.game;
  const labels = new Map<string, string>();
  const analyzed: Analyzed[] = hands.map(({ hand, weight }) => {
    const evs = holdEvs(tables, hand);
    const byPattern = new Map<string, number>();
    let best = 0;
    for (let m = 0; m < 32; m++) {
      const p = classify(game, hand.filter((_, i) => m & (1 << i)));
      labels.set(p.key, p.label);
      if (!(byPattern.get(p.key)! >= evs[m])) byPattern.set(p.key, evs[m]);
      if (evs[m] > best) best = evs[m];
    }
    return { hand, weight, section: sectionOf(hand), best, byPattern };
  });

  const total = BINOM[game.deckSize][5];
  const sectionIds = [...new Set(analyzed.map((a) => a.section))].sort((a, b) => b - a);
  let perfect = 0;
  let chartTotal = 0;
  let errorWeight = 0;
  const errors: ChartError[] = [];
  const sections: ChartSection[] = sectionIds.map((section) => {
    const inSection = analyzed.filter((a) => a.section === section);
    const order = orderPatterns(inSection);
    const rank = new Map(order.map((k, i) => [k, i]));
    const used = new Map<string, { weight: number; example: Card[]; exampleWeight: number }>();
    let sectionWeight = 0;
    for (const a of inSection) {
      let pick = '';
      for (const k of a.byPattern.keys()) if (!pick || rank.get(k)! < rank.get(pick)!) pick = k;
      const ev = a.byPattern.get(pick)!;
      perfect += a.weight * a.best;
      chartTotal += a.weight * ev;
      sectionWeight += a.weight;
      const u = used.get(pick);
      if (!u) used.set(pick, { weight: a.weight, example: a.hand, exampleWeight: a.weight });
      else {
        u.weight += a.weight;
        if (a.weight > u.exampleWeight) Object.assign(u, { example: a.hand, exampleWeight: a.weight });
      }
      if (a.best - ev > EV_EPSILON) {
        errorWeight += a.weight;
        let bestKey = pick;
        for (const [k, v] of a.byPattern) if (v > a.byPattern.get(bestKey)!) bestKey = k;
        errors.push({ hand: a.hand, weight: a.weight, chartLabel: labels.get(pick)!, bestLabel: labels.get(bestKey)!, cost: a.best - ev });
      }
    }
    return {
      section,
      title: kind.sectionTitle(section, sectionWeight / total),
      share: sectionWeight / total,
      lines: order
        .filter((k) => used.has(k))
        .map((k) => ({ key: k, label: labels.get(k)!, share: used.get(k)!.weight / sectionWeight, example: used.get(k)!.example })),
    };
  });
  errors.sort((a, b) => b.cost * b.weight - a.cost * a.weight);
  const groups = new Map<string, { chartLabel: string; bestLabel: string; share: number; evLost: number }>();
  for (const e of errors) {
    const k = `${e.chartLabel}|${e.bestLabel}`;
    const g = groups.get(k) ?? { chartLabel: e.chartLabel, bestLabel: e.bestLabel, share: 0, evLost: 0 };
    g.share += e.weight / total;
    g.evLost += (e.weight * e.cost) / total;
    groups.set(k, g);
  }
  return {
    gameId: game.id,
    rule: kind.rule,
    sections,
    perfectReturn: perfect / total,
    chartReturn: chartTotal / total,
    errorRate: errorWeight / total,
    worstErrors: errors.slice(0, 40),
    errorGroups: [...groups.values()].sort((a, b) => b.evLost - a.evLost).slice(0, 40),
  };
}
