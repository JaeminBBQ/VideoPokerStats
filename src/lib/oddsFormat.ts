/** "2.1%" or "0.0062%": the chance as a percentage with 2 significant figures. */
export function percent2(p: number): string {
  return `${(p * 100).toPrecision(2)}%`;
}

const HANDS_PER_HOUR = 600;

/**
 * How often a hit comes at 600 hands/hour: "about every 67 hours", "about every 1.7 hours",
 * "about every 42 minutes". `null` when it's under a minute (omit the line).
 */
export function pace(p: number): string | null {
  if (p <= 0) return null;
  const hours = 1 / p / HANDS_PER_HOUR;
  if (hours >= 10) return `about every ${Math.round(hours).toLocaleString('en-US')} hours`;
  if (hours >= 1) return `about every ${hours.toFixed(1)} hours`;
  const minutes = Math.round(hours * 60);
  return minutes >= 1 ? `about every ${minutes} minute${minutes === 1 ? '' : 's'}` : null;
}

/** "a Royal Flush", "Four Deuces" (plural labels take no article), "an …" before a vowel. */
export function withArticle(label: string): string {
  if (/s$/i.test(label)) return label;
  return `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`;
}

/** A chance as a percentage: whole percents from 10% up ("15%"), one decimal below ("8.1%", "0.3%"), "<0.1%" for anything tinier, "0%" for zero. */
export function pct(p: number): string {
  if (p <= 0) return '0%';
  const v = p * 100;
  if (v < 0.1) return '<0.1%';
  return v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
}

/** "100 hands" (a sub-hour session), then hours at 600 hands/hour: "1 hour", "4 hours". */
export function sessionLabel(hands: number): string {
  if (hands < 600) return `${hands} hands`;
  const hours = hands / 600;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** Average session result in bets: one decimal with an explicit sign ("−16.2", "+0.4"). */
export function signedBets(x: number): string {
  const v = Math.round(x * 10) / 10;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}
