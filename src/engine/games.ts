import { ACE, JACK, rankOf, suitOf, type Card } from './cards.ts';

/** One paytable row. `pays` is per coin at max bet (royal 4000 for 5 coins = 800). */
export interface PayRow {
  key: string;
  label: string;
  pays: number;
}

export type GameId =
  | 'job-8-5'
  | 'bonus-6-5'
  | 'lb-deuces-16-13'
  | 'bpd-7-5'
  | 'gsr-job-9-5'
  | 'gsr-job-9-6'
  | 'gsr-db-9-7-5'
  | 'gsr-dwbp'
  | 'gsr-deuces-20-12-10'
  | 'lb-job-9-5'
  | 'lb-bonus-7-5'
  | 'lb-deuces-20-12-10'
  | 'lb-db-9-6-5'
  | 'dottys-bonus-6-5';

/** Casinos where the owner has photographed a paytable. Add one only with a photo in `context/`. */
export type Venue = 'Legends Bay' | 'GSR' | "Dotty's";
export const VENUES: Venue[] = ['Legends Bay', 'GSR', "Dotty's"];

/**
 * A denomination the game is offered at with this paytable. `maxCoins` is the bet that earns the
 * full royal (the pays are per coin at that bet). `confirmed`: photographed or confirmed by the owner;
 * unconfirmed denominations are shown with an asterisk.
 */
export interface Offer {
  /** Dollars per coin, matching `DENOMINATIONS` in src/lib/storage.ts (0.05 = 5¢). */
  denomination: number;
  maxCoins: number;
  confirmed: boolean;
  /**
   * The royal is a progressive at this denomination (D30): the rest of the paytable is the same, and the
   * engine pays the base royal (800 per coin), so returns are a slight underestimate when the meter is up.
   */
  progressive?: boolean;
  /** A royal meter the owner photographed at this denomination (dollars at max bet), for reference only (D35). */
  meterSeen?: { dollars: number; date: string };
  /**
   * Bets below `maxCoins` that the owner's photo shows the pays for (D34). Every row pays the same per coin
   * as at max bet except the natural royal, which pays `royalPerCoin` (250 short, 800 full). Bets not listed
   * aren't offered by the app: their pays aren't photographed.
   */
  shortBets?: ShortBet[];
}

/** A bet below max coins and its royal pay per coin, as photographed (D34). */
export interface ShortBet {
  coins: number;
  royalPerCoin: number;
}

/** The usual short-bet royal: 250 per coin below max (all photographed machines show it at 1–4 coins). */
const shortRoyal = (coins: number[]): ShortBet[] => coins.map((c) => ({ coins: c, royalPerCoin: 250 }));

