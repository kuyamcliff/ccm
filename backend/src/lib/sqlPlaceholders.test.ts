import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countPlaceholders, SqlPlaceholderError, toPositional } from "./sqlPlaceholders.js";

describe("toPositional", () => {
  it("numbers placeholders in order", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE a = ? AND b = ? AND c = ?"),
      "SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3"
    );
  });

  it("leaves SQL without placeholders untouched", () => {
    assert.equal(toPositional("SELECT 1"), "SELECT 1");
  });

  /* The reason this module exists. Each of the cases below rewrote incorrectly
     under the previous single-flag scanner, and each is silently wrong data
     rather than a crash, so they are the ones worth pinning down. */

  it("ignores a question mark inside a string literal", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE label = 'why?' AND id = ?"),
      "SELECT * FROM t WHERE label = 'why?' AND id = $1"
    );
  });

  it("handles the '' escape without losing track of the quote state", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE s = 'it''s a ? here' AND id = ?"),
      "SELECT * FROM t WHERE s = 'it''s a ? here' AND id = $1"
    );
  });

  it("ignores a question mark inside a quoted identifier", () => {
    assert.equal(
      toPositional('SELECT "we?rd" FROM t WHERE id = ?'),
      'SELECT "we?rd" FROM t WHERE id = $1'
    );
  });

  it("ignores a question mark inside a line comment", () => {
    assert.equal(
      toPositional("SELECT 1 -- what? why?\nWHERE id = ?"),
      "SELECT 1 -- what? why?\nWHERE id = $1"
    );
  });

  it("ignores a question mark inside a block comment", () => {
    assert.equal(
      toPositional("SELECT 1 /* huh? */ WHERE id = ?"),
      "SELECT 1 /* huh? */ WHERE id = $1"
    );
  });

  it("handles nested block comments, which PostgreSQL permits", () => {
    assert.equal(
      toPositional("SELECT 1 /* a /* b? */ c? */ WHERE id = ?"),
      "SELECT 1 /* a /* b? */ c? */ WHERE id = $1"
    );
  });

  it("ignores a question mark inside a dollar-quoted string", () => {
    assert.equal(
      toPositional("DO $$ BEGIN RAISE NOTICE 'what?'; END $$; SELECT ?"),
      "DO $$ BEGIN RAISE NOTICE 'what?'; END $$; SELECT $1"
    );
  });

  it("ignores a question mark inside a tagged dollar-quoted string", () => {
    assert.equal(
      toPositional("SELECT $tag$ a ? b $tag$, ?"),
      "SELECT $tag$ a ? b $tag$, $1"
    );
  });

  it("collapses ?? to a literal question mark for jsonb operators", () => {
    // `data ? 'key'` is a real jsonb operator. Written `??` so it survives.
    assert.equal(
      toPositional("SELECT * FROM t WHERE data ?? 'key' AND id = ?"),
      "SELECT * FROM t WHERE data ? 'key' AND id = $1"
    );
  });

  it("collapses the ??| and ??& jsonb operator forms", () => {
    assert.equal(toPositional("SELECT ??| a, ??& b, ?"), "SELECT ?| a, ?& b, $1");
  });

  it("does not let an escaped ?? consume a following placeholder", () => {
    assert.equal(toPositional("SELECT ?? , ? , ?"), "SELECT ? , $1 , $2");
  });

  it("keeps an existing $1 in the SQL from colliding with numbering", () => {
    // Not something this codebase writes, but the output must stay readable.
    assert.equal(toPositional("SELECT ? WHERE x = ?"), "SELECT $1 WHERE x = $2");
  });

  it("refuses an unterminated string literal rather than guessing", () => {
    assert.throws(() => toPositional("SELECT * FROM t WHERE s = 'oops"), SqlPlaceholderError);
  });

  it("refuses an unterminated quoted identifier", () => {
    assert.throws(() => toPositional('SELECT "oops FROM t'), SqlPlaceholderError);
  });

  it("refuses an unterminated dollar-quoted string", () => {
    assert.throws(() => toPositional("SELECT $$ oops"), SqlPlaceholderError);
  });

  it("refuses an unterminated block comment", () => {
    assert.throws(() => toPositional("SELECT 1 /* oops"), SqlPlaceholderError);
  });
});

describe("countPlaceholders", () => {
  it("counts what the statement will bind", () => {
    assert.equal(countPlaceholders("SELECT * FROM t WHERE a = ? AND b = ?"), 2);
  });

  it("does not count question marks that are not placeholders", () => {
    assert.equal(countPlaceholders("SELECT 'a?' , \"b?\" -- c?\n, ?"), 1);
  });

  it("is zero for a statement that binds nothing", () => {
    assert.equal(countPlaceholders("SELECT 1"), 0);
  });
});
