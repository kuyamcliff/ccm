import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SITE_CONFIG,
  featureIsOn,
  nextFeatureBoundary,
  parseSiteConfig,
  resolveFeatures,
  windowIsOpen,
  type SiteConfig,
} from "./siteConfig.js";

/**
 * `parseSiteConfig` is the single point where owner-controlled configuration
 * crosses from the database into the customer application. Everything the
 * frontend shows or hides — every feature gate, every service pause, the
 * announcement bar, the payment wallets — is decided by what comes out of here.
 *
 * That makes its real contract "never throw, never return something incomplete",
 * because the alternative to a valid config is not a smaller site, it is a
 * customer looking at a crashed page. These tests hold it to that.
 */

describe("parseSiteConfig", () => {
  it("returns the defaults when there is nothing stored", () => {
    assert.deepEqual(parseSiteConfig(undefined), DEFAULT_SITE_CONFIG);
    assert.deepEqual(parseSiteConfig(""), DEFAULT_SITE_CONFIG);
  });

  it("returns a copy, so a caller cannot mutate the shared defaults", () => {
    const first = parseSiteConfig(undefined);
    first.features.ordering = false;
    assert.equal(parseSiteConfig(undefined).features.ordering, true);
    assert.equal(DEFAULT_SITE_CONFIG.features.ordering, true);
  });

  it("falls back to defaults on malformed JSON instead of throwing", () => {
    assert.deepEqual(parseSiteConfig("{ not json"), DEFAULT_SITE_CONFIG);
    assert.deepEqual(parseSiteConfig("null"), DEFAULT_SITE_CONFIG);
  });

  it("survives JSON that is valid but the wrong shape", () => {
    for (const raw of ['"a string"', "42", "true", "[1,2,3]"]) {
      const config = parseSiteConfig(raw);
      assert.equal(typeof config.features.ordering, "boolean", `for ${raw}`);
      assert.equal(typeof config.business.mode, "string", `for ${raw}`);
    }
  });

  it("keeps a stored feature switch", () => {
    const config = parseSiteConfig(JSON.stringify({ features: { ordering: false } }));
    assert.equal(config.features.ordering, false);
    // Everything not mentioned stays at its default rather than vanishing.
    assert.equal(config.features.booking, true);
  });

  it("ignores a non-boolean feature value rather than treating it as truthy", () => {
    const config = parseSiteConfig(JSON.stringify({ features: { ordering: "no" } }));
    assert.equal(config.features.ordering, true, "a bad value must not silently disable a service");
  });

  it("only accepts business modes it knows", () => {
    assert.equal(parseSiteConfig(JSON.stringify({ business: { mode: "busy" } })).business.mode, "busy");
    assert.equal(parseSiteConfig(JSON.stringify({ business: { mode: "closed" } })).business.mode, "closed");
    assert.equal(parseSiteConfig(JSON.stringify({ business: { mode: "on fire" } })).business.mode, "open");
  });

  it("only accepts service modes it knows", () => {
    const paused = parseSiteConfig(JSON.stringify({ services: { ordering: { mode: "paused" } } }));
    assert.equal(paused.services.ordering.mode, "paused");
    const nonsense = parseSiteConfig(JSON.stringify({ services: { ordering: { mode: "wat" } } }));
    assert.equal(nonsense.services.ordering.mode, "open");
  });

  it("keeps both halves of a localised message", () => {
    const config = parseSiteConfig(
      JSON.stringify({ announcement: { enabled: true, message: { en: "Closed", fr: "Fermé" } } })
    );
    assert.equal(config.announcement.enabled, true);
    assert.equal(config.announcement.message.en, "Closed");
    assert.equal(config.announcement.message.fr, "Fermé");
  });

  it("fills in a missing half of a localised message from the default", () => {
    const config = parseSiteConfig(JSON.stringify({ business: { message: { en: "Only English" } } }));
    assert.equal(config.business.message.en, "Only English");
    assert.equal(config.business.message.fr, DEFAULT_SITE_CONFIG.business.message.fr);
  });

  it("clamps the support response time into a sane range", () => {
    const asMinutes = (v: unknown) =>
      parseSiteConfig(JSON.stringify({ support: { responseMinutes: v } })).support.responseMinutes;
    assert.equal(asMinutes(30), 30);
    assert.equal(asMinutes(0), 1, "zero minutes would read as an instant reply");
    assert.equal(asMinutes(-5), 1);
    assert.equal(asMinutes(99999), 1440, "capped at a day");
    assert.equal(asMinutes(12.6), 13, "rounded, not truncated to a fraction");
    assert.equal(asMinutes("soon"), 15, "a non-number falls back to the default");
    assert.equal(asMinutes(Number.NaN), 15);
    assert.equal(asMinutes(Number.POSITIVE_INFINITY), 15);
  });

  it("defaults the locale to English unless French is explicitly stored", () => {
    assert.equal(parseSiteConfig(JSON.stringify({ defaultLocale: "fr" })).defaultLocale, "fr");
    assert.equal(parseSiteConfig(JSON.stringify({ defaultLocale: "de" })).defaultLocale, "en");
    assert.equal(parseSiteConfig(JSON.stringify({})).defaultLocale, "en");
  });

  it("keeps the payment wallets independently switchable", () => {
    const config = parseSiteConfig(JSON.stringify({ payments: { mtn: false, orange: true } }));
    assert.equal(config.payments.mtn, false);
    assert.equal(config.payments.orange, true);
  });

  it("never invents a payment method beyond the ones this product offers", () => {
    /* `card: true` in the blob must not become a card payment option. This is
       the product's hardest constraint and CI fails the build on card terms in
       the source, so the parser is held to the same line. */
    const config = parseSiteConfig(JSON.stringify({ payments: { mtn: true, orange: true, card: true } }));
    assert.deepEqual(Object.keys(config.payments).sort(), ["cash", "mtn", "orange"]);
  });
});

