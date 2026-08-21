import { strict as assert } from "node:assert";
import { test } from "node:test";
import { nextOpening } from "./soldOut.js";

/**
 * The only part of the sold-out machinery that can be tested without a
 * database, and the part most likely to be quietly wrong: the timezone.
 */

test("a dish sold out in the evening comes back at midday tomorrow", () => {
  /* 21:30 in Buea on the 14th is 20:30 UTC. */
  const evening = new Date("2026-08-14T20:30:00Z");
  assert.equal(nextOpening(evening), "2026-08-15 11:00:00");
});

test("a dish sold out in the morning comes back the same day", () => {
  /* 09:00 in Buea is 08:00 UTC, which is before the 11:00 UTC opening. */
  const morning = new Date("2026-08-14T08:00:00Z");
  assert.equal(nextOpening(morning), "2026-08-14 11:00:00");
});

test("exactly at opening rolls to the next day rather than expiring at once", () => {
  const atOpening = new Date("2026-08-14T11:00:00Z");
  assert.equal(nextOpening(atOpening), "2026-08-15 11:00:00");
});

test("it rolls over the end of a month", () => {
  const lastNight = new Date("2026-08-31T22:00:00Z");
  assert.equal(nextOpening(lastNight), "2026-09-01 11:00:00");
});
