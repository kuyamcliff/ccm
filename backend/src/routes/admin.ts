import { Router } from "express";
import { applyUpdate, db } from "../db.js";
import type { SqlValue } from "../db.js";
import { requireAuth, requireAdmin, requireScope, requireSuperAdmin, revokeSessions } from "../auth.js";
import { audit } from "../lib/audit.js";
import { MediaError, storeOrValidateUrl } from "../lib/media.js";
import { awardPoints } from "./loyalty.js";
import { failPayment } from "./payments.js";
import { messagingAvailable } from "../lib/notify.js";
import { FIXTURE_KINDS, FLOOR_CANVAS, clampFixture, isFixtureKind, readFixtures } from "../lib/fixtures.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

/* `/stats` (the Overview dashboard) and `/audit` (already its own
   requireSuperAdmin gate) are deliberately not listed here — Overview is a
   at-a-glance summary with nothing to restrict, and the audit trail was never
   meant to be grantable to a plain admin at all. Everything else this router
   serves maps to one destination in the console nav, and one scope an owner
   can lock a plain admin out of. */
adminRouter.use("/reservations", requireScope("bookings"));
adminRouter.use("/receipts", requireScope("payments"));
adminRouter.use("/tables", requireScope("floor"));
adminRouter.use("/fixtures", requireScope("floor"));
adminRouter.use("/users", requireScope("guests"));
adminRouter.use("/menu", requireScope("menu"));
adminRouter.use("/payments", requireScope("payments"));
adminRouter.use("/notifications", requireScope("messages"));
adminRouter.use("/reviews", requireScope("reviews"));
adminRouter.use("/analytics", requireScope("insights"));

const UNDO_WINDOW_MS = 30 * 60 * 1000;

/**
 * Escapes the wildcards SQLite's LIKE treats as special, so a search for "%"
 * matches a literal percent sign instead of every row in the table.
 */