/*
 * Feature scheduling.
 *
 * These cases are deliberately mirrored in the API's featureWindow.test.ts.
 * The two packages build separately and cannot share a module, so the
 * guarantee that they agree is that both are held to the same list. A button
 * this app hides but the API still accepts is not a disabled feature, and the
 * failure mode is invisible until somebody exploits it.
 */

const OPEN = new Date("2026-12-25T12:00:00Z");

function withSchedule(schedules: Record<string, unknown>, features: Record<string, unknown> = {}): SiteConfig {
  return parseSiteConfig(JSON.stringify({ features, schedules }));
}

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
    const at = new Date("2026-12-25T12:00:00Z");
    assert.equal(windowIsOpen({ startAt: "2026-12-25T12:00:00Z", endAt: null }, at), true);
    assert.equal(windowIsOpen({ startAt: null, endAt: "2026-12-25T12:00:00Z" }, at), false);
  });

  it("is never open when the end is before the start", () => {
    const backwards = { startAt: "2027-01-01T00:00:00Z", endAt: "2026-01-01T00:00:00Z" };
    assert.equal(windowIsOpen(backwards, OPEN), false);
    assert.equal(windowIsOpen(backwards, new Date("2026-06-01T00:00:00Z")), false);
    assert.equal(windowIsOpen(backwards, new Date("2027-06-01T00:00:00Z")), false);
  });

  it("ignores an end it cannot read rather than shutting on it", () => {
    assert.equal(windowIsOpen({ startAt: "2020-01-01T00:00:00Z", endAt: "not a date" }, OPEN), true);
  });
});

