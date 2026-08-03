import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../auth.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";
import { notify } from "../lib/notify.js";
import { waitlistReady } from "../lib/messages.js";

export const waitlistRouter = Router();

const AVG_TURN_MINUTES = 15;

/** Public join endpoint — capped so the list cannot be flooded. */
const joinLimit = rateLimit("waitlist-join", {
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: "You have already joined recently. Speak to the host if something is wrong.",
});

waitlistRouter.get("/", async (_req, res) => {
  const waiting = (
    (await db.prepare("SELECT COUNT(*) as c FROM waitlist_entries WHERE status = 'waiting'").get()) as { c: number }
  ).c;
  res.json({ waiting, est_wait_minutes: waiting * AVG_TURN_MINUTES });
});

waitlistRouter.post("/", joinLimit, async (req, res) => {
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
  const existing = await db
    .prepare(
      "SELECT id FROM waitlist_entries WHERE phone = ? AND status IN ('waiting','notified') AND joined_at >= now_text_offset(interval '-4 hours')"
    )
    .get(phone);
  if (existing) {
    res.status(409).json({ error: "You are already on the waitlist. Check with the host for your position." });
    return;
  }

  const info = await db
    .prepare("INSERT INTO waitlist_entries (name, phone, party_size, note) VALUES (?, ?, ?, ?)")
    .run(name, phone, party_size, note);

  const position = (
    (await db
      .prepare("SELECT COUNT(*) as c FROM waitlist_entries WHERE status = 'waiting' AND id <= ?")
      .get(Number(info.lastInsertRowid))) as { c: number }
  ).c;

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    position,
    est_wait_minutes: Math.max(0, position - 1) * AVG_TURN_MINUTES,
  });
});

// ── Admin ────────────────────────────────────────────────

waitlistRouter.get("/all", requireAdmin, async (_req, res) => {
  const entries = await db
    .prepare(
      "SELECT * FROM waitlist_entries WHERE joined_at >= now_text_offset(interval '-12 hours') ORDER BY joined_at ASC"
    )
    .all();
  res.json({ entries });
});

waitlistRouter.patch("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad entry id." }); return; }
  if (!["waiting", "notified", "seated", "cancelled", "no_show"].includes(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }

  const entry = (await db
    .prepare("SELECT id, status, name, phone FROM waitlist_entries WHERE id = ?")
    .get(id)) as { id: number; status: string; name: string; phone: string } | undefined;
  if (!entry) { res.status(404).json({ error: "Waitlist entry not found." }); return; }

  // "Notify" previously stamped notified_at but left the status untouched, so
  // the row stayed in the waiting queue and the button appeared to do nothing.
  if (status === "notified") {
    await db.prepare(
      "UPDATE waitlist_entries SET status = 'notified', notified_at = now_text() WHERE id = ?"
    ).run(id);

    /* And now it actually notifies. Until this, "notified" meant a member of
       staff had to go and find the person in the room — which is what the
       duplicate-join error meant when it told people to ask the host. */
    const outcome = await notify({
      to: entry.phone,
      template: "waitlist_ready",
      body: waitlistReady(entry.name),
    });
    res.json({ ok: true, notification: outcome });
    return;
  } else if (status === "seated") {
    await db.prepare(
      "UPDATE waitlist_entries SET status = 'seated', seated_at = now_text() WHERE id = ?"
    ).run(id);
  } else {
    await db.prepare("UPDATE waitlist_entries SET status = ? WHERE id = ?").run(status, id);
  }

  res.json({ ok: true });
});

waitlistRouter.delete("/clear", requireAdmin, async (req, res) => {
  const info = await db
    .prepare("DELETE FROM waitlist_entries WHERE joined_at < now_text_offset(interval '-24 hours')")
    .run();
  audit(req, { action: "waitlist.clear", targetType: "waitlist", detail: `${info.changes} removed` });
  res.json({ ok: true, removed: Number(info.changes) });
});