function likeTerm(raw: string): string {
  return `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ── Stats ───────────────────────────────────────────────

adminRouter.get("/stats", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const totalReservations = ((await db.prepare("SELECT COUNT(*) as c FROM reservations WHERE status = 'confirmed'").get()) as { c: number }).c;
  const todayReservations = ((await db.prepare("SELECT COUNT(*) as c FROM reservations WHERE date = ? AND status = 'confirmed'").get(today)) as { c: number }).c;
  const totalUsers = ((await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user'").get()) as { c: number }).c;
  const pendingPayments = ((await db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'pending'").get()) as { c: number }).c;
  const totalRevenue = ((await db.prepare("SELECT COALESCE(SUM(amount_fcfa), 0) as s FROM payments WHERE status = 'completed'").get()) as { s: number }).s;
  res.json({ totalReservations, todayReservations, totalUsers, pendingPayments, totalRevenue });
});

// ── Reservations ─────────────────────────────────────────

adminRouter.get("/reservations", async (req, res) => {
  const date = req.query.date ? String(req.query.date) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const q = req.query.q ? String(req.query.q).trim() : null;

  let sql = `SELECT r.id, r.date, r.time, r.party_size, r.phone, r.note, r.status,
    r.payment_status, r.cancellation_fee_fcfa, r.ccm_code, r.cancelled_at, r.cancel_reason, r.created_at,
    u.name as user_name, u.email as user_email,
    t.label as table_label, t.zone as table_zone
    FROM reservations r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN restaurant_tables t ON r.table_id = t.id
    WHERE 1=1`;
  const params: string[] = [];

  if (date) { sql += " AND r.date = ?"; params.push(date); }
  if (status) { sql += " AND r.status = ?"; params.push(status); }
  if (q) {
    sql += " AND (r.ccm_code LIKE ? ESCAPE '\\' OR r.phone LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')";
    const like = likeTerm(q.slice(0, 80));
    params.push(like, like, like);
  }
  sql += " ORDER BY r.date DESC, r.time DESC LIMIT 200";

  res.json({ reservations: await db.prepare(sql).all(...params) });
});

// Mark as completed (keep for backward compat)
adminRouter.patch("/reservations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  if (!["confirmed", "cancelled", "completed"].includes(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }
  const prev = (await db.prepare("SELECT status, user_id FROM reservations WHERE id = ?").get(id)) as { status: string; user_id: number } | undefined;
  await db.prepare("UPDATE reservations SET status = ? WHERE id = ?").run(status, id);

  if (status === "completed" && prev && prev.status !== "completed") {
    const payment = (await db.prepare(
      "SELECT amount_fcfa FROM payments WHERE reservation_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1"
    ).get(id)) as { amount_fcfa: number } | undefined;
    if (payment) await awardPoints(prev.user_id, payment.amount_fcfa, "Completed reservation", "reservation", id);
  }

  res.json({ ok: true });
});

adminRouter.post("/reservations/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason ?? "").trim().slice(0, 300);

  const r = (await db.prepare("SELECT id, status FROM reservations WHERE id = ?").get(id)) as { id: number; status: string } | undefined;
  if (!r) { res.status(404).json({ error: "Reservation not found." }); return; }
  if (r.status === "cancelled") { res.status(409).json({ error: "Already cancelled." }); return; }

  await db.prepare(
    "UPDATE reservations SET status = 'cancelled', cancelled_at = now_text(), cancel_reason = ? WHERE id = ?"
  ).run(reason || null, id);

  audit(req, { action: "reservation.cancel", targetType: "reservation", targetId: id, detail: reason });
  res.json({ ok: true });
});

adminRouter.post("/reservations/:id/uncancel", async (req, res) => {
  const id = Number(req.params.id);

  const r = (await db.prepare("SELECT id, status, cancelled_at FROM reservations WHERE id = ?").get(id)) as { id: number; status: string; cancelled_at: string | null } | undefined;
  if (!r) { res.status(404).json({ error: "Reservation not found." }); return; }
  if (r.status !== "cancelled" || !r.cancelled_at) { res.status(409).json({ error: "This reservation is not cancelled." }); return; }

  const cancelledMs = new Date(r.cancelled_at + "Z").getTime();
  if (Date.now() - cancelledMs > UNDO_WINDOW_MS) {
    res.status(400).json({ error: "The 30-minute undo window has passed." });
    return;
  }

  await db.prepare("UPDATE reservations SET status = 'confirmed', cancelled_at = NULL, cancel_reason = NULL WHERE id = ?").run(id);
  res.json({ ok: true });
});

// ── Tables ───────────────────────────────────────────────

adminRouter.get("/tables", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const tables = await db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM reservations r WHERE r.table_id = t.id AND r.date = ? AND r.status = 'confirmed') as today_count
    FROM restaurant_tables t
    ORDER BY t.zone, t.id
  `).all(today);
  res.json({ tables });
});

adminRouter.post("/tables", async (req, res) => {
  const label = String(req.body?.label ?? "").trim();
  const capacity = Number(req.body?.capacity);
  const zone = String(req.body?.zone ?? "main");
  const pos_x = Number(req.body?.pos_x ?? 100);
  const pos_y = Number(req.body?.pos_y ?? 100);

  if (!label || !Number.isInteger(capacity) || capacity < 1) {
    res.status(400).json({ error: "Label and capacity are required." });
    return;
  }

  const info = await db.prepare(
    "INSERT INTO restaurant_tables (label, capacity, zone, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)"
  ).run(label, capacity, zone, pos_x, pos_y);

  const table = await db.prepare("SELECT * FROM restaurant_tables WHERE id = ?").get(Number(info.lastInsertRowid));
  res.status(201).json({ table });
});

