import { Router } from "express";
import { applyUpdate, db } from "../db.js";
import type { SqlValue } from "../db.js";
import { requireAdmin } from "../auth.js";

export const offersRouter = Router();

offersRouter.get("/", (_req, res) => {
  const offers = db.prepare(
    "SELECT * FROM offers WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC"
  ).all();
  res.json({ offers });
});

offersRouter.get("/all", requireAdmin, (_req, res) => {
  res.json({ offers: db.prepare("SELECT * FROM offers ORDER BY sort_order, created_at DESC").all() });
});

/* The icon must name one of the front end's line icons. Anything else would
   render as a blank tile, so an unknown value falls back rather than being
   stored. */
const OFFER_ICONS = [
  "flame", "chicken", "meat", "pepper", "drink", "plate",
  "group", "calendar", "clock", "music", "spark", "bag",
] as const;

function safeIcon(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  return (OFFER_ICONS as readonly string[]).includes(value) ? value : "flame";
}

offersRouter.post("/", requireAdmin, (req, res) => {
  const { title, description, badge, icon, valid_until, sort_order } = req.body ?? {};
  if (!title) { res.status(400).json({ error: "Title required." }); return; }
  db.prepare(
    "INSERT INTO offers (title, description, badge, icon, valid_until, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    String(title).trim().slice(0, 120),
    String(description ?? "").trim().slice(0, 400),
    String(badge ?? "").trim().slice(0, 40),
    safeIcon(icon),
    valid_until || null,
    Number(sort_order ?? 0) || 0
  );
  res.status(201).json({ ok: true });
});

offersRouter.patch("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad offer id." }); return; }

  const fields: Record<string, SqlValue> = {};
  const b = req.body ?? {};
  if (b.title !== undefined) fields.title = String(b.title).trim().slice(0, 120);
  if (b.description !== undefined) fields.description = String(b.description).trim().slice(0, 400);
  if (b.badge !== undefined) fields.badge = String(b.badge).trim().slice(0, 40);
  if (b.icon !== undefined) fields.icon = safeIcon(b.icon);
  if (b.valid_until !== undefined) fields.valid_until = b.valid_until ? String(b.valid_until) : null;
  if (b.sort_order !== undefined) fields.sort_order = Number(b.sort_order) || 0;
  if (b.is_active !== undefined) fields.is_active = b.is_active ? 1 : 0;

  if (!applyUpdate("offers", fields, id)) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }
  res.json({ ok: true });
});

offersRouter.delete("/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM offers WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});
