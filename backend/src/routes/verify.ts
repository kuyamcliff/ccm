import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin, requireScope } from "../auth.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";
import { normaliseBookingCode, normaliseOrderCode } from "../lib/bookingCode.js";
import { verifyQrToken } from "../lib/qrToken.js";

/**
 * Door verification. Staff either scan the QR on a receipt or type the
 * reference by hand; both land here and get the same answer.
 */
export const verifyRouter = Router();
verifyRouter.use(requireAuth, requireAdmin, requireScope("door"));

/**
 * Typing references by hand is a guessing oracle if left unbounded. The
 * reference space is ~6.6e11, so this ceiling makes brute force hopeless while
 * staying far above what a busy door actually needs.
 */
const lookupLimit = rateLimit("booking-verify", {
  windowMs: 60 * 1000,
  max: 40,
  message: "Too many verification attempts. Wait a minute.",
  key: (req) => String(req.user?.id ?? "anon"),
});

type BookingRow = {
  id: number;
  ccm_code: string;
  date: string;
  time: string;
  party_size: number;
  phone: string;
  note: string;
  status: string;
  payment_status: string;
  checked_in_at: string | null;
  checked_in_by_name: string | null;
  guest_name: string;
  table_label: string | null;
  amount_fcfa: number | null;
};

async function loadBooking(where: "code" | "id", value: string | number): Promise<BookingRow | undefined> {
  return db
    .prepare(
      `SELECT r.id, r.ccm_code, r.date, r.time, r.party_size, r.phone, r.note,
              r.status, r.payment_status, r.checked_in_at,
              u.name AS guest_name, t.label AS table_label,
              ci.name AS checked_in_by_name,
              p.amount_fcfa
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       LEFT JOIN users ci ON r.checked_in_by = ci.id
       LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed' AND p.type = 'reservation'
       WHERE ${where === "code" ? "r.ccm_code" : "r.id"} = ?`
    )
    .get(value) as Promise<BookingRow | undefined>;
}

/** Today in the restaurant's local date, for the "is this for tonight" check. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function describe(booking: BookingRow) {
  return {
    id: booking.id,
    code: booking.ccm_code,
    guest_name: booking.guest_name,
    date: booking.date,
    time: booking.time,
    party_size: booking.party_size,
    phone: booking.phone,
    note: booking.note || null,
    table_label: booking.table_label,
    status: booking.status,
    payment_status: booking.payment_status,
    amount_fcfa: booking.amount_fcfa,
    checked_in_at: booking.checked_in_at,
    checked_in_by: booking.checked_in_by_name,
  };
}

/**
 * Decides what the door should be told.
 *
 * `valid` means admit. Everything else carries a reason so staff know whether
 * to wave someone through, call a manager, or turn them away.
 */
function assess(booking: BookingRow) {
  const today = todayLocal();

  if (booking.status === "cancelled") {
    return { outcome: "cancelled" as const, message: "This booking was cancelled." };
  }
  if (booking.checked_in_at) {
    return {
      outcome: "already_used" as const,
      message: `Already checked in${booking.checked_in_by_name ? ` by ${booking.checked_in_by_name}` : ""}.`,
    };
  }
  if (booking.date > today) {
    return { outcome: "not_yet" as const, message: `This booking is for ${booking.date}, not today.` };
  }
  if (booking.date < today) {
    return { outcome: "expired" as const, message: `This booking was for ${booking.date}.` };
  }
  if (booking.payment_status !== "paid") {
    return { outcome: "unpaid" as const, message: "Deposit not paid — take payment at the door." };
  }
  return { outcome: "valid" as const, message: "Valid booking for today." };
}

/* ── Takeaway collection ──────────────────────────────────────────────────
   A collection order is verified by the same scanner as a booking. The two
   differ in what makes them valid: a booking is for a given date and sitting,
   an order is valid from the moment it is paid until it is handed over. */

type OrderRow = {
  id: number;
  order_no: string;
  name: string;
  phone: string;
  items_json: string;
  total_fcfa: number;
  discount_fcfa: number;
  pickup_time: string;
  note: string;
  status: string;
  payment_status: string;
  collected_at: string | null;
  collected_by_name: string | null;
  created_at: string;
};

