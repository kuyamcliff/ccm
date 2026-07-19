import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

export const reservationsRouter = Router();

reservationsRouter.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Half-hour slots from midday to 21:30, matching kitchen hours.
const SLOTS: string[] = [];
for (let h = 12; h <= 21; h++) {
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
      "SELECT id, date, time, party_size, phone, note, status, created_at FROM reservations WHERE user_id = ? ORDER BY date DESC, time DESC"
    )
    .all(req.user!.id);
  res.json({ reservations: rows });
});

reservationsRouter.post("/", (req, res) => {
  const date = String(req.body?.date ?? "");
  const time = String(req.body?.time ?? "");
  const partySize = Number(req.body?.partySize);
  const phone = String(req.body?.phone ?? "").trim();
  const note = String(req.body?.note ?? "").trim().slice(0, 300);

  if (!DATE_RE.test(date) || Number.isNaN(new Date(date).getTime())) {
    res.status(400).json({ error: "Pick a valid date." });
    return;
  }
  if (date < todayLocal()) {
    res.status(400).json({ error: "That date has already passed. Pick today or later." });
    return;
  }
  if (!SLOTS.includes(time)) {
    res.status(400).json({ error: "Pick a time between 12:00 and 21:30." });
    return;
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
    res.status(400).json({ error: "Party size must be between 1 and 20. For bigger groups, call us." });
    return;
  }
  if (phone.length < 8 || phone.length > 20 || !/^[+\d\s-]+$/.test(phone)) {
    res.status(400).json({ error: "Enter a phone number we can reach you on." });
    return;
  }

  const clash = db
    .prepare(
      "SELECT id FROM reservations WHERE user_id = ? AND date = ? AND time = ? AND status = 'confirmed'"
    )
    .get(req.user!.id, date, time);
  if (clash) {
    res.status(409).json({ error: "You already have a table booked for that exact slot." });
    return;
  }

  const info = db
    .prepare(
      "INSERT INTO reservations (user_id, date, time, party_size, phone, note) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(req.user!.id, date, time, partySize, phone, note);

  const row = db
    .prepare(
      "SELECT id, date, time, party_size, phone, note, status, created_at FROM reservations WHERE id = ?"
    )
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ reservation: row });
});

reservationsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Bad reservation id." });
    return;
  }
  const info = db
    .prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'confirmed'")
    .run(id, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: "No active reservation found with that id." });
    return;
  }
  res.json({ ok: true });
});
