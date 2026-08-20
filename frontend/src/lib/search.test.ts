import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVocabulary,
  editDistance,
  itemMatches,
  normalise,
  suggestQuery,
  tokens,
  toleranceFor,
} from "./search";

/** A menu close enough to the real one to be worth testing against. */
const MENU = [
  { haystack: "Grilled chicken Half a chicken over the fire with pepper sauce Grills" },
  { haystack: "Suya chicken Skewered spiced chicken Grills" },
  { haystack: "Grilled goat Goat cuts grilled to order Grills" },
  { haystack: "Poulet grillé Poulet entier au feu de bois Grills" },
  { haystack: "Plantain Sweet fried plantain Sides" },
  { haystack: "Jollof rice Rice cooked in pepper and tomato Sides" },
  { haystack: "Chef's special Ask at the counter Specials" },
];
const VOCAB = buildVocabulary(MENU);

describe("normalise", () => {
  it("lowercases", () => {
    assert.equal(normalise("Grilled Chicken"), "grilled chicken");
  });

  it("strips accents without touching the letters under them", () => {
    // A phone keyboard set to English will not produce "é", and it is the
    // same dish either way.
    assert.equal(normalise("Poulet grillé"), "poulet grille");
    assert.equal(normalise("Crème brûlée"), "creme brulee");
  });

  it("drops punctuation so an apostrophe is not a difference", () => {
    assert.equal(normalise("Chef's special"), "chef s special");
  });

  it("collapses whitespace and trims", () => {
    assert.equal(normalise("  grilled   chicken \n"), "grilled chicken");
  });

  it("survives text with nothing searchable in it", () => {
    assert.equal(normalise("!!! ???"), "");
    assert.equal(normalise(""), "");
  });
});

describe("tokens", () => {
  it("splits into words", () => {
    assert.deepEqual(tokens("Grilled Chicken"), ["grilled", "chicken"]);
  });

  it("gives nothing back for nothing", () => {
    assert.deepEqual(tokens("   "), []);
    assert.deepEqual(tokens("---"), []);
  });
});

describe("editDistance", () => {
  it("is zero for the same word", () => {
    assert.equal(editDistance("chicken", "chicken"), 0);
  });

  it("counts a missing letter as one", () => {
    assert.equal(editDistance("chiken", "chicken"), 1);
  });

  it("counts a wrong letter as one", () => {
    assert.equal(editDistance("chicjen", "chicken"), 1);
  });

  it("counts two swapped neighbours as one, not two", () => {
    // The whole reason this is not plain Levenshtein: two fingers landing out
    // of order is one slip, and calling it two puts it outside every useful
    // threshold.
    assert.equal(editDistance("chikcen", "chicken"), 1);
    assert.equal(editDistance("plantian", "plantain"), 1);
  });

  it("handles an empty side", () => {
    assert.equal(editDistance("", "rice"), 4);
    assert.equal(editDistance("rice", ""), 4);
    assert.equal(editDistance("", ""), 0);
  });

  it("stops early once the answer cannot come back under the ceiling", () => {
    // The exact value past the ceiling does not matter, only that it is over.
    assert.ok(editDistance("chicken", "plantain", 1) > 1);
    assert.ok(editDistance("a".repeat(50), "b".repeat(50), 2) > 2);
  });

  it("gives the same answer with a generous ceiling as with none", () => {
    assert.equal(editDistance("chikcen", "chicken", 5), editDistance("chikcen", "chicken"));
  });
});

describe("toleranceFor", () => {
  it("guesses nothing for a very short word", () => {
    // "rib" and "rice" are one edit apart and are not the same order.
    assert.equal(toleranceFor("rib"), 0);
    assert.equal(toleranceFor("a"), 0);
  });

  it("allows one mistake in a middling word and two in a long one", () => {
    assert.equal(toleranceFor("rice"), 1);
    assert.equal(toleranceFor("goat"), 1);
    assert.equal(toleranceFor("chicken"), 2);
    assert.equal(toleranceFor("plantain"), 2);
  });
});