adminRouter.patch("/tables/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad table id." }); return; }

  const fields: Record<string, SqlValue> = {};
  if (req.body?.label !== undefined) fields.label = String(req.body.label).trim().slice(0, 20);
  if (req.body?.zone !== undefined) fields.zone = String(req.body.zone).slice(0, 30);
  if (req.body?.active !== undefined) fields.active = req.body.active ? 1 : 0;

  if (req.body?.capacity !== undefined) {
    const capacity = Number(req.body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 40) {
      res.status(400).json({ error: "Capacity must be between 1 and 40." });
      return;
    }
    fields.capacity = capacity;
  }

  // Floor-plan coordinates come from a drag interaction, so guard against NaN
  // being written and leaving a table unrenderable.
  for (const axis of ["pos_x", "pos_y"] as const) {
    if (req.body?.[axis] === undefined) continue;
    const value = Number(req.body[axis]);
    if (!Number.isFinite(value)) { res.status(400).json({ error: "Invalid table position." }); return; }
    fields[axis] = Math.round(value);
  }

  if (!(await applyUpdate("restaurant_tables", fields, id))) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }
  res.json({ ok: true });
});

adminRouter.delete("/tables/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad table id." }); return; }
  await db.prepare("UPDATE restaurant_tables SET active = 0 WHERE id = ?").run(id);
  audit(req, { action: "table.deactivate", targetType: "table", targetId: id });
  res.json({ ok: true });
});

// ── Users ────────────────────────────────────────────────

adminRouter.get("/users", async (_req, res) => {
  const users = await db.prepare("SELECT id, name, email, role, banned_at, created_at FROM users ORDER BY created_at DESC").all();
  res.json({ users });
});

adminRouter.patch("/users/:id/ban", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: "You cannot ban yourself." }); return; }

  const target = (await db.prepare("SELECT role FROM users WHERE id = ?").get(id)) as { role: string } | undefined;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.role === "super_admin" || target.role === "owner") { res.status(403).json({ error: "Cannot ban a super admin." }); return; }

  await db.prepare("UPDATE users SET banned_at = now_text() WHERE id = ?").run(id);
  // A ban that leaves the existing session working is not a ban.
  await revokeSessions(id);

  audit(req, { action: "user.ban", targetType: "user", targetId: id });
  res.json({ ok: true });
});

adminRouter.patch("/users/:id/unban", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad user id." }); return; }
  await db.prepare("UPDATE users SET banned_at = NULL WHERE id = ?").run(id);
  audit(req, { action: "user.unban", targetType: "user", targetId: id });
  res.json({ ok: true });
});

adminRouter.patch("/users/:id/role", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const role = String(req.body?.role ?? "");
  if (!["user", "admin"].includes(role)) {
    res.status(400).json({ error: "Role must be 'user' or 'admin'." });
    return;
  }
  if (id === req.user!.id) { res.status(400).json({ error: "You cannot change your own role." }); return; }

  const target = (await db.prepare("SELECT role FROM users WHERE id = ?").get(id)) as { role: string } | undefined;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.role === "super_admin" || target.role === "owner") { res.status(403).json({ error: "Cannot change a super admin role." }); return; }

  await db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  // Force a fresh sign-in so the new permission level is picked up everywhere.
  await revokeSessions(id);

  audit(req, { action: "user.role", targetType: "user", targetId: id, detail: `${target.role} → ${role}` });
  res.json({ ok: true });
});

adminRouter.delete("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: "You cannot delete your own account." }); return; }

  const target = (await db.prepare("SELECT role FROM users WHERE id = ?").get(id)) as { role: string } | undefined;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.role === "super_admin" || target.role === "owner") { res.status(403).json({ error: "Cannot delete a super admin." }); return; }

  await db.prepare("DELETE FROM users WHERE id = ?").run(id);
  audit(req, { action: "user.delete", targetType: "user", targetId: id });
  res.json({ ok: true });
});

// ── Menu ─────────────────────────────────────────────────

adminRouter.get("/menu", async (_req, res) => {
  const items = await db.prepare("SELECT * FROM menu_items ORDER BY category, position, id").all();
  res.json({ menu: items });
});

