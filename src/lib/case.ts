/**
 * Name / Title casing helpers.
 *
 * The app requires every NAME, TITLE and any the-like free-text label to be
 * written with an Uppercase First Letter (Title Case). These utilities are
 * applied when SAVING (so data reaches the database already normalized) —
 * never while typing, so users can still write lowercase naturally.
 */

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on',
  'or', 'per', 'so', 'the', 'to', 'up', 'via', 'yet',
]);

/** Force the first character of a token to uppercase, keep the rest as-is. */
function upperFirst(token: string): string {
  if (!token) return token;
  const m = token.match(/^([^A-Za-z]*)(.*)$/s)!;
  const prefix = m[1]; // leading punctuation, e.g. "(", "“", "\""
  const rest = m[2];
  if (!rest) return token;
  return prefix + rest[0].toUpperCase() + rest.slice(1);
}

/**
 * "junfranz rock c. calibo" → "Junfranz Rock C. Calibo"
 * "administrative officer"  → "Administrative Officer"
 * Already-capitalized words and ALL-CAPS acronyms (DILG, MC, 5W1H…) are kept.
 */
export function toTitleCase(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word, i, arr) => {
      // Preserve all-caps tokens (acronyms such as DILG, NCR, OIC).
      if (/^[A-Z0-9.,'”")(-]+$/.test(word) && /[A-Z]{2,}/.test(word)) return word;
      // Small connecting words stay lowercase unless first/last in the phrase.
      const bare = word.toLowerCase().replace(/[^a-z]/g, '');
      if (
        bare &&
        SMALL_WORDS.has(bare) &&
        i !== 0 &&
        i !== arr.length - 1
      ) {
        return word.toLowerCase();
      }
      return upperFirst(word);
    })
    .join(' ');
}

/**
 * Sentence-style casing for descriptions/messages:
 * keeps the user's wording but guarantees the text starts with an
 * uppercase first letter.
 */
export function toSentenceCase(input?: string | null): string {
  if (!input) return '';
  const s = input.replace(/^\s+/, '');
  if (!s) return input ?? '';
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Display guard — every NAME / TITLE (and any the-like label) rendered in the
 * UI shows an Uppercase First Letter, even for rows that were stored in all
 * lowercase before this rule existed. Returns null/undefined untouched so
 * callers can still fall back to their own placeholders ("—").
 */
export function displayName(input?: string | null): string | null | undefined {
  if (input === null || input === undefined) return input;
  return toTitleCase(input);
}
