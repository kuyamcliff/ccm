import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { generateBookingCode } from "../lib/bookingCode.js";

export const reservationsRouter = Router();
reservationsRouter.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS: string[] = [];
for (let h = 9; h <= 22; h++) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

reservationsRouter.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.date, r.time, r.party_size, r.phone, r.note, r.status,
              r.payment_status, r.cancellation_fee_fcfa, r.ccm_code, r.created_at,
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
reservationsRouter.delete("/:id/hide", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad reservation id." }); return; }

  const row = db
    .prepare("SELECT id, user_id, status FROM reservations WHERE id = ? AND hidden_at IS NULL")
    .get(id) as { id: number; user_id: number; status: string } | undefined;

  if (!row || row.user_id !== req.user!.id) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  if (row.status !== "cancelled" && row.status !== "completed") {
    res.status(409).json({ error: "Only cancelled or finished bookings can be removed." });
    return;
  }

  db.prepare("UPDATE reservations SET hidden_at = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true });
});

reservationsRouter.post("/", (req, res) => {
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
    const table = db.prepare("SELECT id, capacity FROM restaurant_tables WHERE id = ? AND active = 1").get(tableId) as { id: number; capacity: number } | undefined;
    if (!table) {
      res.status(400).json({ error: "That table is not available." });
      return;
    }
    const clash = db
      .prepare(
        `SELECT id FROM reservations
         WHERE table_id = ? AND date = ? AND time = ? AND table_id IS NOT NULL
           AND (status = 'confirmed'
             OR (status = 'pending_payment' AND created_at > datetime('now', '-30 minutes')))`
      )
      .get(tableId, date, time);
    if (clash) {
      res.status(409).json({ error: "That table is already reserved for this slot. Pick another." });
      return;
    }
  }

  const userClash = db
    .prepare(
      `SELECT id FROM reservations
       WHERE user_id = ? AND date = ? AND time = ?
         AND (status = 'confirmed'
           OR (status = 'pending_payment' AND created_at > datetime('now', '-30 minutes')))`
    )
    .get(req.user!.id, date, time);
  if (userClash) {
    res.status(409).json({ error: "You already have a table booked for that exact slot." });
    return;
  }

  const info = db
    .prepare(
      "INSERT INTO reservations (user_id, table_id, date, time, party_size, phone, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment')"
    )
    .run(req.user!.id, tableId, date, time, partySize, phone, note);

  const id = Number(info.lastInsertRowid);
  db.prepare("UPDATE reservations SET ccm_code = ? WHERE id = ?").run(generateBookingCode(), id);

  const row = db
    .prepare(
      `SELECT r.id, r.date, r.time, r.party_size, r.phone, r.note, r.status,
              r.payment_status, r.cancellation_fee_fcfa, r.ccm_code, r.created_at,
              t.label as table_label, t.zone as table_zone
       FROM reservations r
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       WHERE r.id = ?`
    )
    .get(id);
  res.status(201).json({ reservation: row });
});

reservationsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Bad reservation id." });
    return;
  }

  const reservation = db
    .prepare("SELECT id, user_id, date, time, status, payment_status FROM reservations WHERE id = ?")
    .get(id) as { id: number; user_id: number; date: string; time: string; status: string; payment_status: string } | undefined;

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

  if (reservation.payment_status === "paid" && minutesUntil <= 60 && minutesUntil > 0) {
    res.status(402).json({
      error: "Cancelling within 60 minutes of your reservation requires a cancellation fee of 1,500 FCFA.",
      requires_fee: true,
      fee_fcfa: 1500,
    });
    return;
  }

  db.prepare("UPDATE reservations SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true });
});
