import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nearbySlots } from "./bookingSlots.js";

/** The window the booking route accepts: 09:00 through 22:30, every half hour. */
const SLOTS: string[] = [];
for (let h = 9; h <= 22; h++) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

describe("nearbySlots", () => {
  it("offers the closest free slots either side of the one that was taken", () => {
    assert.deepEqual(nearbySlots(SLOTS, "19:30", new Set(), null), ["20:00", "19:00", "20:30"]);
  });

  it("prefers the later slot when two are equally close", () => {
    // Somebody who planned to arrive at 19:30 can usually still make 20:00,
    // and often cannot get there for 19:00.
    const [first] = nearbySlots(SLOTS, "19:30", new Set(), null);
    assert.equal(first, "20:00");
  });

  it("skips slots that are already spoken for", () => {
    const taken = new Set(["20:00", "19:00", "20:30"]);
    assert.deepEqual(nearbySlots(SLOTS, "19:30", taken, null), ["18:30", "21:00", "18:00"]);
  });

  it("never suggests the slot that was just refused", () => {
    assert.ok(!nearbySlots(SLOTS, "19:30", new Set(["19:30"]), null).includes("19:30"));
  });

  it("does not run past the start of service", () => {
    assert.deepEqual(nearbySlots(SLOTS, "09:00", new Set(), null), ["09:30", "10:00", "10:30"]);
  });

  it("does not run past the end of service", () => {
    assert.deepEqual(nearbySlots(SLOTS, "22:30", new Set(), null), ["22:00", "21:30", "21:00"]);
  });

  it("drops slots that have already gone by today", () => {
    // Refused at 19:30 with the clock at 19:15: 19:00 is not on offer.
    const result = nearbySlots(SLOTS, "19:30", new Set(), "19:15");
    assert.ok(!result.includes("19:00"));
    assert.deepEqual(result, ["20:00", "20:30", "21:00"]);
  });

  it("returns nothing rather than something wrong when the day is full", () => {
    assert.deepEqual(nearbySlots(SLOTS, "19:30", new Set(SLOTS), null), []);
  });

  it("returns nothing for a time that is not a slot at all", () => {
    assert.deepEqual(nearbySlots(SLOTS, "19:47", new Set(), null), []);
  });

  it("stays inside two hours of what was asked for", () => {
    // Everything nearer is taken. The far end of the day is not a near miss,
    // it is a different evening, and the guest should choose that themselves.
    const taken = new Set(SLOTS.filter((s) => s >= "17:30" && s <= "21:30"));
    assert.deepEqual(nearbySlots(SLOTS, "19:30", taken, null), []);
  });

  it("honours a smaller limit", () => {
    assert.equal(nearbySlots(SLOTS, "19:30", new Set(), null, 1).length, 1);
  });
});
