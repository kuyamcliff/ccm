import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SITE_CONFIG, parseSiteConfig } from "./siteConfig.js";

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

  it("never invents a payment method beyond the two wallets", () => {
    const config = parseSiteConfig(JSON.stringify({ payments: { mtn: true, orange: true, card: true } }));
    assert.deepEqual(Object.keys(config.payments).sort(), ["mtn", "orange"]);
  });
});