async function loadOrder(where: "code" | "id", value: string | number): Promise<OrderRow | undefined> {
  return db
    .prepare(
      `SELECT o.id, o.order_no, o.name, o.phone, o.items_json, o.total_fcfa, o.discount_fcfa,
              o.pickup_time, o.note, o.status, o.payment_status, o.collected_at, o.created_at,
              c.name AS collected_by_name
       FROM takeaway_orders o
       LEFT JOIN users c ON o.collected_by = c.id
       WHERE ${where === "code" ? "o.order_no" : "o.id"} = ?`
    )
    .get(value) as Promise<OrderRow | undefined>;
}

function describeOrder(order: OrderRow) {
  let items: { name: string; qty: number; price: number }[] = [];
  try {
    items = JSON.parse(order.items_json);
  } catch {
    // A malformed line list should not stop staff handing over the food.
  }
  return {
    id: order.id,
    code: order.order_no,
    customer_name: order.name,
    phone: order.phone,
    items,
    pickup_time: order.pickup_time,
    note: order.note || null,
    total_fcfa: order.total_fcfa,
    discount_fcfa: order.discount_fcfa,
    status: order.status,
    payment_status: order.payment_status,
    collected_at: order.collected_at,
    collected_by: order.collected_by_name,
    created_at: order.created_at,
  };
}

function assessOrder(order: OrderRow) {
  if (order.status === "cancelled") {
    return { outcome: "cancelled" as const, message: "This order was cancelled." };
  }
  // Takeaway is prepaid, so an unpaid order reaching the counter means the
  // payment never completed. Nothing should be handed over.
  if (order.payment_status !== "paid") {
    return { outcome: "unpaid" as const, message: "This order was never paid. Do not hand it over." };
  }
  if (order.collected_at) {
    return {
      outcome: "already_used" as const,
      message: `Already collected${order.collected_by_name ? ` by ${order.collected_by_name}` : ""}.`,
    };
  }
  if (order.status === "pending" || order.status === "confirmed") {
    return { outcome: "not_ready" as const, message: "Paid, but the kitchen has not marked it ready." };
  }
  return { outcome: "valid" as const, message: "Paid and ready. Hand it over." };
}

/**
 * Verify a scanned token or a typed reference.
 *
 * A scanned token must carry a good signature. A typed reference is accepted
 * on its own because it is unguessable, but the response says which route was
 * used so the UI can show that a code was keyed in rather than scanned.
 */
verifyRouter.post("/", lookupLimit, async (req, res) => {
  const token = String(req.body?.token ?? "").trim();
  const rawCode = String(req.body?.code ?? "").trim();

  let booking: BookingRow | undefined;
  let order: OrderRow | undefined;
  let source: "scan" | "manual";

  if (token) {
    source = "scan";
    const verdict = verifyQrToken(token);
    if (!verdict.ok) {
      audit(req, { action: "booking.verify.rejected", targetType: "reservation", detail: verdict.reason });
      res.json({
        outcome: verdict.reason === "signature" ? "forged" : "unreadable",
        message:
          verdict.reason === "signature"
            ? "This QR code is not genuine. Do not admit."
            : "That code could not be read. Try again or type the reference.",
        source,
      });
      return;
    }

    if (verdict.claims.subject === "takeaway") {
      order = await loadOrder("id", verdict.claims.reservationId);
      if (order && order.order_no !== verdict.claims.code) order = undefined;
    } else {
      booking = await loadBooking("id", verdict.claims.reservationId);
      // The signature covers both fields, so a mismatch means the token was
      // minted for a different booking than the row it points at.
      if (booking && booking.ccm_code !== verdict.claims.code) booking = undefined;
    }
  } else {
    source = "manual";
    // The prefix says which of the two a typed reference is, so one input
    // box handles a table booking and a collection order alike.
    const bookingCode = normaliseBookingCode(rawCode);
    const orderCode = normaliseOrderCode(rawCode);

    if (bookingCode) booking = await loadBooking("code", bookingCode);
    else if (orderCode) order = await loadOrder("code", orderCode);
    else {
      res.json({ outcome: "unreadable", message: "That is not a valid reference format.", source });
      return;
    }
  }

  if (order) {
    const verdict = assessOrder(order);
    res.json({ ...verdict, source, kind: "takeaway", order: describeOrder(order) });
    return;
  }

  if (!booking) {
    res.json({ outcome: "not_found", message: "No booking or order matches that.", source });
    return;
  }

  const verdict = assess(booking);
  res.json({ ...verdict, source, kind: "reservation", booking: describe(booking) });
});