adminRouter.post("/menu", async (req, res) => {
  const category = String(req.body?.category ?? "").trim().slice(0, 60);
  const name = String(req.body?.name ?? "").trim().slice(0, 120);
  const description = String(req.body?.description ?? "").trim().slice(0, 400);
  const priceLabel = req.body?.price_label ? String(req.body.price_label).slice(0, 40) : null;
  const position = Number(req.body?.position) || 0;

  if (!category || !name) { res.status(400).json({ error: "Category and name are required." }); return; }

  const price = req.body?.price_fcfa ? Number(req.body.price_fcfa) : null;
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > 10_000_000)) {
    res.status(400).json({ error: "Price must be a whole number of FCFA." });
    return;
  }

  let imageUrl: string | null = null;
  if (req.body?.image_url) {
    try {
      imageUrl = storeOrValidateUrl(req.body.image_url);
    } catch (err) {
      res.status(400).json({ error: err instanceof MediaError ? err.message : "Invalid image." });
      return;
    }
  }

  const info = await db
    .prepare(
      "INSERT INTO menu_items (category, name, description, price_fcfa, price_label, image_url, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(category, name, description, price, priceLabel, imageUrl, position);

  const item = await db.prepare("SELECT * FROM menu_items WHERE id = ?").get(Number(info.lastInsertRowid));
  audit(req, { action: "menu.create", targetType: "menu_item", targetId: Number(info.lastInsertRowid), detail: name });
  res.status(201).json({ item });
});

adminRouter.patch("/menu/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad item id." }); return; }

  const fields: Record<string, SqlValue> = {};
  if (req.body?.category !== undefined) fields.category = String(req.body.category).trim().slice(0, 60);
  if (req.body?.name !== undefined) fields.name = String(req.body.name).trim().slice(0, 120);
  if (req.body?.description !== undefined) fields.description = String(req.body.description).trim().slice(0, 400);
  if (req.body?.price_label !== undefined) fields.price_label = req.body.price_label ? String(req.body.price_label).slice(0, 40) : null;
  if (req.body?.position !== undefined) fields.position = Number(req.body.position) || 0;
  if (req.body?.is_active !== undefined) fields.is_active = req.body.is_active ? 1 : 0;

  if (req.body?.price_fcfa !== undefined) {
    const price = req.body.price_fcfa ? Number(req.body.price_fcfa) : null;
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 10_000_000)) {
      res.status(400).json({ error: "Price must be a whole number of FCFA." });
      return;
    }
    fields.price_fcfa = price;
  }

  if (req.body?.image_url !== undefined) {
    try {
      fields.image_url = req.body.image_url ? storeOrValidateUrl(req.body.image_url) : null;
    } catch (err) {
      res.status(400).json({ error: err instanceof MediaError ? err.message : "Invalid image." });
      return;
    }
  }

  if (!(await applyUpdate("menu_items", fields, id))) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }

  audit(req, { action: "menu.update", targetType: "menu_item", targetId: id, detail: Object.keys(fields).join(", ") });
  res.json({ ok: true });
});

adminRouter.delete("/menu/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad item id." }); return; }
  const item = (await db.prepare("SELECT name FROM menu_items WHERE id = ?").get(id)) as { name: string } | undefined;
  await db.prepare("DELETE FROM menu_items WHERE id = ?").run(id);
  audit(req, { action: "menu.delete", targetType: "menu_item", targetId: id, detail: item?.name ?? "" });
  res.json({ ok: true });
});

// ── Payments ─────────────────────────────────────────────

adminRouter.get("/payments", async (_req, res) => {
  const payments = await db.prepare(
    `SELECT p.*, r.date as res_date, r.time as res_time, u.name as user_name
     FROM payments p
     JOIN reservations r ON p.reservation_id = r.id
     JOIN users u ON r.user_id = u.id
     ORDER BY p.created_at DESC LIMIT 100`
  ).all();
  res.json({ payments });
});

/* ── The room itself ───────────────────────────────────────────────────────
   Fixtures are not bookable and never join a reservation query, which is why
   they are their own table rather than a `kind` column on restaurant_tables. */

