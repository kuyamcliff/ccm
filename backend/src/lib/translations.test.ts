import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessOwnerContent, assessPair, buildReport, type LegalPageRow } from "./translations.js";

const NO_LEGAL: LegalPageRow[] = [];

describe("assessPair", () => {
  it("is done when both sides say something different", () => {
    const entry = assessPair("x", "X", "Somewhere", "We are open", "Nous sommes ouverts");
    assert.equal(entry?.status, "done");
    assert.equal(entry?.english, "We are open");
  });

  it("is missing when the French box is empty", () => {
    assert.equal(assessPair("x", "X", "S", "We are open", "")?.status, "missing");
    assert.equal(assessPair("x", "X", "S", "We are open", "   ")?.status, "missing");
    assert.equal(assessPair("x", "X", "S", "We are open", null)?.status, "missing");
    assert.equal(assessPair("x", "X", "S", "We are open", undefined)?.status, "missing");
  });

  it("is copied when somebody pasted the English in", () => {
    assert.equal(assessPair("x", "X", "S", "We are open", "We are open")?.status, "copied");
  });

  it("spots a paste through different casing and spacing", () => {
    assert.equal(assessPair("x", "X", "S", "We are open", "  we   are OPEN ")?.status, "copied");
  });

  it("counts nothing when there is no English to translate", () => {
    // An announcement the owner deliberately left off is not an untranslated
    // announcement, and nagging about it would teach them to ignore the report.
    assert.equal(assessPair("x", "X", "S", "", "anything"), null);
    assert.equal(assessPair("x", "X", "S", "   ", ""), null);
    assert.equal(assessPair("x", "X", "S", undefined, undefined), null);
  });
});

describe("buildReport", () => {
  it("counts only what there was something to do about", () => {
    const report = buildReport([
      assessPair("a", "A", "S", "one", "un"),
      assessPair("b", "B", "S", "two", ""),
      null,
    ]);
    assert.equal(report.total, 2);
    assert.equal(report.done, 1);
    assert.equal(report.outstanding.length, 1);
  });

  it("puts an empty box above one somebody pasted into", () => {
    const report = buildReport([
      assessPair("a", "Alpha", "S", "one", "one"),
      assessPair("b", "Bravo", "S", "two", ""),
    ]);
    assert.deepEqual(report.outstanding.map((e) => e.status), ["missing", "copied"]);
  });

  it("leaves finished work out of the list", () => {
    const report = buildReport([assessPair("a", "A", "S", "one", "un")]);
    assert.deepEqual(report.outstanding, []);
    assert.equal(report.done, 1);
  });

  it("reports nothing outstanding for nothing at all", () => {
    assert.deepEqual(buildReport([]), { total: 0, done: 0, outstanding: [] });
  });
});

describe("assessOwnerContent", () => {
  it("finds every owner-entered message in the config", () => {
    const config = {
      business: { message: { en: "We are open", fr: "" } },
      announcement: { message: { en: "Live music Friday", fr: "Live music Friday" } },
      support: { afterHoursMessage: { en: "Nobody is here", fr: "Personne n'est là" } },
      services: {
        ordering: { message: { en: "Takeaway paused", fr: "" } },
        booking: { message: { en: "Bookings paused", fr: "Réservations suspendues" } },
        waitlist: { message: { en: "Queue paused", fr: "File suspendue" } },
      },
    };
    const report = assessOwnerContent(config, NO_LEGAL);
    assert.equal(report.total, 6);
    assert.equal(report.done, 3);
    assert.deepEqual(
      report.outstanding.map((e) => e.id).sort(),
      ["announcement.message", "business.message", "services.ordering"]
    );
  });

  it("includes the legal pages, title and body separately", () => {
    const pages: LegalPageRow[] = [
      { slug: "terms", title: "Terms", title_fr: "Conditions", body: "The long text", body_fr: null },
      { slug: "privacy", title: "Privacy", title_fr: null, body: "", body_fr: null },
    ];
    const report = assessOwnerContent({}, pages);
    // The privacy body is empty, so there is nothing to translate about it.
    assert.equal(report.total, 3);
    assert.deepEqual(
      report.outstanding.map((e) => e.id).sort(),
      ["legal.privacy.title", "legal.terms.body"]
    );
  });

  it("says where each thing is fixed", () => {
    const report = assessOwnerContent({ business: { message: { en: "Open", fr: "" } } }, NO_LEGAL);
    assert.equal(report.outstanding[0]?.where, "Site control");
  });

  it("survives a config with nothing in it", () => {
    const report = assessOwnerContent({}, NO_LEGAL);
    assert.deepEqual(report, { total: 0, done: 0, outstanding: [] });
  });

  it("survives a config whose sections are the wrong shape", () => {
    // It arrives as an owner-editable JSON blob, so any of this can be anything.
    for (const config of [
      { business: "open" },
      { business: { message: "open" } },
      { services: [] },
      { support: null },
      { announcement: { message: 7 } },
    ] as Record<string, unknown>[]) {
      assert.doesNotThrow(() => assessOwnerContent(config, NO_LEGAL));
    }
  });
});
