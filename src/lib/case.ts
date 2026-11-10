/**
 * Name / Title casing helpers.
 *
 * The app requires every NAME, TITLE and any the-like free-text label to be
 * written with an Uppercase First Letter (Title Case). Profile fields are
 * normalized on blur and save; other labels are normalized when saved.
 */

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on',
  'or', 'per', 'so', 'the', 'to', 'up', 'via', 'yet',
]);
const KNOWN_ACRONYMS = new Set(['5W1H', 'COA', 'DILG', 'DRRM', 'GAD', 'ICT', 'LGU', 'MC', 'NCR', 'OIC']);

/** Force the first character of a token to uppercase, keep the rest as-is. */
function upperFirst(token: string): string {
  if (!token) return token;
  const m = token.match(/^([^A-Za-z]*)(.*)$/s)!;
  const prefix = m[1]; // leading punctuation, e.g. "(", "“", "\""
  const rest = m[2];
  if (!rest) return token;
  return prefix + rest[0].toUpperCase() + rest.slice(1);
}

/** Normalize profile names and designations regardless of the entered casing. */
export function toProfileTitleCase(input?: string | null): string {
  if (!input) return '';
  const normalized = input.replace(/\s+/g, ' ').trim();
  return normalized
    .split(' ')
    .map((word, i, arr) => {
      if (KNOWN_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      const bare = word.toLocaleLowerCase().replace(/[^a-z]/g, '');
      if (bare && SMALL_WORDS.has(bare) && i !== 0 && i !== arr.length - 1) {
        return word.toLocaleLowerCase();
      }
      return upperFirst(word.toLocaleLowerCase());
    })
    .join(' ');
}

/**
 * "junfranz rock c. calibo" → "Junfranz Rock C. Calibo"
 * "administrative officer"  → "Administrative Officer"
 * Existing mixed-case words and known ALL-CAPS acronyms are preserved.
 */
export function toTitleCase(input?: string | null): string {
  if (!input) return '';
  const normalized = input.replace(/\s+/g, ' ').trim();
  const allUppercase = normalized === normalized.toLocaleUpperCase();
  return normalized
    .split(' ')
    .map((word, i, arr) => {
      // Preserve known acronyms in uppercase names while converting all-caps
      // personal names and designations into readable title case.
      if (KNOWN_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      if (!allUppercase && /^[A-Z0-9.,'”")(-]+$/.test(word) && /[A-Z]{2,}/.test(word)) return word;
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
      return upperFirst(allUppercase ? word.toLocaleLowerCase() : word);
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

/** Normalize profile name and designation fields for both stored and fallback profiles. */
export function normalizeProfileNameFields<
  T extends { full_name: string | null; position: string | null },
>(profile: T): T {
  return {
    ...profile,
    full_name: profile.full_name ? toProfileTitleCase(profile.full_name) : profile.full_name,
    position: profile.position ? toProfileTitleCase(profile.position) : profile.position,
  };
}