/**
 * Marks a party as arrived. Separate from verification so staff see the
 * booking first and check in deliberately.
 */
verifyRouter.post("/:id/check-in", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad booking id." }); return; }

  const booking = await loadBooking("id", id);
  if (!booking) { res.status(404).json({ error: "Booking not found." }); return; }
  if (booking.status === "cancelled") {
    res.status(409).json({ error: "That booking was cancelled." });
    return;
  }

  // Conditional so two staff scanning at once cannot both record an arrival.
  const won = await db
    .prepare(
      "UPDATE reservations SET checked_in_at = now_text(), checked_in_by = ? WHERE id = ? AND checked_in_at IS NULL"
    )
    .run(req.user!.id, id);

  if (won.changes !== 1) {
    const current = await loadBooking("id", id);
    res.status(409).json({
      error: `Already checked in${current?.checked_in_by_name ? ` by ${current.checked_in_by_name}` : ""}.`,
      booking: current ? describe(current) : undefined,
    });
    return;
  }

  audit(req, { action: "booking.checkin", targetType: "reservation", targetId: booking.ccm_code });
  res.json({ ok: true, booking: describe((await loadBooking("id", id))!) });
});

/** Records a takeaway order being handed over. */
verifyRouter.post("/order/:id/collect", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad order id." }); return; }

  const order = await loadOrder("id", id);
  if (!order) { res.status(404).json({ error: "Order not found." }); return; }
  if (order.status === "cancelled") { res.status(409).json({ error: "That order was cancelled." }); return; }
  if (order.payment_status !== "paid") {
    res.status(409).json({ error: "That order was never paid." });
    return;
  }

  // Conditional so two staff scanning at once cannot both hand it over.
  const won = await db
    .prepare(
      `UPDATE takeaway_orders
       SET collected_at = now_text(), collected_by = ?, status = 'picked_up'
       WHERE id = ? AND collected_at IS NULL`
    )
    .run(req.user!.id, id);

  if (won.changes !== 1) {
    const current = await loadOrder("id", id);
    res.status(409).json({
      error: `Already collected${current?.collected_by_name ? ` by ${current.collected_by_name}` : ""}.`,
      order: current ? describeOrder(current) : undefined,
    });
    return;
  }

  audit(req, { action: "takeaway.collect", targetType: "takeaway_order", targetId: order.order_no });
  res.json({ ok: true, order: describeOrder((await loadOrder("id", id))!) });
});

/** Undoes a collection recorded by mistake. */
verifyRouter.post("/order/:id/undo-collect", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad order id." }); return; }

  const info = await db
    .prepare("UPDATE takeaway_orders SET collected_at = NULL, collected_by = NULL, status = 'ready' WHERE id = ?")
    .run(id);
  if (info.changes === 0) { res.status(404).json({ error: "Order not found." }); return; }

  audit(req, { action: "takeaway.collect.undo", targetType: "takeaway_order", targetId: id });
  res.json({ ok: true });
});

/** Undoes a check-in recorded by mistake. */
verifyRouter.post("/:id/undo-check-in", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad booking id." }); return; }

  const info = await db
    .prepare("UPDATE reservations SET checked_in_at = NULL, checked_in_by = NULL WHERE id = ?")
    .run(id);
  if (info.changes === 0) { res.status(404).json({ error: "Booking not found." }); return; }

  audit(req, { action: "booking.checkin.undo", targetType: "reservation", targetId: id });
  res.json({ ok: true });
});