describe("itemMatches", () => {
  const chicken = MENU[0]!;

  it("matches everything when nothing was typed", () => {
    assert.equal(itemMatches(chicken, []), true);
  });

  it("matches a whole word", () => {
    assert.equal(itemMatches(chicken, tokens("chicken")), true);
  });

  it("matches the start of a word, so a half-typed search still finds things", () => {
    assert.equal(itemMatches(chicken, tokens("chick")), true);
  });

  it("does not match a fragment from the middle of a word", () => {
    // "hick" finding "chicken" is the kind of match that makes a search feel
    // random rather than helpful.
    assert.equal(itemMatches(chicken, tokens("hick")), false);
  });

  it("ignores word order", () => {
    const suya = MENU[1]!;
    assert.equal(itemMatches(suya, tokens("chicken suya")), true);
    assert.equal(itemMatches(suya, tokens("suya chicken")), true);
  });

  it("needs every word of the query, not just one", () => {
    assert.equal(itemMatches(chicken, tokens("grilled plantain")), false);
  });

  it("matches across the accent a guest did not type", () => {
    assert.equal(itemMatches(MENU[3]!, tokens("grille")), true);
    assert.equal(itemMatches(MENU[3]!, tokens("poulet")), true);
  });

  it("matches on the category as well as the dish", () => {
    assert.equal(itemMatches(chicken, tokens("grills")), true);
  });
});

describe("buildVocabulary", () => {
  it("counts dishes, not occurrences", () => {
    // "chicken" is written twice on each of two dishes. That is two dishes, not
    // four mentions: a dish talking about itself must not outweigh a word that
    // appears across the menu.
    assert.equal(VOCAB.get("chicken"), 2);
    assert.equal(VOCAB.get("plantain"), 1);
    assert.equal(VOCAB.get("grills"), 4);
  });

  it("leaves out words too short to suggest from", () => {
    assert.equal(VOCAB.has("a"), false);
    assert.equal(VOCAB.has("in"), false);
  });

  it("holds the accent-stripped form, not the written one", () => {
    assert.equal(VOCAB.has("grille"), true);
    assert.equal(VOCAB.has("grillé"), false);
  });
});

describe("suggestQuery", () => {
  it("corrects a missing letter", () => {
    assert.equal(suggestQuery("chiken", VOCAB), "chicken");
  });

  it("corrects two swapped letters", () => {
    assert.equal(suggestQuery("chikcen", VOCAB), "chicken");
    assert.equal(suggestQuery("plantian", VOCAB), "plantain");
  });

  it("corrects only the wrong word and hands back the whole query", () => {
    // So it can go straight back into the box, rather than making the guest
    // retype the half that was already right.
    assert.equal(suggestQuery("chikcen suya", VOCAB), "chicken suya");
  });

  it("suggests nothing when the word is already on the menu", () => {
    assert.equal(suggestQuery("chicken", VOCAB), null);
    assert.equal(suggestQuery("grilled goat", VOCAB), null);
  });

  it("suggests nothing for a word too short to guess at", () => {
    // "rib" is one edit from "rice" and is not the same order.
    assert.equal(suggestQuery("rib", VOCAB), null);
  });

  it("suggests nothing when the guest typed something else entirely", () => {
    assert.equal(suggestQuery("lasagne", VOCAB), null);
    assert.equal(suggestQuery("xylophone", VOCAB), null);
  });

  it("suggests nothing for an empty query", () => {
    assert.equal(suggestQuery("", VOCAB), null);
    assert.equal(suggestQuery("   ", VOCAB), null);
  });

  it("prefers the word that appears more often when two are equally close", () => {
    const vocab = new Map([["rice", 1], ["rise", 9]]);
    assert.equal(suggestQuery("risa", vocab), "rise");
  });

  it("never suggests back exactly what was typed", () => {
    // A correction that changes nothing is a dead end for the guest.
    assert.equal(suggestQuery("Chicken", VOCAB), null);
    assert.equal(suggestQuery("  chicken  ", VOCAB), null);
  });

  it("survives a vocabulary with nothing in it", () => {
    assert.equal(suggestQuery("chicken", new Map()), null);
  });
});