adminRouter.get("/fixtures", async (_req, res) => {
  res.json({ fixtures: await readFixtures(), kinds: FIXTURE_KINDS });
});

adminRouter.post("/fixtures", async (req, res) => {
  const kind = req.body?.kind;
  if (!isFixtureKind(kind)) {
    res.status(400).json({ error: "Pick one of the fixture types we can draw." });
    return;
  }
  const label = String(req.body?.label ?? "").trim().slice(0, 40);
  const box = clampFixture(
    Number(req.body?.pos_x ?? FLOOR_CANVAS.width / 2),
    Number(req.body?.pos_y ?? FLOOR_CANVAS.height / 2),
    Number(req.body?.width ?? 90),
    Number(req.body?.height ?? 90)
  );

  const info = await db
    .prepare("INSERT INTO floor_fixtures (kind, label, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?)")
    .run(kind, label, box.pos_x, box.pos_y, box.width, box.height);

  audit(req, { action: "floor.fixture.add", targetType: "fixture", targetId: String(info.lastInsertRowid), detail: kind });
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

adminRouter.patch("/fixtures/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad fixture id." }); return; }

  const existing = (await db
    .prepare("SELECT id, kind, label, pos_x, pos_y, width, height FROM floor_fixtures WHERE id = ?")
    .get(id)) as { pos_x: number; pos_y: number; width: number; height: number } | undefined;
  if (!existing) { res.status(404).json({ error: "Fixture not found." }); return; }

  const fields: Record<string, SqlValue> = {};
  if (req.body?.kind !== undefined) {
    if (!isFixtureKind(req.body.kind)) { res.status(400).json({ error: "Not a fixture type we can draw." }); return; }
    fields.kind = req.body.kind;
  }
  if (req.body?.label !== undefined) fields.label = String(req.body.label).trim().slice(0, 40);

  /* Position and size are clamped as a set: moving a wide fixture to the edge
     has to take its width into account, so they cannot be validated apart. */
  if (["pos_x", "pos_y", "width", "height"].some((k) => req.body?.[k] !== undefined)) {
    const box = clampFixture(
      Number(req.body?.pos_x ?? existing.pos_x),
      Number(req.body?.pos_y ?? existing.pos_y),
      Number(req.body?.width ?? existing.width),
      Number(req.body?.height ?? existing.height)
    );
    Object.assign(fields, box);
  }

  if (Object.keys(fields).length === 0) { res.status(400).json({ error: "Nothing to change." }); return; }
  await applyUpdate("floor_fixtures", fields, id);
  res.json({ ok: true });
});

adminRouter.delete("/fixtures/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad fixture id." }); return; }
  const info = await db.prepare("DELETE FROM floor_fixtures WHERE id = ?").run(id);
  if (info.changes === 0) { res.status(404).json({ error: "Fixture not found." }); return; }
  audit(req, { action: "floor.fixture.remove", targetType: "fixture", targetId: String(id) });
  res.json({ ok: true });
});

/**
 * Every message the site tried to send.
 *
 * Worth a screen of its own because "did the guest actually get told?" is a
 * question staff will be asked at the door, and because until a provider is
 * configured every row here says 'logged' — which is how the owner can see the
 * wiring works before paying for it.
 */
adminRouter.get("/notifications", async (_req, res) => {
  const notifications = await db.prepare(
    `SELECT n.id, n.channel, n.recipient, n.template, n.body, n.status, n.error,
            n.created_at, n.sent_at, u.name as user_name
     FROM notifications n
     LEFT JOIN users u ON u.id = n.user_id
     ORDER BY n.created_at DESC LIMIT 100`
  ).all();
  res.json({ notifications, delivery_enabled: messagingAvailable() });
});

