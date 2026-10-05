import { ACE, JACK, rankOf, suitOf, type Card } from './cards.ts';

/** One paytable row. `pays` is per coin at max bet (royal 4000 for 5 coins = 800). */
export interface PayRow {
  key: string;
  label: string;
  pays: number;
}

export type GameId = 'job-8-5' | 'bonus-6-5' | 'lb-deuces-16-13' | 'bpd-7-5';

/** Casinos where the owner has photographed a paytable. Add one only with a photo in `context/`. */
export type Venue = 'Legends Bay';
export const VENUES: Venue[] = ['Legends Bay'];

export interface GameDef {
  id: GameId;
  name: string;
  /** Casino tab the game is listed under in the UI. */
  venue: Venue;
  /** Owner photo of the machine's paytable (the proof this game exists as configured). */
  proof: string;
  /** Where the user can find it; shown in the UI. */
  where: string;
  deckSize: 52 | 53;
  /** Rows ordered best first. */
  rows: PayRow[];
  /** Index into `rows` of the hand's paying category, or -1 for no pay. */
  evaluate(hand: readonly Card[]): number;
  /** Published return under perfect play (fraction, e.g. 0.9973). Verified by scripts/verify-returns.ts. */
  publishedReturn: number;
  /** How many decimals of a percentage the published figure is quoted to. */
  publishedDecimals: number;
  source: string;
}

// ---------------------------------------------------------------- hand shape helpers

const ROYAL_RANKS = 0b1_1111_0000_0000; // T J Q K A (rank bits 8..12)
const WHEEL = (1 << ACE) | 0b1111; // A 2 3 4 5

/** True if every rank in `rankMask` fits inside one 5-rank straight window (wheel included). */
function fitsStraight(rankMask: number): boolean {
  if ((rankMask & ~WHEEL) === 0) return true;
  for (let lo = 0; lo <= 8; lo++) {
    if ((rankMask & ~(0b11111 << lo)) === 0) return true;
  }
  return false;
}

interface Shape {
  wild: number; // number of wild cards
  naturals: number;
  counts: number[]; // per rank, naturals only
  rankMask: number;
  maxCount: number;
  distinctRanks: number;
  flush: boolean; // all naturals share a suit
}

function shape(hand: readonly Card[], isWild: (c: Card) => boolean): Shape {
  const counts = new Array<number>(13).fill(0);
  let wild = 0;
  let suits = 0;
  let rankMask = 0;
  for (const c of hand) {
    if (isWild(c)) {
      wild++;
      continue;
    }
    const r = rankOf(c);
    counts[r]++;
    rankMask |= 1 << r;
    suits |= 1 << suitOf(c);
  }
  let maxCount = 0;
  let distinctRanks = 0;
  for (const n of counts) {
    if (n > maxCount) maxCount = n;
    if (n > 0) distinctRanks++;
  }
  return {
    wild,
    naturals: hand.length - wild,
    counts,
    rankMask,
    maxCount,
    distinctRanks,
    flush: (suits & (suits - 1)) === 0,
  };
}

// ---------------------------------------------------------------- Deuces Wild family

const DEUCES_ROWS = [
  ['natural-royal', 'Natural Royal Flush'],
  ['four-deuces', 'Four Deuces'],
  ['wild-royal', 'Wild Royal Flush'],
  ['five-kind', 'Five of a Kind'],
  ['straight-flush', 'Straight Flush'],
  ['four-kind', 'Four of a Kind'],
  ['full-house', 'Full House'],
  ['flush', 'Flush'],
  ['straight', 'Straight'],
  ['three-kind', 'Three of a Kind'],
] as const;

function deucesEvaluate(hand: readonly Card[]): number {
  const s = shape(hand, (c) => rankOf(c) === 0);
  const distinct = s.maxCount <= 1;
  const straight = distinct && fitsStraight(s.rankMask);
  const royal = distinct && s.flush && (s.rankMask & ~ROYAL_RANKS) === 0;
  const kind = s.maxCount + s.wild;
  if (royal && s.wild === 0) return 0;
  if (s.wild === 4) return 1;
  if (royal) return 2;
  if (kind >= 5) return 3;
  if (straight && s.flush) return 4;
  if (kind === 4) return 5;
  // Full house: natural 3+2, or one deuce with two natural pairs.
  if ((s.wild === 0 && s.maxCount === 3 && s.distinctRanks === 2) || (s.wild === 1 && s.maxCount === 2 && s.distinctRanks === 2)) return 6;
  if (s.flush) return 7;
  if (straight) return 8;
  if (kind === 3) return 9;
  return -1;
}

function deucesRows(pays: number[]): PayRow[] {
  return DEUCES_ROWS.map(([key, label], i) => ({ key, label, pays: pays[i] }));
}

// ---------------------------------------------------------------- Bonus family (natural cards, Jacks or Better)

type QuadRule = { key: string; label: string; pays: number; quad: (r: number) => boolean; kicker?: (r: number) => boolean };

