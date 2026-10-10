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