adminRouter.patch("/payments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad payment id." }); return; }
  if (!["failed", "completed"].includes(status)) {
    res.status(400).json({ error: "Status must be 'failed' or 'completed'." });
    return;
  }

  const p = (await db
    .prepare("SELECT id, status, reference, reservation_id FROM payments WHERE id = ?")
    .get(id)) as { id: number; status: string; reference: string; reservation_id: number } | undefined;
  if (!p) { res.status(404).json({ error: "Payment not found." }); return; }
  if (p.status === status) { res.json({ ok: true }); return; }

  if (status === "failed") {
    // Goes through the shared path so the promo use and gift card value the
    // payment was holding are returned, and the booking stops reading as paid.
    await failPayment(id);
    await db.prepare(
      "UPDATE reservations SET payment_status = 'unpaid' WHERE id = ? AND payment_status = 'paid'"
    ).run(p.reservation_id);
  } else {
    await db.prepare(
      "UPDATE payments SET status = 'completed', updated_at = now_text() WHERE id = ?"
    ).run(id);
    await db.prepare(
      "UPDATE reservations SET payment_status = 'paid', status = 'confirmed' WHERE id = ? AND status = 'pending_payment'"
    ).run(p.reservation_id);
  }

  audit(req, {
    action: `payment.${status}`,
    targetType: "payment",
    targetId: p.reference,
    detail: `${p.status} → ${status}`,
  });
  res.json({ ok: true });
});

// ── Audit trail ───────────────────────────────────────────

