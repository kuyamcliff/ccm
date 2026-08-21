import { Router } from "express";
import { db, transaction } from "../db.js";
import { requireAuth } from "../auth.js";
import { generateBookingCode } from "../lib/bookingCode.js";
import { getLateCancelFcfa } from "../lib/pricing.js";
import { priceChosenItems } from "../lib/orderItems.js";
import { alternativesForDoubleBooking, alternativesForTakenTable } from "../lib/bookingAlternatives.js";
import { buildCalendarEvent } from "../lib/ics.js";
import { VENUE_NAME } from "../config.js";

export const reservationsRouter = Router();
reservationsRouter.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Advisory locks are global to the database and keyed only by number, so the
   first key is a namespace that keeps booking locks from colliding with any
   other use of the mechanism elsewhere. */
const BOOKING_LOCK_NAMESPACE = 4201;


/** How long to block out in the guest's calendar. Two hours is a sitting: long
    enough that nothing else gets booked over the meal, short enough that it
    does not swallow their whole evening. Not a rule the restaurant enforces. */
const SITTING_MINUTES = 120;

/**
 * A stable 32-bit key for one bookable slot.
 *
 * Two requests for the same table at the same date and time must derive the
 * same number and therefore queue behind each other; requests for anything
 * else must not. A collision between unrelated slots costs a moment of waiting
 * and nothing else, which is why a plain FNV-1a is enough here.
 *
 * Bookings with no table chosen share a single key per date and time: the only
 * invariant left to protect for those is one booking per guest per slot.
 */
function slotLockKey(tableId: number | null, date: string, time: string): number {
  const source = `${tableId ?? "any"}:${date}:${time}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Postgres takes a signed 32-bit integer here.
  return hash | 0;
}
const SLOTS: string[] = [];
for (let h = 9; h <= 22; h++) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The earliest slot still worth suggesting on `date`, or null if the whole day
 * is still ahead. Stops today's refusals offering the guest lunchtime.
 */
function earliestSuggestableSlot(date: string): string | null {
  if (date !== todayLocal()) return null;
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

reservationsRouter.get("/", async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT r.id, r.date, r.time, r.party_size, r.phone, r.note, r.status,
              r.payment_status, r.cancellation_fee_fcfa, r.ccm_code, r.created_at,
              r.items_json, r.items_total_fcfa, r.deposit_fcfa,
              r.cancelled_at, r.cancel_reason, r.checked_in_at,
              t.label as table_label, t.zone as table_zone,
              p.amount_fcfa, p.discount_fcfa, p.method as pay_method, p.reference as pay_reference
       FROM reservations r
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed' AND p.type = 'reservation'
       WHERE r.user_id = ? AND r.hidden_at IS NULL
       ORDER BY r.date DESC, r.time DESC`
    )
    .all(req.user!.id);
  res.json({ reservations: rows });
});

/**
 * Clears a finished or cancelled booking off the guest's own list.
 *
 * Deliberately not a real delete: the restaurant's records, takings and audit
 * trail all still reference it. Only bookings that are over can be hidden, so
 * nobody can make a live table vanish and then fail to show up for it.
 */
reservationsRouter.delete("/:id/hide", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad reservation id." }); return; }

  const row = (await db
    .prepare("SELECT id, user_id, status FROM reservations WHERE id = ? AND hidden_at IS NULL")
    .get(id)) as { id: number; user_id: number; status: string } | undefined;

  if (!row || row.user_id !== req.user!.id) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  if (row.status !== "cancelled" && row.status !== "completed") {
    res.status(409).json({ error: "Only cancelled or finished bookings can be removed." });
    return;
  }

  await db.prepare("UPDATE reservations SET hidden_at = now_text() WHERE id = ?").run(id);
  res.json({ ok: true });
});

/**
 * The booking as a calendar event, for the guest's own phone.
 *
 * Served as a file with the calendar content type rather than generated in the
 * browser: tapping a `text/calendar` response is what makes iOS and Android
 * hand it straight to the calendar app, and a blob built in JavaScript is
 * exactly the thing both of them are least reliable about.
 *
 * The UID is derived from the booking id and never changes, so a guest who
 * adds it twice — or adds it again after changing something — ends up with one
 * entry rather than two.
 */
