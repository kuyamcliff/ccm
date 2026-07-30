import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { audit } from "../lib/audit.js";

export const legalRouter = Router();

/** Only these two pages exist; a request for anything else is a 404, not a new row. */
const SLUGS = ["terms", "privacy"] as const;
type Slug = (typeof SLUGS)[number];

const MAX_BODY_LENGTH = 40_000;

function isSlug(value: string): value is Slug {
  return (SLUGS as readonly string[]).includes(value);
}

/* ── Public ────────────────────────────────────────────────────────────────
   Cached briefly: legal text changes rarely, and this is hit on every footer
   click. The admin PATCH busts it by bumping updated_at, which changes the
   ETag Express derives from the body.                                       */

legalRouter.get("/:slug", (req, res) => {
  const slug = String(req.params.slug);
  if (!isSlug(slug)) { res.status(404).json({ error: "No such page." }); return; }

  const page = db
    .prepare("SELECT slug, title, body, updated_at FROM legal_pages WHERE slug = ?")
    .get(slug);

  if (!page) { res.status(404).json({ error: "No such page." }); return; }

  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ page });
});

/* ── Admin ───────────────────────────────────────────────────────────────── */

legalRouter.get("/", requireAuth, requireAdmin, (_req, res) => {
  const pages = db
    .prepare("SELECT slug, title, body, updated_at FROM legal_pages ORDER BY slug")
    .all();
  res.json({ pages });
});

legalRouter.put("/:slug", requireAuth, requireAdmin, (req, res) => {
  const slug = String(req.params.slug);
  if (!isSlug(slug)) { res.status(404).json({ error: "No such page." }); return; }

  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "");

  if (title.length < 2 || title.length > 120) {
    res.status(400).json({ error: "Give the page a title between 2 and 120 characters." });
    return;
  }
  if (body.trim().length < 20) {
    res.status(400).json({ error: "The page body is too short to publish." });
    return;
  }
  if (body.length > MAX_BODY_LENGTH) {
    res.status(400).json({ error: `Keep the page under ${MAX_BODY_LENGTH.toLocaleString()} characters.` });
    return;
  }

  db.prepare(
    "UPDATE legal_pages SET title = ?, body = ?, updated_at = datetime('now') WHERE slug = ?"
  ).run(title, body, slug);

  audit(req, { action: "legal.update", targetType: "legal_page", targetId: 0, detail: slug });

  const page = db
    .prepare("SELECT slug, title, body, updated_at FROM legal_pages WHERE slug = ?")
    .get(slug);
  res.json({ ok: true, page });
});