const isAce = (r: number) => r === ACE;
const isLow = (r: number) => r <= 2; // 2, 3, 4

function bonusGame(
  quadRules: QuadRule[],
  fullHouse: number,
  flush: number,
  straight: number,
  twoPair = 1,
): { rows: PayRow[]; evaluate: GameDef['evaluate'] } {
  const rows: PayRow[] = [
    { key: 'royal', label: 'Royal Flush', pays: 800 },
    { key: 'straight-flush', label: 'Straight Flush', pays: 50 },
    ...quadRules.map(({ key, label, pays }) => ({ key, label, pays })),
    { key: 'full-house', label: 'Full House', pays: fullHouse },
    { key: 'flush', label: 'Flush', pays: flush },
    { key: 'straight', label: 'Straight', pays: straight },
    { key: 'three-kind', label: 'Three of a Kind', pays: 3 },
    { key: 'two-pair', label: 'Two Pair', pays: twoPair },
    { key: 'jacks-or-better', label: 'Jacks or Better', pays: 1 },
  ];
  const q = quadRules.length;
  const evaluate = (hand: readonly Card[]): number => {
    const s = shape(hand, () => false);
    const straight = s.maxCount === 1 && fitsStraight(s.rankMask);
    if (straight && s.flush) return s.rankMask === ROYAL_RANKS ? 0 : 1;
    if (s.maxCount === 4) {
      const quad = s.counts.indexOf(4);
      const kicker = s.counts.indexOf(1);
      const i = quadRules.findIndex((rule) => rule.quad(quad) && (!rule.kicker || rule.kicker(kicker)));
      return 2 + i;
    }
    if (s.maxCount === 3) return s.distinctRanks === 2 ? 2 + q : 5 + q;
    if (s.flush) return 3 + q;
    if (straight) return 4 + q;
    if (s.maxCount === 2) {
      if (s.distinctRanks === 3) return 6 + q;
      const pair = s.counts.findIndex((n) => n === 2);
      return pair >= JACK ? 7 + q : -1;
    }
    return -1;
  };
  return { rows, evaluate };
}

const quads = (aces: number, low: number, rest: number): QuadRule[] => [
  { key: 'four-aces', label: 'Four Aces', pays: aces, quad: isAce },
  { key: 'four-2-4', label: 'Four 2s–4s', pays: low, quad: isLow },
  { key: 'four-5-k', label: 'Four 5s–Ks', pays: rest, quad: () => true },
];

// Legends Bay Game King #12139, 10¢ (owner photos, context/1-4.webp, 2026-10-04).
const job85 = bonusGame([{ key: 'four-kind', label: 'Four of a Kind', pays: 25, quad: () => true }], 8, 5, 4, 2);
const bonus65 = bonusGame(quads(80, 40, 25), 6, 5, 4, 2);
const bpd75 = bonusGame([{ key: 'four-kind', label: 'Four of a Kind', pays: 80, quad: () => true }], 7, 5, 4, 1);

// ---------------------------------------------------------------- catalog

export const GAMES: Record<GameId, GameDef> = {
  'lb-deuces-16-13': {
    id: 'lb-deuces-16-13',
    venue: 'Legends Bay',
    proof: 'context/4.webp',
    name: 'Deuces Wild — 16/13',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    deckSize: 52,
    rows: deucesRows([800, 200, 25, 16, 13, 4, 3, 2, 2, 1]),
    evaluate: deucesEvaluate,
    publishedReturn: 0.967651,
    publishedDecimals: 4,
    source: 'https://wizardofodds.com/games/video-poker/tables/deuces-wild/ (0.967651); paytable from owner photo context/4.webp',
  },
  'job-8-5': {
    id: 'job-8-5',
    venue: 'Legends Bay',
    proof: 'context/3.webp',
    name: 'Jacks or Better — 8/5',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    deckSize: 52,
    ...job85,
    publishedReturn: 0.9730,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/jacks-or-better/',
  },
  'bonus-6-5': {
    id: 'bonus-6-5',
    venue: 'Legends Bay',
    proof: 'context/2.webp',
    name: 'Bonus Poker — 6/5',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    deckSize: 52,
    ...bonus65,
    publishedReturn: 0.9687,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/bonus-poker/',
  },
  'bpd-7-5': {
    id: 'bpd-7-5',
    venue: 'Legends Bay',
    proof: 'context/1.webp',
    name: 'Bonus Poker Deluxe — 7/5',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    deckSize: 52,
    ...bpd75,
    publishedReturn: 0.9625,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/bonus-poker-deluxe/',
  },
};

export const GAME_LIST: GameDef[] = Object.values(GAMES);

/** Games for a casino tab, best return first. */
export const gamesAt = (venue: Venue): GameDef[] => GAME_LIST.filter((g) => g.venue === venue).sort((a, b) => b.publishedReturn - a.publishedReturn);

/** Payout per coin for a final 5-card hand. */
export function payout(game: GameDef, hand: readonly Card[]): number {
  const i = game.evaluate(hand);
  return i < 0 ? 0 : game.rows[i].pays;
}