adminRouter.get("/audit", requireSuperAdmin, async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const entries = await db
    .prepare(
      `SELECT id, actor_id, actor_name, action, target_type, target_id, detail, created_at
       FROM admin_audit_log ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
  res.json({ entries });
});

// ── Reviews ──────────────────────────────────────────────

adminRouter.get("/reviews", async (_req, res) => {
  const rows = (await db.prepare(
    `SELECT rv.id, rv.rating, rv.text, rv.media_urls, rv.created_at, rv.updated_at, u.name as author
     FROM reviews rv JOIN users u ON rv.user_id = u.id
     ORDER BY rv.created_at DESC`
  ).all()) as (Record<string, unknown> & { media_urls: string | null })[];
  const reviews = rows.map((r) => ({
    ...r,
    media_urls: (() => { try { return JSON.parse(r.media_urls ?? "[]") as string[]; } catch { return []; } })(),
  }));
  res.json({ reviews });
});

adminRouter.delete("/reviews/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad review id." }); return; }
  await db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
  audit(req, { action: "review.delete", targetType: "review", targetId: id });
  res.json({ ok: true });
});

// ── Review admin reply ────────────────────────────────────

adminRouter.post("/reviews/:id/reply", async (req, res) => {
  const id = Number(req.params.id);
  const text = String(req.body?.text ?? "").trim().slice(0, 800);
  if (!text) { res.status(400).json({ error: "Reply text required." }); return; }
  const existing = await db.prepare("SELECT id FROM reviews WHERE id = ?").get(id);
  if (!existing) { res.status(404).json({ error: "Review not found." }); return; }
  await db.prepare("UPDATE reviews SET admin_reply = ?, admin_reply_at = now_text() WHERE id = ?").run(text, id);
  res.json({ ok: true });
});

adminRouter.delete("/reviews/:id/reply", async (req, res) => {
  await db.prepare("UPDATE reviews SET admin_reply = NULL, admin_reply_at = NULL WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Analytics ─────────────────────────────────────────────

adminRouter.get("/analytics", async (_req, res) => {
  /* Dense series are filled to a continuous 30 days on the client, so days with
     no takings still draw. Grouping by substr keeps this on the created_at
     index rather than a per-row date() call. */
  const revenueByDay = await db.prepare(`
    SELECT substr(p.created_at, 1, 10) as day,
           SUM(p.amount_fcfa) as revenue,
           COUNT(*) as payments
    FROM payments p
    WHERE p.status = 'completed' AND p.created_at >= now_text_offset(interval '-30 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  const peakHours = await db.prepare(`
    SELECT substr(r.time, 1, 2) as hour, COUNT(*) as count
    FROM reservations r WHERE r.status != 'cancelled'
    GROUP BY hour ORDER BY hour ASC
  `).all();

  const newUsersByDay = await db.prepare(`
    SELECT substr(created_at, 1, 10) as day, COUNT(*) as count
    FROM users WHERE role = 'user' AND created_at >= now_text_offset(interval '-30 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  const reviewSummary = (await db.prepare(
    "SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews"
  ).get()) as { avg_rating: number | null; total: number };

  /* Genuinely most-ordered, counted from takeaway line items rather than the
     old query which just returned the first five rows by display position and
     called them popular. */
  const orderRows = (await db.prepare(
    "SELECT items_json FROM takeaway_orders WHERE status != 'cancelled' AND created_at >= now_text_offset(interval '-90 days')"
  ).all()) as { items_json: string }[];

  const tally = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const row of orderRows) {
    let lines: { name?: unknown; qty?: unknown; price?: unknown }[];
    try { lines = JSON.parse(row.items_json); } catch { continue; }
    if (!Array.isArray(lines)) continue;
    for (const line of lines) {
      const name = String(line.name ?? "").trim();
      if (!name) continue;
      const qty = Number(line.qty) || 0;
      const price = Number(line.price) || 0;
      const cur = tally.get(name) ?? { name, qty: 0, revenue: 0 };
      cur.qty += qty;
      cur.revenue += qty * price;
      tally.set(name, cur);
    }
  }
  const topMenuItems = Array.from(tally.values()).sort((a, b) => b.qty - a.qty).slice(0, 6);

  /* Booking health, and the same window immediately before it so the UI can
     show direction rather than a bare number. */
  const window30 = (await db.prepare(`
    SELECT COUNT(*) as bookings,
           COALESCE(SUM(party_size), 0) as covers,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
           SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END) as arrived
    FROM reservations WHERE created_at >= now_text_offset(interval '-30 days')
  `).get()) as { bookings: number; covers: number; cancelled: number; arrived: number };

  const prev30 = (await db.prepare(`
    SELECT COUNT(*) as bookings, COALESCE(SUM(party_size), 0) as covers
    FROM reservations
    WHERE created_at >= now_text_offset(interval '-60 days') AND created_at < now_text_offset(interval '-30 days')
  `).get()) as { bookings: number; covers: number };

  const prevRevenue = ((await db.prepare(`
    SELECT COALESCE(SUM(amount_fcfa), 0) as revenue FROM payments
    WHERE status = 'completed'
      AND created_at >= now_text_offset(interval '-60 days') AND created_at < now_text_offset(interval '-30 days')
  `).get()) as { revenue: number }).revenue;

  const busiestDays = await db.prepare(`
    SELECT EXTRACT(DOW FROM date::date)::integer as weekday, COUNT(*) as count
    FROM reservations WHERE status != 'cancelled' AND date >= today_offset(interval '-90 days')
    GROUP BY weekday ORDER BY weekday ASC
  `).all();

  res.json({
    revenueByDay,
    peakHours,
    newUsersByDay,
    reviewSummary,
    topMenuItems,
    busiestDays,
    window30,
    previous: { bookings: prev30.bookings, covers: prev30.covers, revenue: prevRevenue },
  });
});

// ── Receipts ─────────────────────────────────────────────

adminRouter.get("/receipts", async (_req, res) => {
  const receipts = await db.prepare(
    `SELECT r.id, r.date, r.time, r.party_size, r.status, r.payment_status,
            r.ccm_code, r.created_at,
            u.name as user_name, u.email as user_email,
            t.label as table_label,
            p.amount_fcfa, p.method as pay_method, p.reference as pay_reference
     FROM reservations r
     JOIN users u ON r.user_id = u.id
     LEFT JOIN restaurant_tables t ON r.table_id = t.id
     LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed' AND p.type = 'reservation'
     WHERE r.payment_status = 'paid'
     ORDER BY r.created_at DESC
     LIMIT 500`
  ).all();
  res.json({ receipts });
});
