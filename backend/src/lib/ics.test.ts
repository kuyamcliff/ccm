import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCalendarEvent, CalendarEventError, escapeText, foldLine, venueTimeToUtc } from "./ics.js";

const BASE = {
  uid: "ccm-booking-42@camchopmeat.cm",
  date: "2027-03-14",
  time: "19:30",
  durationMinutes: 120,
  summary: "Table at Cam Chop Meat",
  description: "Table T3, 2 people. Show code CCM-9K4T at the door.",
  location: "Cam Chop Meat, Buea",
  stamp: new Date("2026-08-19T10:00:00Z"),
};

function lines(ics: string): string[] {
  return ics.split("\r\n");
}

describe("escapeText", () => {
  it("escapes the four characters that carry meaning", () => {
    assert.equal(escapeText("a;b,c\\d"), "a\\;b\\,c\\\\d");
  });

  it("escapes backslashes before anything it adds itself", () => {
    // Getting this order wrong turns one backslash into three.
    assert.equal(escapeText("\\"), "\\\\");
    assert.equal(escapeText("\\;"), "\\\\\\;");
  });

  it("turns every kind of line break into the literal escape", () => {
    assert.equal(escapeText("a\nb\r\nc\rd"), "a\\nb\\nc\\nd");
  });

  it("leaves ordinary text alone", () => {
    assert.equal(escapeText("Table T3 for 2"), "Table T3 for 2");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    assert.equal(foldLine("SUMMARY:Table"), "SUMMARY:Table");
  });

  it("leaves a line of exactly the limit alone", () => {
    const line = "X".repeat(75);
    assert.equal(foldLine(line), line);
  });

  it("folds a long line with a leading space on each continuation", () => {
    const folded = foldLine("X".repeat(200));
    const parts = folded.split("\r\n");
    assert.ok(parts.length > 1);
    assert.equal(parts[0]!.length, 75);
    for (const part of parts.slice(1)) assert.ok(part.startsWith(" "), "a continuation must start with a space");
  });

  it("never lets a folded line exceed the octet limit", () => {
    const encoder = new TextEncoder();
    for (const part of foldLine("é".repeat(200)).split("\r\n")) {
      assert.ok(encoder.encode(part).length <= 75, `line was ${encoder.encode(part).length} octets`);
    }
  });

  it("never splits a character in half", () => {
    // The limit is in octets, and an accented letter is two of them. Folding
    // between them would corrupt a guest's note rather than wrap it.
    const folded = foldLine("é".repeat(200));
    const rejoined = folded.split("\r\n").map((part, i) => (i === 0 ? part : part.slice(1))).join("");
    assert.equal(rejoined, "é".repeat(200));
    assert.ok(!folded.includes("�"));
  });
});

describe("venueTimeToUtc", () => {
  it("reads a venue-local time as the instant it names", () => {
    // Buea is UTC+1, so half past seven in the evening is half past six UTC.
    assert.equal(venueTimeToUtc("2027-03-14", "19:30").toISOString(), "2027-03-14T18:30:00.000Z");
  });

  it("handles a time that falls back to the previous UTC day", () => {
    assert.equal(venueTimeToUtc("2027-03-14", "00:30").toISOString(), "2027-03-13T23:30:00.000Z");
  });

  it("does not shift with the seasons", () => {
    // Cameroon has never observed daylight saving. Midsummer and midwinter
    // must land on the same offset.
    assert.equal(venueTimeToUtc("2027-01-15", "19:30").toISOString(), "2027-01-15T18:30:00.000Z");
    assert.equal(venueTimeToUtc("2027-07-15", "19:30").toISOString(), "2027-07-15T18:30:00.000Z");
  });

  it("refuses anything that is not a date and a time", () => {
    for (const [date, time] of [["14/03/2027", "19:30"], ["2027-03-14", "7pm"], ["2027-13-01", "19:30"], ["2027-03-14", "25:00"]]) {
      assert.throws(() => venueTimeToUtc(date!, time!), CalendarEventError);
    }
  });
});

describe("buildCalendarEvent", () => {
  it("writes a complete calendar with one event", () => {
    const ics = buildCalendarEvent(BASE);
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"), "the file must end with a line break");
    assert.equal(lines(ics).filter((l) => l === "BEGIN:VEVENT").length, 1);
    assert.equal(lines(ics).filter((l) => l === "END:VEVENT").length, 1);
  });

  it("uses CRLF everywhere and never a bare newline", () => {
    const ics = buildCalendarEvent(BASE);
    assert.ok(!/[^\r]\n/.test(ics), "every newline must be preceded by a carriage return");
    assert.ok(!/\r[^\n]/.test(ics), "every carriage return must be followed by a newline");
  });

  it("writes the start and end in UTC", () => {
    const ics = buildCalendarEvent(BASE);
    assert.ok(lines(ics).includes("DTSTART:20270314T183000Z"));
    assert.ok(lines(ics).includes("DTEND:20270314T203000Z"));
  });

  it("carries the booking's own identity so a re-import replaces rather than duplicates", () => {
    const ics = buildCalendarEvent({ ...BASE, sequence: 3 });
    assert.ok(lines(ics).includes("UID:ccm-booking-42@camchopmeat.cm"));
    assert.ok(lines(ics).includes("SEQUENCE:3"));
  });

  it("defaults to sequence zero rather than omitting it", () => {
    assert.ok(lines(buildCalendarEvent(BASE)).includes("SEQUENCE:0"));
  });

  it("escapes a note that would otherwise break the file", () => {
    const ics = buildCalendarEvent({ ...BASE, description: "Birthday; cake, please\nupstairs" });
    // The escaped break must not have become a real one: the whole note is on
    // one line, and "upstairs" never appears as a line of its own.
    const note = lines(ics).filter((l) => l.startsWith("DESCRIPTION:Birthday"));
    assert.equal(note.length, 1);
    assert.equal(note[0], "DESCRIPTION:Birthday\\; cake\\, please\\nupstairs");
    assert.ok(!lines(ics).includes("upstairs"));
  });

  it("folds a long note instead of writing an over-length line", () => {
    const ics = buildCalendarEvent({ ...BASE, description: "A very particular request. ".repeat(20) });
    const encoder = new TextEncoder();
    for (const line of lines(ics)) assert.ok(encoder.encode(line).length <= 75, `over-length line: ${line}`);
  });

  it("publishes rather than invites", () => {
    // METHOD:REQUEST makes some clients ask the guest to accept or decline
    // their own booking.
    const ics = buildCalendarEvent(BASE);
    assert.ok(lines(ics).includes("METHOD:PUBLISH"));
  });

  it("marks a table that is not held yet as tentative", () => {
    // A calendar entry must not promise something the restaurant has not: the
    // deposit is what holds the table.
    assert.ok(lines(buildCalendarEvent({ ...BASE, status: "tentative" })).includes("STATUS:TENTATIVE"));
    assert.ok(lines(buildCalendarEvent({ ...BASE, status: "confirmed" })).includes("STATUS:CONFIRMED"));
    assert.ok(lines(buildCalendarEvent(BASE)).includes("STATUS:CONFIRMED"));
  });

  it("refuses a duration that would produce an event ending before it starts", () => {
    for (const durationMinutes of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => buildCalendarEvent({ ...BASE, durationMinutes }), CalendarEventError);
    }
  });
});
