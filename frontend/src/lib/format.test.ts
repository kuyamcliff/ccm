import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initials,
  money,
  normalisePhone,
  parseDay,
  parseLines,
  parseStamp,
  parseTags,
  phoneLabel,
  pluralise,
  timeLabel,
  toISODate,
} from "./format.js";

describe("phone handling", () => {
  /* Cameroon numbers are nine digits and people write them with or without the
     237 country code, with spaces, or with a leading +. All of those are the
     same number and none of them should be rejected at the door. */

  it("formats a bare nine-digit number", () => {
    assert.equal(phoneLabel("677123456"), "6 77 12 34 56");
  });

  it("formats the same number written with the country code", () => {
    assert.equal(phoneLabel("237677123456"), "6 77 12 34 56");
    assert.equal(phoneLabel("+237 677 123 456"), "6 77 12 34 56");
  });

  it("hands back anything that is not nine digits untouched", () => {
    assert.equal(phoneLabel("12345"), "12345");
    assert.equal(phoneLabel(""), "");
    assert.equal(phoneLabel("not a phone"), "not a phone");
  });

  it("normalises every written form to the same nine digits", () => {
    const forms = ["677123456", "+237677123456", "237 677 123 456", "(237) 677-123-456"];
    for (const form of forms) assert.equal(normalisePhone(form), "677123456", `for ${form}`);
  });
});

describe("parseTags", () => {
  it("reads a stored JSON array of tags", () => {
    assert.deepEqual(parseTags('["spicy","halal"]'), ["spicy", "halal"]);
  });

  it("is empty for nothing stored", () => {
    assert.deepEqual(parseTags(null), []);
    assert.deepEqual(parseTags(undefined), []);
    assert.deepEqual(parseTags(""), []);
  });

  it("does not throw on malformed JSON from the database", () => {
    assert.deepEqual(parseTags("{oops"), []);
    assert.deepEqual(parseTags("not json at all"), []);
  });

  it("drops non-string entries rather than rendering them", () => {
    assert.deepEqual(parseTags('["spicy",42,null,{"a":1},"halal"]'), ["spicy", "halal"]);
  });

  it("is empty when the stored JSON is not an array", () => {
    assert.deepEqual(parseTags('{"spicy":true}'), []);
    assert.deepEqual(parseTags('"spicy"'), []);
  });
});

describe("parseLines", () => {
  /* Order lines are stored as a JSON blob written by an older version of the
     product, so this has to tolerate shapes the current code would never emit. */

  it("reads well-formed order lines", () => {
    assert.deepEqual(parseLines('[{"id":3,"name":"Chicken","qty":2,"price":3500}]'), [
      { id: 3, name: "Chicken", qty: 2, price: 3500 },
    ]);
  });

  it("is empty for nothing stored, and never throws on bad JSON", () => {
    assert.deepEqual(parseLines(null), []);
    assert.deepEqual(parseLines("{oops"), []);
    assert.deepEqual(parseLines('{"not":"an array"}'), []);
  });

  it("omits the id when the stored one is not a usable menu id", () => {
    // A line without a real id cannot be restored by "Order again".
    for (const bad of ["0", "-1", '"abc"', "null", "1.5"]) {
      const [line] = parseLines(`[{"id":${bad},"name":"X","qty":1,"price":1}]`);
      assert.equal(line !== undefined && "id" in line, false, `id ${bad} should be dropped`);
    }
  });

  it("falls back to a readable name rather than showing undefined", () => {
    assert.deepEqual(parseLines('[{"qty":1,"price":100}]'), [{ name: "Item", qty: 1, price: 100 }]);
  });

  it("skips entries that are not objects", () => {
    assert.deepEqual(parseLines('[null,"x",5,{"name":"Real","qty":1,"price":10}]'), [
      { name: "Real", qty: 1, price: 10 },
    ]);
  });
});

describe("dates and times", () => {
  it("parses a stored day without shifting it across a timezone", () => {
    const day = parseDay("2026-08-19");
    assert.notEqual(day, null);
    assert.equal(toISODate(day!), "2026-08-19", "the day must survive the round trip");
  });

  it("rejects anything that is not a stored day", () => {
    assert.equal(parseDay("19/08/2026"), null);
    assert.equal(parseDay("2026-8-9"), null);
    assert.equal(parseDay(""), null);
  });

  it("parses a stored timestamp, treating the space form as UTC", () => {
    const withSpace = parseStamp("2026-08-19 10:30:00");
    const withT = parseStamp("2026-08-19T10:30:00Z");
    assert.notEqual(withSpace, null);
    assert.equal(withSpace!.getTime(), withT!.getTime());
  });

  it("returns null for a missing or unparseable timestamp", () => {
    assert.equal(parseStamp(null), null);
    assert.equal(parseStamp(undefined), null);
    assert.equal(parseStamp("never"), null);
  });

  it("trims a stored time to hours and minutes", () => {
    assert.equal(timeLabel("19:30:00"), "19:30");
    assert.equal(timeLabel("19:30"), "19:30");
  });
});

describe("small formatters", () => {
  it("groups money without inventing a currency symbol", () => {
    assert.equal(money(3500), "3,500");
    assert.equal(money(125000), "125,000");
    assert.equal(money(0), "0");
  });

  it("builds initials from a name, capped at two", () => {
    assert.equal(initials("Kuyam Cliff"), "KC");
    assert.equal(initials("Ngozi Fon Ndikum Achumbe"), "NF");
    assert.equal(initials("cliff"), "C");
  });

  it("falls back to a placeholder rather than an empty avatar", () => {
    assert.equal(initials(""), "?");
    assert.equal(initials("   "), "?");
  });

  it("pluralises on the count", () => {
    assert.equal(pluralise(1, "guest"), "1 guest");
    assert.equal(pluralise(4, "guest"), "4 guests");
    assert.equal(pluralise(0, "guest"), "0 guests");
    assert.equal(pluralise(2, "person", "people"), "2 people");
  });
});
