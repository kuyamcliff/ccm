/**
 * Searching a menu the way people actually type on a phone.
 *
 * The naive version — lowercase the query, ask whether the name contains it —
 * fails on almost everything a real thumb produces. "Poulet grillé" does not
 * match "grille" typed without the accent. "chicken suya" does not match a
 * dish called "Suya chicken" because the words are the other way round. And
 * "chikcen" matches nothing at all, which on a menu is indistinguishable from
 * "we do not sell chicken".
 *
 * So: normalise away the things that are not differences, match on whole words
 * in any order, and when there is still nothing, work out what they probably
 * meant from the menu's own words rather than showing them an empty page.
 */

/**
 * Strips everything that is not a real difference between two words.
 *
 * Accents go because a phone keyboard set to English will not produce them and
 * the dish is still the same dish. Punctuation goes so "chef's" and "chefs"
 * are one word. Everything ends up lowercase and single-spaced.
 */
export function normalise(text: string): string {
  return text
    .normalize("NFD")
    /* Combining marks: the accents themselves, now separated from their
       letters by NFD. Removing them turns "é" into "e" without touching any
       letter that is not accented. */
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words of a query or a dish, with the empty ones dropped. */
export function tokens(text: string): string[] {
  const cleaned = normalise(text);
  return cleaned === "" ? [] : cleaned.split(" ");
}

/**
 * How many single-character edits turn one word into the other, counting a
 * swap of two neighbours as one edit rather than two.
 *
 * That last part is the whole reason this is not plain Levenshtein: "chikcen"
 * for "chicken" is one slip of two fingers, and treating it as two mistakes
 * puts it outside every threshold worth using.
 *
 * `ceiling` stops the work early once the answer is known to be too far to
 * matter, which is the common case when scanning a whole menu.
 */
export function editDistance(a: string, b: string, ceiling = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > ceiling) return ceiling + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let twoBack: number[] = [];
  let oneBack: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current: number[] = [];

  for (let i = 1; i <= a.length; i++) {
    current = new Array<number>(b.length + 1);
    current[0] = i;
    let best = current[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1]! + 1, // insertion
        oneBack[j]! + 1, // deletion
        oneBack[j - 1]! + cost // substitution
      );
      // Two neighbours swapped: one mistake, not two.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2]! + 1);
      }
      current[j] = value;
      if (value < best) best = value;
    }

    /* Every later row is at least as large as the smallest value in this one,
       so once that floor is past the ceiling the true answer cannot come back
       under it. */
    if (best > ceiling) return ceiling + 1;

    twoBack = oneBack;
    oneBack = current;
  }

  return oneBack[b.length]!;
}

/**
 * How wrong a word is allowed to be before we stop guessing.
 *
 * Scaled by length, because one wrong letter in three is a different word
 * ("rib" and "rice") while one wrong letter in eight is a typo. Below four
 * letters nothing is close enough to be worth suggesting.
 */
export function toleranceFor(word: string): number {
  if (word.length < 4) return 0;
  if (word.length < 7) return 1;
  return 2;
}

/** A thing that can be searched: whatever text should be matched against. */
export interface Searchable {
  /** Every word worth matching on — the name, the description, the category. */
  haystack: string;
}

/**
 * Whether an item matches, on whole words, in any order.
 *
 * Each word of the query has to appear somewhere in the item — as a prefix of
 * one of its words, so "chick" finds "chicken", but not as a fragment from the
 * middle, so "hick" does not. Word order does not matter, because "chicken
 * suya" and "suya chicken" are the same request.
 */
export function itemMatches(item: Searchable, queryTokens: readonly string[]): boolean {
  if (queryTokens.length === 0) return true;
  const words = tokens(item.haystack);
  return queryTokens.every((needle) => words.some((word) => word.startsWith(needle)));
}

/**
 * The closest word in `vocabulary` to `word`, or nothing if none is close.
 *
 * Ties go to the more common word: if two dishes are equally near a typo, the
 * one that appears more often on the menu is the likelier intent.
 */
function closestWord(word: string, vocabulary: ReadonlyMap<string, number>): string | null {
  const tolerance = toleranceFor(word);
  if (tolerance === 0) return null;

  let best: string | null = null;
  let bestDistance = tolerance + 1;
  let bestCount = 0;

  for (const [candidate, count] of vocabulary) {
    if (candidate === word) return null; // It is already a real word. Nothing to suggest.
    const distance = editDistance(word, candidate, tolerance);
    if (distance > tolerance) continue;
    if (distance < bestDistance || (distance === bestDistance && count > bestCount)) {
      best = candidate;
      bestDistance = distance;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Every word on the menu, and how many dishes each one appears on.
 *
 * Dishes, not occurrences: a word repeated three times in one long description
 * is one dish talking about itself, while a word on three different dishes is
 * a word the guest is three times as likely to have meant.
 */
export function buildVocabulary(items: readonly Searchable[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const word of new Set(tokens(item.haystack))) {
      // One-letter and two-letter words are noise to suggest from.
      if (word.length < 3) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * What the guest probably meant, when nothing matched what they typed.
 *
 * Returns the whole corrected query, not just the word that changed, so it can
 * be dropped straight back into the box: "chikcen suya" comes back as "chicken
 * suya" rather than "chicken". Returns nothing when no word is close enough,
 * or when the correction would be the query itself.
 */
export function suggestQuery(query: string, vocabulary: ReadonlyMap<string, number>): string | null {
  const words = tokens(query);
  if (words.length === 0) return null;

  let changed = false;
  const corrected = words.map((word) => {
    if (vocabulary.has(word)) return word;
    const fix = closestWord(word, vocabulary);
    if (fix === null) return word;
    changed = true;
    return fix;
  });

  if (!changed) return null;
  const result = corrected.join(" ");
  return result === normalise(query) ? null : result;
}
