import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin, requireScope } from "../auth.js";
import { MediaError, storeOrValidateUrl } from "../lib/media.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";

export const galleryRouter = Router();

const uploadLimit = rateLimit("gallery-upload", {
  windowMs: 60 * 60 * 1000,
  max: 12,
  message: "You have submitted a lot of photos. Try again later.",
  key: (req) => String(req.user?.id ?? "anon"),
});

galleryRouter.get("/", async (_req, res) => {
  const photos = await db
    .prepare(
      `SELECT g.id, g.submitter_name, g.caption, g.image_url, g.is_featured, g.created_at,
              u.name AS user_name
       FROM gallery_photos g
       LEFT JOIN users u ON u.id = g.user_id
       WHERE g.is_approved = 1
       ORDER BY g.is_featured DESC, g.created_at DESC
       LIMIT 100`
    )
    .all();
  res.json({ photos });
});

galleryRouter.post("/", requireAuth, uploadLimit, async (req, res) => {
  const caption = String(req.body?.caption ?? "").trim().slice(0, 200);

  let image_url: string;
  try {
    image_url = storeOrValidateUrl(req.body?.image_url);
  } catch (err) {
    res.status(400).json({ error: err instanceof MediaError ? err.message : "Invalid image." });
    return;
  }

  await db.prepare(
    "INSERT INTO gallery_photos (user_id, submitter_name, caption, image_url, is_approved) VALUES (?, ?, ?, ?, 0)"
  ).run(req.user!.id, req.user!.name, caption, image_url);

  res.status(201).json({ ok: true, message: "Photo submitted — it will appear after approval." });
});

// ── Admin ────────────────────────────────────────────────

galleryRouter.get("/pending", requireAdmin, requireScope("gallery"), async (_req, res) => {
  const photos = await db
    .prepare(
      `SELECT g.*, u.name AS user_name
       FROM gallery_photos g
       LEFT JOIN users u ON u.id = g.user_id
       WHERE g.is_approved = 0
       ORDER BY g.created_at ASC
       LIMIT 200`
    )
    .all();
  res.json({ photos });
});

galleryRouter.get("/all", requireAdmin, requireScope("gallery"), async (_req, res) => {
  const photos = await db
    .prepare(
      `SELECT g.*, u.name AS user_name
       FROM gallery_photos g
       LEFT JOIN users u ON u.id = g.user_id
       ORDER BY g.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ photos });
});

/** Admin uploads skip the approval queue and publish immediately. */
galleryRouter.post("/admin-upload", requireAdmin, requireScope("gallery"), async (req, res) => {
  const caption = String(req.body?.caption ?? "").trim().slice(0, 200);

  let image_url: string;
  try {
    image_url = storeOrValidateUrl(req.body?.image_url);
  } catch (err) {
    res.status(400).json({ error: err instanceof MediaError ? err.message : "Invalid image." });
    return;
  }

  const info = await db
    .prepare(
      "INSERT INTO gallery_photos (user_id, submitter_name, caption, image_url, is_approved) VALUES (?, ?, ?, ?, 1)"
    )
    .run(req.user!.id, req.user!.name, caption, image_url);

  const photo = await db.prepare("SELECT * FROM gallery_photos WHERE id = ?").get(Number(info.lastInsertRowid));
  audit(req, { action: "gallery.upload", targetType: "gallery_photo", targetId: Number(info.lastInsertRowid) });
  res.status(201).json({ ok: true, photo });
});

galleryRouter.patch("/:id", requireAdmin, requireScope("gallery"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad photo id." }); return; }

  const { is_approved, is_featured } = req.body ?? {};
  const fields: Record<string, number> = {};
  if (is_approved !== undefined) fields.is_approved = is_approved ? 1 : 0;
  if (is_featured !== undefined) fields.is_featured = is_featured ? 1 : 0;
  if (!Object.keys(fields).length) { res.status(400).json({ error: "Nothing to update." }); return; }

  // Column names come from this fixed set, never from the request body.
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
  await db.prepare(`UPDATE gallery_photos SET ${sets} WHERE id = ?`).run(...Object.values(fields), id);

  audit(req, {
    action: "gallery.update",
    targetType: "gallery_photo",
    targetId: id,
    detail: JSON.stringify(fields),
  });
  res.json({ ok: true });
});

galleryRouter.delete("/:id", requireAdmin, requireScope("gallery"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad photo id." }); return; }
  await db.prepare("DELETE FROM gallery_photos WHERE id = ?").run(id);
  audit(req, { action: "gallery.delete", targetType: "gallery_photo", targetId: id });
  res.json({ ok: true });
});
