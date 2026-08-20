import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clashFromError, parseBookingAlternatives } from "./booking";
import { ApiError } from "../http";

describe("parseBookingAlternatives", () => {
  it("reads a well-formed refusal", () => {
    const result = parseBookingAlternatives({
      error: "That table was taken while you were booking.",
      alternatives: {
        times: ["20:00", "19:00"],
        tables: [{ id: 3, label: "T3", zone: "Window", capacity: 4 }],
      },
    });
    assert.deepEqual(result, {
      times: ["20:00", "19:00"],
      tables: [{ id: 3, label: "T3", zone: "Window", capacity: 4 }],
    });
  });

  it("returns nothing for a refusal that carries no suggestions", () => {
    assert.equal(parseBookingAlternatives({ error: "Pick a valid time slot." }), null);
  });

  it("returns nothing rather than an empty offer", () => {
    assert.equal(parseBookingAlternatives({ alternatives: { times: [], tables: [] } }), null);
  });

  /* Everything below arrives over the network on a path that has already
     failed once. None of it may turn a refusal into a blank screen. */

  it("survives a body that is not an object at all", () => {
    for (const value of [null, undefined, 0, "no", true, []]) {
      assert.equal(parseBookingAlternatives(value), null);
    }
  });

  it("survives alternatives that are not an object", () => {
    assert.equal(parseBookingAlternatives({ alternatives: "20:00" }), null);
    assert.equal(parseBookingAlternatives({ alternatives: 7 }), null);
  });

  it("survives times that are not an array", () => {
    const result = parseBookingAlternatives({
      alternatives: { times: "20:00", tables: [{ id: 1, label: "T1", zone: "Bar", capacity: 2 }] },
    });
    assert.deepEqual(result?.times, []);
    assert.equal(result?.tables.length, 1);
  });

  it("drops anything in times that is not a slot", () => {
    const result = parseBookingAlternatives({
      alternatives: { times: ["20:00", "tomorrow", null, 1930, "9:00", "20:30"], tables: [] },
    });
    assert.deepEqual(result?.times, ["20:00", "20:30"]);
  });

  it("drops table entries missing anything the chip has to render", () => {
    const result = parseBookingAlternatives({
      alternatives: {
        times: [],
        tables: [
          { id: 1, label: "T1", zone: "Bar", capacity: 2 },
          { id: "2", label: "T2", zone: "Bar", capacity: 2 },
          { id: 3, label: "", zone: "Bar", capacity: 2 },
          { id: 4, label: "T4", zone: "Bar" },
          { id: 5, label: "T5", zone: "Bar", capacity: Number.NaN },
          null,
          "T7",
        ],
      },
    });
    assert.deepEqual(result?.tables, [{ id: 1, label: "T1", zone: "Bar", capacity: 2 }]);
  });

  it("accepts a table with no zone rather than dropping it", () => {
    // The zone is decoration on the chip; the label and the seats are not.
    const result = parseBookingAlternatives({
      alternatives: { times: [], tables: [{ id: 9, label: "T9", capacity: 6 }] },
    });
    assert.deepEqual(result?.tables, [{ id: 9, label: "T9", zone: "", capacity: 6 }]);
  });
});

describe("clashFromError", () => {
  const body = { clash: "table", error: "That table was taken.", alternatives: { times: ["20:00"], tables: [] } };

  it("reads the reason and the suggestions off a clash", () => {
    const result = clashFromError(new ApiError(409, "That table was taken.", { body }));
    assert.equal(result?.reason, "table");
    assert.deepEqual(result?.alternatives?.times, ["20:00"]);
  });

  it("reads a clash that has nothing to suggest", () => {
    // A day too full to offer anything is still a clash, and still needs its
    // own wording — "check your connection and try again" would be a lie.
    const result = clashFromError(new ApiError(409, "Taken.", { body: { clash: "guest" } }));
    assert.deepEqual(result, { reason: "guest", alternatives: null });
  });

  it("ignores a failure that is not a clash", () => {
    assert.equal(clashFromError(new ApiError(500, "Something broke.", { body })), null);
    assert.equal(clashFromError(new ApiError(0, "Offline.", { body })), null);
  });

  it("ignores a 409 that named no reason", () => {
    // Every other 409 in the app — cancelling twice, hiding a live booking —
    // must not be dressed up as a slot that has gone.
    assert.equal(clashFromError(new ApiError(409, "Already cancelled.", { body: {} })), null);
  });

  it("ignores a reason it does not recognise", () => {
    assert.equal(clashFromError(new ApiError(409, "Taken.", { body: { clash: "kitchen" } })), null);
    assert.equal(clashFromError(new ApiError(409, "Taken.", { body: { clash: 7 } })), null);
  });

  it("ignores anything that is not an ApiError", () => {
    assert.equal(clashFromError(new Error("boom")), null);
    assert.equal(clashFromError(undefined), null);
  });
});
