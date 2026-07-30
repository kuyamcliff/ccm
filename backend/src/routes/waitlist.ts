import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../auth.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";

export const waitlistRouter = Router();

const AVG_TURN_MINUTES = 15;

/** Public join endpoint — capped so the list cannot be flooded. */
const joinLimit = rateLimit("waitlist-join", {
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: "You have already joined recently. Speak to the host if something is wrong.",
});

waitlistRouter.get("/", (_req, res) => {
  const waiting = (
    db.prepare("SELECT COUNT(*) as c FROM waitlist_entries WHERE status = 'waiting'").get() as { c: number }
  ).c;
  res.json({ waiting, est_wait_minutes: waiting * AVG_TURN_MINUTES });
});

waitlistRouter.post("/", joinLimit, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const party_size = Number(req.body?.party_size);
  const note = String(req.body?.note ?? "").trim().slice(0, 200);

  if (name.length < 2 || name.length > 60) { res.status(400).json({ error: "Enter a name we can call out." }); return; }
  if (!/^[+\d\s-]{8,20}$/.test(phone)) { res.status(400).json({ error: "Valid phone number required." }); return; }
  if (!Number.isInteger(party_size) || party_size < 1 || party_size > 20) {
    res.status(400).json({ error: "Party size must be 1 to 20." });
    return;
  }

  // Rejoining while already on the list would push the real queue back.
  const existing = db
    .prepare(
      "SELECT id FROM waitlist_entries WHERE phone = ? AND status IN ('waiting','notified') AND joined_at >= datetime('now', '-4 hours')"
    )
    .get(phone);
  if (existing) {
    res.status(409).json({ error: "You are already on the waitlist. Check with the host for your position." });
    return;
  }

  const info = db
    .prepare("INSERT INTO waitlist_entries (name, phone, party_size, note) VALUES (?, ?, ?, ?)")
    .run(name, phone, party_size, note);

  const position = (
    db
      .prepare("SELECT COUNT(*) as c FROM waitlist_entries WHERE status = 'waiting' AND id <= ?")
      .get(Number(info.lastInsertRowid)) as { c: number }
  ).c;

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    position,
    est_wait_minutes: Math.max(0, position - 1) * AVG_TURN_MINUTES,
  });
});

// ── Admin ────────────────────────────────────────────────

waitlistRouter.get("/all", requireAdmin, (_req, res) => {
  const entries = db
    .prepare(
      "SELECT * FROM waitlist_entries WHERE joined_at >= datetime('now', '-12 hours') ORDER BY joined_at ASC"
    )
    .all();
  res.json({ entries });
});

waitlistRouter.patch("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad entry id." }); return; }
  if (!["waiting", "notified", "seated", "cancelled", "no_show"].includes(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }

  const entry = db.prepare("SELECT id, status FROM waitlist_entries WHERE id = ?").get(id) as
    | { id: number; status: string }
    | undefined;
  if (!entry) { res.status(404).json({ error: "Waitlist entry not found." }); return; }

  // "Notify" previously stamped notified_at but left the status untouched, so
  // the row stayed in the waiting queue and the button appeared to do nothing.
  if (status === "notified") {
    db.prepare(
      "UPDATE waitlist_entries SET status = 'notified', notified_at = datetime('now') WHERE id = ?"
    ).run(id);
  } else if (status === "seated") {
    db.prepare(
      "UPDATE waitlist_entries SET status = 'seated', seated_at = datetime('now') WHERE id = ?"
    ).run(id);
  } else {
    db.prepare("UPDATE waitlist_entries SET status = ? WHERE id = ?").run(status, id);
  }

  res.json({ ok: true });
});

waitlistRouter.delete("/clear", requireAdmin, (req, res) => {
  const info = db
    .prepare("DELETE FROM waitlist_entries WHERE joined_at < datetime('now', '-24 hours')")
    .run();
  audit(req, { action: "waitlist.clear", targetType: "waitlist", detail: `${info.changes} removed` });
  res.json({ ok: true, removed: Number(info.changes) });
});
