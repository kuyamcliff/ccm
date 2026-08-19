import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { featureIsOn, readWindow, windowIsOpen } from "./featureWindow.js";

/*
 * These cases are deliberately mirrored in the customer app's
 * siteConfig.test.ts. The two packages build separately and cannot share a
 * module, so the guarantee that they agree is that both are held to the same
 * list. A button the app hides but the API still accepts is not a disabled
 * feature, and the failure mode is invisible until somebody exploits it.
 */

const OPEN = new Date("2026-12-25T12:00:00Z");

describe("windowIsOpen", () => {
  it("is open inside the window", () => {
    assert.equal(windowIsOpen({ startAt: "2026-12-01T00:00:00Z", endAt: "2027-01-01T00:00:00Z" }, OPEN), true);
  });

  it("is shut before the window", () => {
    assert.equal(windowIsOpen({ startAt: "2027-01-01T00:00:00Z", endAt: null }, OPEN), false);
  });

  it("is shut after the window", () => {
    assert.equal(windowIsOpen({ startAt: null, endAt: "2026-12-01T00:00:00Z" }, OPEN), false);
  });

  it("includes the first instant and excludes the last", () => {
    // "From nine until five" is open at nine and shut at five, which is what
    // everybody who is not writing the code means by it.
    const at = new Date("2026-12-25T12:00:00Z");
    assert.equal(windowIsOpen({ startAt: "2026-12-25T12:00:00Z", endAt: null }, at), true);
    assert.equal(windowIsOpen({ startAt: null, endAt: "2026-12-25T12:00:00Z" }, at), false);
  });

  it("treats an absent end as unbounded", () => {
    assert.equal(windowIsOpen({ startAt: "2020-01-01T00:00:00Z", endAt: null }, OPEN), true);
  });

  it("treats an absent start as unbounded", () => {
    assert.equal(windowIsOpen({ startAt: null, endAt: "2030-01-01T00:00:00Z" }, OPEN), true);
  });

  it("is never open when the end is before the start", () => {
    // Not reinterpreted: the owner typed the dates the wrong way round and
    // should see the feature off rather than something clever.
    const backwards = { startAt: "2027-01-01T00:00:00Z", endAt: "2026-01-01T00:00:00Z" };
    assert.equal(windowIsOpen(backwards, OPEN), false);
    assert.equal(windowIsOpen(backwards, new Date("2026-06-01T00:00:00Z")), false);
    assert.equal(windowIsOpen(backwards, new Date("2027-06-01T00:00:00Z")), false);
  });

  it("ignores an end it cannot read rather than shutting on it", () => {
    // One typo must not take a feature down on its own.
    assert.equal(windowIsOpen({ startAt: "2020-01-01T00:00:00Z", endAt: "not a date" }, OPEN), true);
  });
});

describe("readWindow", () => {
  it("reads both ends", () => {
    assert.deepEqual(readWindow({ startAt: "2026-12-01T00:00:00Z", endAt: "2027-01-01T00:00:00Z" }), {
      startAt: "2026-12-01T00:00:00.000Z",
      endAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("gives nothing back when there is no window", () => {
    for (const value of [null, undefined, {}, { startAt: null, endAt: null }, { startAt: "", endAt: "  " }, "nope", 7, []]) {
      assert.equal(readWindow(value), null, `${JSON.stringify(value)} is not a window`);
    }
  });

  it("keeps the end it can read and drops the one it cannot", () => {
    assert.deepEqual(readWindow({ startAt: "tomorrow", endAt: "2027-01-01T00:00:00Z" }), {
      startAt: null,
      endAt: "2027-01-01T00:00:00.000Z",
    });
  });
});

describe("featureIsOn", () => {
  it("is on when the switch is on and there is no schedule", () => {
    assert.equal(featureIsOn({ ordering: true }, {}, "ordering", OPEN), true);
  });

  it("is on when the feature is not mentioned at all", () => {
    // A config written before a feature existed must not turn that feature off
    // for everybody the day it ships.
    assert.equal(featureIsOn({}, {}, "giftCards", OPEN), true);
    assert.equal(featureIsOn(undefined, undefined, "giftCards", OPEN), true);
  });

  it("is off when the switch is off, schedule or no schedule", () => {
    // The switch can only take away and the schedule can only take away. A
    // schedule must never turn on something the owner switched off.
    assert.equal(featureIsOn({ ordering: false }, {}, "ordering", OPEN), false);
    assert.equal(
      featureIsOn({ ordering: false }, { ordering: { startAt: "2020-01-01T00:00:00Z", endAt: null } }, "ordering", OPEN),
      false
    );
  });

  it("is off when the switch is on but the window has not opened", () => {
    assert.equal(
      featureIsOn({ ordering: true }, { ordering: { startAt: "2027-01-01T00:00:00Z", endAt: null } }, "ordering", OPEN),
      false
    );
  });

  it("is off when the switch is on but the window has closed", () => {
    assert.equal(
      featureIsOn({ ordering: true }, { ordering: { startAt: null, endAt: "2026-12-01T00:00:00Z" } }, "ordering", OPEN),
      false
    );
  });

  it("ignores a schedule belonging to a different feature", () => {
    assert.equal(
      featureIsOn({ ordering: true }, { booking: { startAt: "2027-01-01T00:00:00Z", endAt: null } }, "ordering", OPEN),
      true
    );
  });

  it("survives a schedules section that is not an object", () => {
    assert.equal(featureIsOn({ ordering: true }, { ordering: "christmas" } as Record<string, unknown>, "ordering", OPEN), true);
  });
});
