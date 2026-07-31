import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../auth.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";

export const eventsRouter = Router();

const EVENT_TYPES = ["birthday", "corporate", "private_dining", "wedding", "other"];
const STATUSES = ["pending", "confirmed", "cancelled"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const enquiryLimit = rateLimit("event-enquiry", {
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "You have sent several enquiries already. We will be in touch.",
});

interface EventInput {
  name: string;
  email: string;
  phone: string;
  event_type: string;
  date: string;
  time: string;
  guest_count: number;
  note: string;
}

/** Shared validation so the public form and the admin form cannot diverge. */
function parseEvent(body: Record<string, unknown> | undefined): EventInput | string {
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  const event_type = String(body?.event_type ?? "");
  const date = String(body?.date ?? "");
  const time = String(body?.time ?? "");
  const guest_count = Number(body?.guest_count);
  const note = String(body?.note ?? "").trim().slice(0, 600);

  if (name.length < 2 || name.length > 60) return "Enter a contact name.";
  if (!EMAIL_RE.test(email) || email.length > 254) return "Enter a valid email address.";
  if (!/^[+\d\s-]{8,20}$/.test(phone)) return "Enter a phone number we can reach you on.";
  if (!EVENT_TYPES.includes(event_type)) return "Select an event type.";
  if (!DATE_RE.test(date) || Number.isNaN(new Date(date).getTime())) return "Pick a valid date.";
  if (!TIME_RE.test(time)) return "Pick a valid time.";
  if (!Number.isInteger(guest_count) || guest_count < 5 || guest_count > 500) {
    return "Guest count must be between 5 and 500.";
  }

  return { name, email, phone, event_type, date, time, guest_count, note };
}

eventsRouter.post("/", enquiryLimit, async (req, res) => {
  const parsed = parseEvent(req.body);
  if (typeof parsed === "string") { res.status(400).json({ error: parsed }); return; }

  // Enquiries about a date that has already passed are always a mistake.
  if (parsed.date < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "That date has already passed. Pick a future date." });
    return;
  }

  await db.prepare(
    `INSERT INTO event_bookings (user_id, name, email, phone, event_type, date, time, guest_count, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user?.id ?? null,
    parsed.name, parsed.email, parsed.phone, parsed.event_type,
    parsed.date, parsed.time, parsed.guest_count, parsed.note
  );

  res.status(201).json({ ok: true });
});

// ── Admin ────────────────────────────────────────────────

/** Lets an admin book an event directly, with the status set at creation. */
eventsRouter.post("/admin-create", requireAdmin, async (req, res) => {
  const parsed = parseEvent(req.body);
  if (typeof parsed === "string") { res.status(400).json({ error: parsed }); return; }

  const status = String(req.body?.status ?? "pending");
  if (!STATUSES.includes(status)) { res.status(400).json({ error: "Invalid status." }); return; }

  const info = await db
    .prepare(
      `INSERT INTO event_bookings (user_id, name, email, phone, event_type, date, time, guest_count, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user!.id,
      parsed.name, parsed.email, parsed.phone, parsed.event_type,
      parsed.date, parsed.time, parsed.guest_count, parsed.note, status
    );

  audit(req, {
    action: "event.create",
    targetType: "event_booking",
    targetId: Number(info.lastInsertRowid),
    detail: `${parsed.name} · ${parsed.date}`,
  });
  res.status(201).json({ ok: true });
});

eventsRouter.get("/", requireAdmin, async (_req, res) => {
  res.json({
    bookings: await db
      .prepare("SELECT * FROM event_bookings ORDER BY date ASC, created_at DESC LIMIT 500")
      .all(),
  });
});

eventsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad booking id." }); return; }
  if (!STATUSES.includes(status)) { res.status(400).json({ error: "Invalid status." }); return; }

  const info = await db.prepare("UPDATE event_bookings SET status = ? WHERE id = ?").run(status, id);
  if (info.changes === 0) { res.status(404).json({ error: "Event booking not found." }); return; }

  audit(req, { action: `event.${status}`, targetType: "event_booking", targetId: id });
  res.json({ ok: true });
});

eventsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad booking id." }); return; }
  await db.prepare("DELETE FROM event_bookings WHERE id = ?").run(id);
  audit(req, { action: "event.delete", targetType: "event_booking", targetId: id });
  res.json({ ok: true });
});