export interface GameDef {
  id: GameId;
  name: string;
  /** Casino tab the game is listed under in the UI. */
  venue: Venue;
  /** Owner photo of the machine's paytable (the proof this game exists as configured). */
  proof: string;
  /** Where the user can find it; shown in the UI. */
  where: string;
  /** Denominations this paytable is offered at, smallest first (D16). */
  offers: Offer[];
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

// ---------------------------------------------------------------- Deuces Wild Bonus Poker

const DWBP_ROWS = [
  ['natural-royal', 'Royal Flush (no deuces)'],
  ['four-deuces-ace', 'Four Deuces + Ace'],
  ['four-deuces', 'Four Deuces'],
  ['five-aces', 'Five Aces'],
  ['five-3-5', 'Five 3s–5s'],
  ['five-6-k', 'Five 6s–Ks'],
  ['wild-royal', 'Wild Royal Flush'],
  ['straight-flush', 'Straight Flush'],
  ['four-kind', 'Four of a Kind'],
  ['full-house', 'Full House'],
  ['flush', 'Flush'],
  ['straight', 'Straight'],
  ['three-kind', 'Three of a Kind'],
] as const;

/** Deuces Wild with five of a kind split by rank and a bonus for four deuces with an ace. */
function dwbpEvaluate(hand: readonly Card[]): number {
  const base = deucesEvaluate(hand);
  if (base <= 0) return base; // no pay, or natural royal (index 0 in both tables)
  if (base === 1) return hand.some((c) => rankOf(c) === ACE) ? 1 : 2;
  if (base === 2) return 6;
  if (base === 3) {
    // Five of a kind without four deuces: every natural shares one rank.
    const rank = rankOf(hand.find((c) => rankOf(c) !== 0)!);
    return rank === ACE ? 3 : rank <= 3 ? 4 : 5; // rank 1..3 = 3s, 4s, 5s
  }
  return base + 3; // straight flush .. three of a kind
}

function dwbpRows(pays: number[]): PayRow[] {
  return DWBP_ROWS.map(([key, label], i) => ({ key, label, pays: pays[i] }));
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

// Legends Bay Game King #12139, 10¢ (owner photos, context/legends/1-4.webp, 2026-10-04).
const job85 = bonusGame([{ key: 'four-kind', label: 'Four of a Kind', pays: 25, quad: () => true }], 8, 5, 4, 2);
const bonus65 = bonusGame(quads(80, 40, 25), 6, 5, 4, 2);
const bpd75 = bonusGame([{ key: 'four-kind', label: 'Four of a Kind', pays: 80, quad: () => true }], 7, 5, 4, 1);

// GSR (owner photos context/gsr/, 2026-10-08). Machine #13013 offers 5¢–$1; the paytable changes
// with the denomination, so each photographed (game, denomination) is its own game.
const job95 = bonusGame([{ key: 'four-kind', label: 'Four of a Kind', pays: 25, quad: () => true }], 9, 5, 4, 2);
const job96 = bonusGame([{ key: 'four-kind', label: 'Four of a Kind', pays: 25, quad: () => true }], 9, 6, 4, 2);
const db975 = bonusGame(quads(160, 80, 50), 9, 7, 5, 1);

/**
 * Legends Bay #12139: photographed at 10¢. The owner confirmed 1¢–25¢ play the same paytable, and $1 / $2
 * too (bets of $5 / $10) with a progressive royal above 25¢ (D11, D12, D30). 50¢ and $5 are unconfirmed.
 */
const LB_OFFERS: Offer[] = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5].map((denomination) => ({
  denomination,
  maxCoins: 5,
  confirmed: denomination <= 0.25 || denomination === 1 || denomination === 2,
  ...(denomination > 0.25 ? { progressive: true } : {}),
  // The photos (10¢) show 1–4 coins at a 250 royal; the owner confirmed 1¢–25¢ is the same machine setup.
  // Short bets on the progressive denominations aren't photographed.
  ...(denomination <= 0.25 ? { shortBets: shortRoyal([1, 2, 3, 4]) } : {}),
}));

// Legends Bay machine #20047 (owner photos context/legends/photo*.jpeg, 2026-10-18): 5¢ only, 5-coin max,
// one progressive royal meter shared by all four games ($229.35 and $229.79 seen; base $200 = 800 per coin).
const bonus75 = bonusGame(quads(80, 40, 25), 7, 5, 4, 2);
const db965 = bonusGame(quads(160, 80, 50), 9, 6, 5, 1);

/** #20047: the photos show 1–4 coins at a 250 royal (fixed, not progressive) and the meter at 5 coins. */
const LB_20047: Offer[] = [
  {
    denomination: 0.05,
    maxCoins: 5,
    confirmed: true,
    progressive: true,
    meterSeen: { dollars: 229.79, date: '2026-10-18' },
    shortBets: shortRoyal([1, 2, 3, 4]),
  },
];

/** GSR $1 machines (10 coins max): the photos show 1–4 coins at a 250 royal; 5–9 aren't shown. */
const GSR_DOLLAR: Offer[] = [{ denomination: 1, maxCoins: 10, confirmed: true, shortBets: shortRoyal([1, 2, 3, 4]) }];

// ---------------------------------------------------------------- catalog

export const GAMES: Record<GameId, GameDef> = {
  'lb-deuces-16-13': {
    id: 'lb-deuces-16-13',
    venue: 'Legends Bay',
    proof: 'context/legends/4.webp',
    name: 'Deuces Wild — 16/13',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    offers: LB_OFFERS,
    deckSize: 52,
    rows: deucesRows([800, 200, 25, 16, 13, 4, 3, 2, 2, 1]),
    evaluate: deucesEvaluate,
    publishedReturn: 0.967651,
    publishedDecimals: 4,
    source: 'https://wizardofodds.com/games/video-poker/tables/deuces-wild/ (0.967651); paytable from owner photo context/legends/4.webp',
  },
  'job-8-5': {
    id: 'job-8-5',
    venue: 'Legends Bay',
    proof: 'context/legends/3.webp',
    name: 'Jacks or Better — 8/5',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    offers: LB_OFFERS,
    deckSize: 52,
    ...job85,
    publishedReturn: 0.9730,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/jacks-or-better/',
  },
  'bonus-6-5': {
    id: 'bonus-6-5',
    venue: 'Legends Bay',
    proof: 'context/legends/2.webp',
    name: 'Bonus Poker — 6/5',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    offers: LB_OFFERS,
    deckSize: 52,
    ...bonus65,
    publishedReturn: 0.9687,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/bonus-poker/',
  },
  'bpd-7-5': {
    id: 'bpd-7-5',
    venue: 'Legends Bay',
    proof: 'context/legends/1.webp',
    name: 'Bonus Poker Deluxe — 7/5',
    where: 'Legends Bay Game King #12139, 10¢ (photographed 2026-10-04)',
    offers: LB_OFFERS,
    deckSize: 52,
    ...bpd75,
    publishedReturn: 0.9625,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/bonus-poker-deluxe/',
  },
  'gsr-job-9-5': {
    id: 'gsr-job-9-5',
    venue: 'GSR',
    proof: 'context/gsr/1.webp',
    name: 'Jacks or Better — 9/5 (5¢)',
    where: 'GSR machine #13013, 5¢, max bet 20 coins (photographed 2026-10-08)',
    // Photo shows 16–19 coins already pay the full 800 royal; 1–15 aren't shown.
    offers: [{ denomination: 0.05, maxCoins: 20, confirmed: true, shortBets: [16, 17, 18, 19].map((c) => ({ coins: c, royalPerCoin: 800 })) }],
    deckSize: 52,
    ...job95,
    publishedReturn: 0.9845,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/jacks-or-better/ (9/5: 98.45%); paytable from owner photo',
  },
  'gsr-job-9-6': {
    id: 'gsr-job-9-6',
    venue: 'GSR',
    proof: 'context/gsr/preview.webp',
    name: 'Jacks or Better — 9/6 ($1)',
    where: 'GSR, $1, max bet 10 coins (photographed 2026-10-08)',
    offers: GSR_DOLLAR,
    deckSize: 52,
    ...job96,
    publishedReturn: 0.9954,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/jacks-or-better/ (9/6: 99.54%); paytable from owner photo',
  },
  'gsr-db-9-7-5': {
    id: 'gsr-db-9-7-5',
    venue: 'GSR',
    proof: 'context/gsr/2.webp',
    name: 'Double Bonus — 9/7/5 ($1)',
    where: 'GSR machine #13013, $1, max bet 10 coins (photographed 2026-10-08)',
    offers: GSR_DOLLAR,
    deckSize: 52,
    ...db975,
    publishedReturn: 0.9911,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/double-bonus/ (9/7/5: 99.11%); paytable from owner photo',
  },
  'gsr-dwbp': {
    id: 'gsr-dwbp',
    venue: 'GSR',
    proof: 'context/gsr/3.webp',
    name: 'Deuces Wild Bonus Poker ($1)',
    where: 'GSR machine #13013, $1, max bet 10 coins (photographed 2026-10-08)',
    offers: GSR_DOLLAR,
    deckSize: 52,
    rows: dwbpRows([800, 400, 200, 80, 40, 20, 25, 9, 4, 4, 3, 1, 1]),
    evaluate: dwbpEvaluate,
    publishedReturn: 0.9945,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/bonus-deuces-wild/ (9/4/4: 99.45%); videopokertrainer.org/bonus-deuces-wild/ (99.4502%); paytable from owner photo',
  },
  'gsr-deuces-20-12-10': {
    id: 'gsr-deuces-20-12-10',
    venue: 'GSR',
    proof: 'context/gsr/4.webp',
    name: 'Deuces Wild — 20/12/10 (5¢)',
    where: 'GSR, 5¢, max bet 20 coins (photographed 2026-10-08)',
    // Photo (bet 5) shows 2–4 coins at a 250 royal and 5 coins at the full 800; 1 and 6–19 aren't shown.
    offers: [{ denomination: 0.05, maxCoins: 20, confirmed: true, shortBets: [...shortRoyal([2, 3, 4]), { coins: 5, royalPerCoin: 800 }] }],
    deckSize: 52,
    rows: deucesRows([800, 200, 20, 12, 10, 4, 4, 3, 2, 1]),
    evaluate: deucesEvaluate,
    publishedReturn: 0.975791,
    publishedDecimals: 4,
    source: 'https://wizardofodds.com/games/video-poker/tables/deuces-wild/ (20-12-10-4-4-3: 0.975791); paytable from owner photo',
  },
  'lb-job-9-5': {
    id: 'lb-job-9-5',
    venue: 'Legends Bay',
    proof: 'context/legends/photo.jpeg',
    name: 'Jacks or Better — 9/5 (5¢ progressive)',
    where: 'Legends Bay machine #20047, 5¢, progressive royal (photographed 2026-10-18)',
    offers: LB_20047,
    deckSize: 52,
    ...job95,
    publishedReturn: 0.9845,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/jacks-or-better/ (9/5: 98.45%, 800 royal); paytable from owner photo',
  },
  'lb-bonus-7-5': {
    id: 'lb-bonus-7-5',
    venue: 'Legends Bay',
    proof: 'context/legends/photo(1).jpeg',
    name: 'Bonus Poker — 7/5 (5¢ progressive)',
    where: 'Legends Bay machine #20047, 5¢, progressive royal (photographed 2026-10-18)',
    offers: LB_20047,
    deckSize: 52,
    ...bonus75,
    publishedReturn: 0.9801,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/bonus-poker/ (7/5: 98.01%, 800 royal); paytable from owner photo',
  },
  'lb-deuces-20-12-10': {
    id: 'lb-deuces-20-12-10',
    venue: 'Legends Bay',
    proof: 'context/legends/photo(2).jpeg',
    name: 'Deuces Wild — 20/12/10 (5¢ progressive)',
    where: 'Legends Bay machine #20047, 5¢, progressive royal (photographed 2026-10-18)',
    offers: LB_20047,
    deckSize: 52,
    rows: deucesRows([800, 200, 20, 12, 10, 4, 4, 3, 2, 1]),
    evaluate: deucesEvaluate,
    publishedReturn: 0.975791,
    publishedDecimals: 4,
    source: 'https://wizardofodds.com/games/video-poker/tables/deuces-wild/ (20-12-10-4-4-3: 0.975791, 800 royal); same paytable as gsr-deuces-20-12-10; owner photo',
  },
  'lb-db-9-6-5': {
    id: 'lb-db-9-6-5',
    venue: 'Legends Bay',
    proof: 'context/legends/photo(3).jpeg',
    name: 'Double Bonus — 9/6/5 (5¢ progressive)',
    where: 'Legends Bay machine #20047, 5¢, progressive royal (photographed 2026-10-18)',
    offers: LB_20047,
    deckSize: 52,
    ...db965,
    publishedReturn: 0.9781,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/double-bonus/ (9/6/5: 97.81%, 800 royal); paytable from owner photo',
  },
  'dottys-bonus-6-5': {
    id: 'dottys-bonus-6-5',
    venue: "Dotty's",
    proof: 'context/dottys/IMG_8659.JPG',
    name: 'Bonus Poker — 6/5 (5¢)',
    where: "Dotty's, Sparks, Pyramid Way near Costco; 5¢, bet 25 credits (photographed 2026-10-18)",
    // Every photographed bet (22–25 and 100 credits) pays the same per coin, royal included: no max-bet bonus.
    // The app plays 25 credits ($1.25), the bet in the photo; 1–21 credits aren't shown.
    offers: [{ denomination: 0.05, maxCoins: 25, confirmed: true, shortBets: [22, 23, 24].map((c) => ({ coins: c, royalPerCoin: 800 })) }],
    deckSize: 52,
    ...bonus65,
    publishedReturn: 0.9687,
    publishedDecimals: 2,
    source: 'https://wizardofodds.com/games/video-poker/tables/bonus-poker/ (6/5: 96.87%); same paytable as bonus-6-5; owner photo',
  },
};

export const GAME_LIST: GameDef[] = Object.values(GAMES);

/** Games for a casino tab, best return first. */
export const gamesAt = (venue: Venue): GameDef[] => GAME_LIST.filter((g) => g.venue === venue).sort((a, b) => b.publishedReturn - a.publishedReturn);

/** The game's offer at `denomination`, if this paytable runs there. */
export const offerAt = (game: GameDef, denomination: number): Offer | undefined =>
  game.offers.find((o) => o.denomination === denomination);

/** `denomination` if the game is offered there, otherwise its closest offered denomination. */
export function snapDenomination(game: GameDef, denomination: number): number {
  if (offerAt(game, denomination)) return denomination;
  return game.offers.reduce(
    (best, o) => (Math.abs(o.denomination - denomination) < Math.abs(best - denomination) ? o.denomination : best),
    game.offers[0].denomination,
  );
}

/** Coins in a max bet for this game at `denomination`. Throws if the game isn't offered there. */
export function maxCoinsAt(game: GameDef, denomination: number): number {
  const o = offerAt(game, denomination);
  if (!o) throw new Error(`${game.id} is not offered at ${denomination}`);
  return o.maxCoins;
}

/** Payout per coin for a final 5-card hand. */
export function payout(game: GameDef, hand: readonly Card[]): number {
  const i = game.evaluate(hand);
  return i < 0 ? 0 : game.rows[i].pays;
}