reservationsRouter.get("/:id/calendar.ics", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad reservation id." }); return; }

  const row = (await db
    .prepare(
      `SELECT r.id, r.user_id, r.date, r.time, r.party_size, r.status, r.note, r.ccm_code,
              t.label AS table_label
       FROM reservations r
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       WHERE r.id = ?`
    )
    .get(id)) as
    | { id: number; user_id: number; date: string; time: string; party_size: number; status: string; note: string | null; ccm_code: string | null; table_label: string | null }
    | undefined;

  /* Same answer for somebody else's booking as for one that does not exist:
     whether a given id is real is not something a stranger gets to learn. */
  if (!row || row.user_id !== req.user!.id) { res.status(404).json({ error: "Reservation not found." }); return; }
  if (row.status !== "confirmed" && row.status !== "pending_payment") {
    res.status(409).json({ error: "That booking is no longer live, so there is nothing to add." });
    return;
  }

  const settings = (await db
    .prepare("SELECT key, value FROM site_settings WHERE key IN ('address', 'city')")
    .all()) as { key: string; value: string }[];
  const lookup = new Map(settings.map((s) => [s.key, s.value]));
  const where = [VENUE_NAME, lookup.get("address"), lookup.get("city")].filter((part) => part && part.trim() !== "").join(", ");

  const code = row.ccm_code ?? `#${String(row.id).padStart(4, "0")}`;
  const seats = `${row.party_size} ${row.party_size === 1 ? "person" : "people"}`;
  const table = row.table_label ? `Table ${row.table_label}` : "Table given on arrival";
  const note = row.note && row.note.trim() !== "" ? ` Your note: ${row.note.trim()}` : "";
  const unpaid = row.status === "pending_payment" ? " The deposit is not paid yet, so this table is not held." : "";

  let body: string;
  try {
    body = buildCalendarEvent({
      /* Tied to the booking, not to this download: the same booking must
         produce the same UID every time or a second tap makes a second entry. */
      uid: `ccm-booking-${row.id}@camchopmeat.cm`,
      date: row.date,
      time: row.time,
      durationMinutes: SITTING_MINUTES,
      summary: `${VENUE_NAME} — ${table}`,
      description: `${table}, ${seats}. Show ${code} at the door.${note}${unpaid}`,
      location: where,
      /* A table whose deposit has not arrived is not held, and the calendar
         entry must not claim otherwise. */
      status: row.status === "confirmed" ? "confirmed" : "tentative",
    });
  } catch (err) {
    console.error("[calendar] could not build an event for booking", row.id, err);
    res.status(500).json({ error: "That calendar file could not be made." });
    return;
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${code}.ics"`);
  /* A booking can be cancelled or moved, so nothing may hold on to this. */
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
});

reservationsRouter.post("/", async (req, res) => {
  const date = String(req.body?.date ?? "");
  const time = String(req.body?.time ?? "");
  const partySize = Number(req.body?.partySize);
  const phone = String(req.body?.phone ?? "").trim();
  const note = String(req.body?.note ?? "").trim().slice(0, 300);
  const tableId = req.body?.tableId ? Number(req.body.tableId) : null;

  if (!DATE_RE.test(date) || Number.isNaN(new Date(date).getTime())) {
    res.status(400).json({ error: "Pick a valid date." });
    return;
  }
  if (date < todayLocal()) {
    res.status(400).json({ error: "That date has already passed. Pick today or later." });
    return;
  }
  if (!SLOTS.includes(time)) {
    res.status(400).json({ error: "Pick a valid time slot." });
    return;
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) {
    res.status(400).json({ error: "Party size must be between 1 and 30." });
    return;
  }
  if (phone.length < 8 || phone.length > 20 || !/^[+\d\s-]+$/.test(phone)) {
    res.status(400).json({ error: "Enter a phone number we can reach you on." });
    return;
  }

  if (tableId !== null) {
    const table = (await db.prepare("SELECT id, capacity FROM restaurant_tables WHERE id = ? AND active = 1").get(tableId)) as { id: number; capacity: number } | undefined;
    if (!table) {
      res.status(400).json({ error: "That table is not available." });
      return;
    }
  }

  /* Food and drink chosen alongside the table. Priced here, against the live
     menu, because a total that arrived in the request body is a total the guest
     could have written themselves.

     Done before the lock below: it only reads the menu, and holding a lock over
     it would serialise every booking behind one guest's basket. */
  let priced;
  try {
    priced = await priceChosenItems(req.body?.items);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "That basket could not be read." });
    return;
  }

  /*
   * Checking whether a table is free and then taking it has to be one
   * indivisible step.
   *
   * Read and write as separate statements leaves a gap another request fits
   * through, and two guests tapping the same free table within the same second
   * on a Friday evening is ordinary rather than exotic — reproducibly so: two
   * simultaneous requests for the same table both returned 201 before this.
   *
   * The lock is taken on the slot itself, so bookings for different tables or
   * different times never wait for each other, and it is released when the
   * transaction ends however it ends. A unique index would be the more usual
   * answer; see the note in sql/schema.sql for why the booking lifecycle
   * cannot carry one yet.
   */
  const outcome = await transaction<{ id: number } | { status: number; error: string; clash?: "table" | "guest" }>(async () => {
    await db.prepare("SELECT pg_advisory_xact_lock(?, ?)").get(BOOKING_LOCK_NAMESPACE, slotLockKey(tableId, date, time));

    if (tableId !== null) {
      const clash = await db
        .prepare(
          `SELECT id FROM reservations
           WHERE table_id = ? AND date = ? AND time = ? AND table_id IS NOT NULL
             AND (status = 'confirmed'
               OR (status = 'pending_payment' AND created_at > now_text_offset(interval '-30 minutes')))`
        )
        .get(tableId, date, time);
      if (clash) return { status: 409, error: "That table was taken while you were booking.", clash: "table" };
    }

    const userClash = await db
      .prepare(
        `SELECT id FROM reservations
         WHERE user_id = ? AND date = ? AND time = ?
           AND (status = 'confirmed'
             OR (status = 'pending_payment' AND created_at > now_text_offset(interval '-30 minutes')))`
      )
      .get(req.user!.id, date, time);
    if (userClash) return { status: 409, error: "You already have a table booked for that exact slot.", clash: "guest" };

    const inserted = await db
      .prepare(
        `INSERT INTO reservations (user_id, table_id, date, time, party_size, phone, note, status, items_json, items_total_fcfa)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)`
      )
      .run(
        req.user!.id,
        tableId,
        date,
        time,
        partySize,
        phone,
        note,
        priced.lines.length > 0 ? JSON.stringify(priced.lines) : null,
        priced.total
      );

    const newId = Number(inserted.lastInsertRowid);
    await db.prepare("UPDATE reservations SET ccm_code = ? WHERE id = ?").run(await generateBookingCode(), newId);
    return { id: newId };
  });

  if ("error" in outcome) {
    /* Read after the transaction, so the slot lock is already released: these
       are suggestions, and no other guest should queue behind them. */
    const earliest = earliestSuggestableSlot(date);
    const alternatives =
      outcome.clash === "table" && tableId !== null
        ? await alternativesForTakenTable(tableId, date, time, partySize, SLOTS, earliest)
        : outcome.clash === "guest"
          ? await alternativesForDoubleBooking(req.user!.id, date, time, SLOTS, earliest)
          : null;
    const hasAny = alternatives !== null && (alternatives.times.length > 0 || alternatives.tables.length > 0);
    /* `clash` names the reason in a word the app can switch on. `error` is the
       same thing in English prose, for anything that has nowhere to put a
       code — the two must never be read as separate failures. A screen that
       has its own wording, in the guest's own language, uses `clash`. */
    res.status(outcome.status).json({
      error: outcome.error,
      ...(outcome.clash ? { clash: outcome.clash } : {}),
      ...(hasAny ? { alternatives } : {}),
    });
    return;
  }
  const id = outcome.id;

  const row = await db
    .prepare(
      `SELECT r.id, r.date, r.time, r.party_size, r.phone, r.note, r.status,
              r.payment_status, r.cancellation_fee_fcfa, r.ccm_code, r.created_at,
              r.items_json, r.items_total_fcfa, r.deposit_fcfa,
              t.label as table_label, t.zone as table_zone
       FROM reservations r
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       WHERE r.id = ?`
    )
    .get(id);
  res.status(201).json({ reservation: row });
});

reservationsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Bad reservation id." });
    return;
  }

  const reservation = (await db
    .prepare("SELECT id, user_id, date, time, status, payment_status FROM reservations WHERE id = ?")
    .get(id)) as { id: number; user_id: number; date: string; time: string; status: string; payment_status: string } | undefined;

  if (!reservation || reservation.user_id !== req.user!.id) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  if (reservation.status !== "confirmed" && reservation.status !== "pending_payment") {
    res.status(409).json({ error: "This reservation is already cancelled." });
    return;
  }

  const resDateTime = new Date(`${reservation.date}T${reservation.time}:00`);
  const minutesUntil = (resDateTime.getTime() - Date.now()) / 60000;

  /*
   * Cancelling inside the last hour of a paid booking.
   *
   * The 402 is a quote, not a refusal, and that distinction was missing: the
   * route used to answer 402 and stop, with no parameter that would let the
   * guest go ahead. A guest who genuinely could not come had no way to say so
   * from the site at all, which is the worst outcome for everyone. The table
   * stayed held, nobody was told, and it became a no-show that the waitlist
   * could have filled.
   *
   * So the fee is quoted first, and `accept_fee` is how the guest says yes to
   * it having seen the number. Two steps on purpose: nobody is charged a fee
   * they were not shown, and nothing is cancelled by a stray tap.
   */
  if (reservation.payment_status === "paid" && minutesUntil <= 60 && minutesUntil > 0) {
    const feeFcfa = await getLateCancelFcfa();
    const accepted = req.body?.accept_fee === true;

    if (!accepted) {
      res.status(402).json({
        error: `Cancelling within 60 minutes of your reservation means a ${feeFcfa.toLocaleString("en-US")} FCFA fee.`,
        requires_fee: true,
        fee_fcfa: feeFcfa,
      });
      return;
    }

    /* Recorded on the reservation rather than taken here. The deposit is
       already held, so what the fee governs is how much of it comes back, and
       that reconciliation happens where refunds happen. */
    await db
      .prepare(
        "UPDATE reservations SET status = 'cancelled', cancelled_at = now_text(), cancellation_fee_fcfa = ?, cancel_reason = 'guest cancelled late' WHERE id = ?"
      )
      .run(feeFcfa, id);
    res.json({ ok: true, fee_fcfa: feeFcfa });
    return;
  }

  await db.prepare("UPDATE reservations SET status = 'cancelled', cancelled_at = now_text() WHERE id = ?").run(id);
  res.json({ ok: true });
});