describe("parseSiteConfig schedules", () => {
  it("has no schedules by default", () => {
    assert.deepEqual(parseSiteConfig(undefined).schedules, {});
  });

  it("reads a window off the stored config", () => {
    const config = withSchedule({ ordering: { startAt: "2026-12-01T00:00:00Z", endAt: "2027-01-01T00:00:00Z" } });
    assert.deepEqual(config.schedules.ordering, {
      startAt: "2026-12-01T00:00:00.000Z",
      endAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("drops a schedule for something that is not a feature", () => {
    const config = withSchedule({ notAFeature: { startAt: "2026-12-01T00:00:00Z", endAt: null } });
    assert.deepEqual(config.schedules, {});
  });

  it("drops a window with neither end, so the console shows nothing the owner did not set", () => {
    assert.deepEqual(withSchedule({ ordering: { startAt: null, endAt: null } }).schedules, {});
    assert.deepEqual(withSchedule({ ordering: {} }).schedules, {});
  });

  it("survives a schedules section that is not an object", () => {
    assert.deepEqual(parseSiteConfig(JSON.stringify({ schedules: "christmas" })).schedules, {});
    assert.deepEqual(parseSiteConfig(JSON.stringify({ schedules: [] })).schedules, {});
  });
});

describe("featureIsOn", () => {
  it("is on when the switch is on and there is no schedule", () => {
    assert.equal(featureIsOn(withSchedule({}, { ordering: true }), "ordering", OPEN), true);
  });

  it("is on when the feature is not mentioned at all", () => {
    assert.equal(featureIsOn(parseSiteConfig(undefined), "giftCards", OPEN), true);
  });

  it("is off when the switch is off, schedule or no schedule", () => {
    assert.equal(featureIsOn(withSchedule({}, { ordering: false }), "ordering", OPEN), false);
    assert.equal(
      featureIsOn(withSchedule({ ordering: { startAt: "2020-01-01T00:00:00Z", endAt: null } }, { ordering: false }), "ordering", OPEN),
      false
    );
  });

  it("is off when the switch is on but the window has not opened", () => {
    assert.equal(
      featureIsOn(withSchedule({ ordering: { startAt: "2027-01-01T00:00:00Z", endAt: null } }, { ordering: true }), "ordering", OPEN),
      false
    );
  });

  it("is off when the switch is on but the window has closed", () => {
    assert.equal(
      featureIsOn(withSchedule({ ordering: { startAt: null, endAt: "2026-12-01T00:00:00Z" } }, { ordering: true }), "ordering", OPEN),
      false
    );
  });

  it("ignores a schedule belonging to a different feature", () => {
    assert.equal(
      featureIsOn(withSchedule({ booking: { startAt: "2027-01-01T00:00:00Z", endAt: null } }, { ordering: true }), "ordering", OPEN),
      true
    );
  });
});

describe("resolveFeatures", () => {
  it("hands back every feature, schedules applied", () => {
    const config = withSchedule(
      { ordering: { startAt: "2027-01-01T00:00:00Z", endAt: null } },
      { ordering: true, booking: true, waitlist: false }
    );
    const now = resolveFeatures(config, OPEN);
    assert.equal(now.ordering, false, "scheduled for later");
    assert.equal(now.booking, true, "on, unscheduled");
    assert.equal(now.waitlist, false, "switched off");
    assert.equal(Object.keys(now).length, Object.keys(config.features).length, "every feature must be accounted for");
  });

  it("never invents a payment method beyond the ones this product offers", () => {
    /* Guards the product's hardest constraint against a config blob that tries
       to introduce one.

       The list is three now rather than two: `cash` is settle-at-the-counter for
       a takeaway order, which is money the restaurant takes by hand rather than
       a payment method the site processes. It is still an allowlist, and a card
       still cannot get in through here. */
    const config = parseSiteConfig(JSON.stringify({ payments: { mtn: true, orange: true, unknown_wallet: true, third_option: true } }));
    assert.deepEqual(Object.keys(config.payments).sort(), ["cash", "mtn", "orange"]);
  });
});

describe("nextFeatureBoundary", () => {
  it("is nothing when no feature is scheduled", () => {
    assert.equal(nextFeatureBoundary(parseSiteConfig(undefined), OPEN), null);
  });

  it("finds the soonest edge still ahead", () => {
    const config = withSchedule({
      ordering: { startAt: "2027-03-01T00:00:00Z", endAt: "2027-04-01T00:00:00Z" },
      booking: { startAt: "2027-01-15T00:00:00Z", endAt: null },
    });
    assert.equal(nextFeatureBoundary(config, OPEN)?.toISOString(), "2027-01-15T00:00:00.000Z");
  });

  it("ignores edges that have already gone by", () => {
    const config = withSchedule({ ordering: { startAt: "2020-01-01T00:00:00Z", endAt: "2027-01-01T00:00:00Z" } });
    assert.equal(nextFeatureBoundary(config, OPEN)?.toISOString(), "2027-01-01T00:00:00.000Z");
  });

  it("is nothing when every edge is in the past", () => {
    const config = withSchedule({ ordering: { startAt: "2020-01-01T00:00:00Z", endAt: "2021-01-01T00:00:00Z" } });
    assert.equal(nextFeatureBoundary(config, OPEN), null);
  });
});
