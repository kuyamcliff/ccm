import { useEffect } from "react";
import { api } from "~/lib/api";
import type { Booking } from "~/lib/api";
import { dayLabel, timeLabel } from "~/lib/format";
import { Code, Badge } from "~/ui/Bits";
import { AnchorButton } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { useCopy } from "~/state/locale";

/**
 * The thing you hold up at the door.
 *
 * One of only three raised surfaces in the product, and it earns it: this is an
 * object you carry and hand to somebody, so it is drawn as one. Everything else
 * on the site is a row on a page.
 *
 * ── Working with no signal ─────────────────────────────────────────────────
 *
 * The moment this is needed is the moment somebody is standing outside a
 * building in Buea at night, and that is not a moment to be making a network
 * request. So the code is written to localStorage the first time it is seen and
 * read back from there afterwards. The service worker deliberately does not
 * cache `/api/*`, so this is the only thing that makes the pass work offline.
 *
 * What is cached is only what the door needs: the code, the date, the time and
 * the table. Not the whole booking.
 */

const PASS_KEY = "ccm.pass.v1";

interface CachedPass {
  id: number;
  code: string;
  date: string;
  time: string;
  table: string | null;
  party: number;
}

function cachePass(booking: Booking) {
  if (!booking.ccm_code) return;
  try {
    const entry: CachedPass = {
      id: booking.id,
      code: booking.ccm_code,
      date: booking.date,
      time: booking.time,
      table: booking.table_label ?? null,
      party: booking.party_size,
    };
    const all = readPasses().filter((pass) => pass.id !== entry.id);
    localStorage.setItem(PASS_KEY, JSON.stringify([...all, entry].slice(-6)));
  } catch {
    /* Storage refused. The pass still works while there is a connection. */
  }
}

export function readPasses(): CachedPass[] {
  try {
    const raw = localStorage.getItem(PASS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedPass[]) : [];
  } catch {
    return [];
  }
}

export function BookingPass({ booking }: { booking: Booking }) {
  const { c, fill } = useCopy();

  useEffect(() => {
    cachePass(booking);
  }, [booking]);

  const held = booking.status === "confirmed";

  return (
    <div className="carry pass" data-held={held ? "true" : undefined}>
      <div className="bar bar--between">
        <span className="label">{c.mine.pass}</span>
        <Badge tone={held ? "good" : "warn"}>
          {held ? c.mine.bookingStatus.confirmed : c.mine.bookingStatus.pending_payment}
        </Badge>
      </div>

      <p className="display pass__when">
        {dayLabel(booking.date)}, {timeLabel(booking.time)}
      </p>

      <div className="rows pass__facts">
        <div className="row">
          <span className="grow label">{c.book.stepWho}</span>
          <span className="fine">
            {booking.party_size === 1 ? c.book.partyOne : fill(c.book.partyMany, { n: booking.party_size })}
          </span>
        </div>
        {/* Every table the booking holds. A party of ten sat across two tables
            that saw only the first one on their pass would arrive thinking half
            of them had nowhere to sit. The zone is only worth the width when
            there is one table to place. */}
        {booking.table_labels || booking.table_label ? (
          <div className="row">
            <span className="grow label">{c.book.stepWhere}</span>
            <span className="fine">
              {booking.table_labels && booking.table_labels.includes(",")
                ? booking.table_labels
                : `Table ${booking.table_label}${booking.table_zone ? `, ${booking.table_zone}` : ""}`}
            </span>
          </div>
        ) : null}
      </div>

      {/* The perforation. Purely visual, and the reason this reads as a torn
          ticket rather than as another rounded rectangle. */}
      <div className="pass__tear" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="pass__code">
        {booking.ccm_code ? <Code value={booking.ccm_code} size="lg" /> : <span className="fine faint">Not held yet</span>}
        <p className="fine muted">{c.mine.passHint}</p>
      </div>

      <div className="bar bar--tight bar--wrap">
        {held ? (
          /*
           * The calendar link, and nothing else.
           *
           * There used to be a Download button here too, which put the whole
           * receipt behind a PDF the phone opens somewhere else. Looking at a
           * receipt is now a sheet on this page (`ReceiptSheet`) and saving the
           * file is a button inside it, so the pass is left to be the one thing
           * it is for: the code you hold up at the door.
           */
          <AnchorButton href={api.booking.calendarUrl(booking.id)} tone="ghost" size="sm" icon="calendar">
            {c.mine.addToCalendar}
          </AnchorButton>
        ) : (
          <span className="fine faint bar bar--tight">
            <Icon name="alert" size={14} />
            Pay the deposit to hold this table.
          </span>
        )}
      </div>
    </div>
  );
}
