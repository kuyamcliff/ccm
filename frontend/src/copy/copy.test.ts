import { strict as assert } from "node:assert";
import { test } from "node:test";
import { COPY, EN, FR, fill } from "./index";

/**
 * Guards on the wording itself.
 *
 * Parity between the two languages is already a compile-time property: `FR` is
 * typed as `Copy`, which is derived from `EN`, so a missing or misspelled key
 * does not build. What a type cannot check is whether the strings are any good,
 * which is what these are for.
 */

/** Walks the whole tree, yielding every leaf with the path that reached it. */
function* strings(node: unknown, path: string[] = []): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path.join("."), node];
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      yield* strings(value, [...path, key]);
    }
  }
}

test("no em dashes or en dashes anywhere a customer can read", () => {
  /*
   * A standing house rule, and one worth a test rather than a habit.
   *
   * On a phone at a small size an em dash is hard to tell from a hyphen, it
   * breaks lines in places that read badly in both languages, and it is the
   * single clearest tell that a sentence was not written by a person. The
   * previous version had them scattered through its copy.
   */
  for (const [locale, tree] of Object.entries(COPY)) {
    for (const [path, value] of strings(tree)) {
      assert.ok(!value.includes("—"), `em dash in ${locale}.${path}: ${value}`);
      assert.ok(!value.includes("–"), `en dash in ${locale}.${path}: ${value}`);
    }
  }
});

test("nothing is blank", () => {
  /* An empty string renders as nothing at all, which is a heading that silently
     disappears rather than an error anybody notices. */
  for (const [locale, tree] of Object.entries(COPY)) {
    for (const [path, value] of strings(tree)) {
      assert.ok(value.trim().length > 0, `blank string at ${locale}.${path}`);
    }
  }
});

test("every placeholder in English exists in French, and the other way round", () => {
  /*
   * `{amount}` in one language and `{montant}` in the other is a hole that never
   * gets filled, and it renders as the literal braces on the screen. The types
   * cannot see inside a string, so this is where it gets caught.
   */
  const holes = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort().join(",");
  const french = new Map(strings(FR));

  for (const [path, english] of strings(EN)) {
    const other = french.get(path);
    assert.ok(other !== undefined, `French is missing ${path}`);
    assert.equal(holes(english), holes(other), `placeholders differ at ${path}`);
  }
});

test("fill replaces what it is given and leaves what it is not", () => {
  assert.equal(fill("Hold it for {amount} FCFA", { amount: "2,500" }), "Hold it for 2,500 FCFA");
  assert.equal(fill("{n} points", { n: 40 }), "40 points");
  /* An unknown placeholder is left alone rather than blanked. A visible
     `{amount}` is a bug somebody reports; a silently empty one is a sentence
     that reads as finished and is not. */
  assert.equal(fill("Hold it for {amount}", {}), "Hold it for {amount}");
});

test("the tagline is the one the restaurant asked for", () => {
  assert.equal(EN.brand.tagline, "The best meat in Buea.");
});
