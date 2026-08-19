import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COPY } from "./copy";

/**
 * The application's own wording, in both languages.
 *
 * Key parity is already enforced by the compiler — `t()` indexes a union of
 * both catalogues, so a key missing from either will not build. What the
 * compiler cannot see is a French entry that was never actually translated:
 * an empty string, or the English text left sitting in the French box. Those
 * ship silently and show up as a site that switches to French and then says
 * half of itself in English.
 *
 * The owner's own wording is not checked here. It lives in the database and is
 * reported to them on the Translations screen, because it is theirs to fix.
 */

/**
 * Words that are genuinely the same in both languages.
 *
 * Kept explicit rather than guessed at: every entry is a decision somebody
 * made, and a new key that happens to match has to be argued for here rather
 * than slipping through.
 */
const SAME_IN_BOTH = new Set([
  "menu", // "Menu" is French too.
  "gallery", // "Photos" is French too.
  "admin", // "Admin" is French too, and it is staff-facing anyway.
]);

describe("the application's own wording", () => {
  it("has the same keys in both languages", () => {
    assert.deepEqual(Object.keys(COPY.en).sort(), Object.keys(COPY.fr).sort());
  });

  it("says something in every language", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const [key, value] of Object.entries(COPY[locale])) {
        assert.ok(typeof value === "string" && value.trim() !== "", `${locale}.${key} is empty`);
      }
    }
  });

  it("does not leave English sitting in the French box", () => {
    const untranslated = Object.keys(COPY.en).filter(
      (key) =>
        !SAME_IN_BOTH.has(key) &&
        COPY.fr[key as keyof typeof COPY.fr].trim().toLowerCase() ===
          COPY.en[key as keyof typeof COPY.en].trim().toLowerCase()
    );
    assert.deepEqual(
      untranslated,
      [],
      `these are still English in the French catalogue: ${untranslated.join(", ")}. Translate them, or add the key to SAME_IN_BOTH if the word really is the same in French.`
    );
  });
});
