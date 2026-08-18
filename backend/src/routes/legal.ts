import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin, requireScope } from "../auth.js";
import { audit } from "../lib/audit.js";

export const legalRouter = Router();
const SLUGS = ["terms", "privacy"] as const;
type Slug = (typeof SLUGS)[number];
const MAX_BODY_LENGTH = 40_000;
function isSlug(value: string): value is Slug { return (SLUGS as readonly string[]).includes(value); }

legalRouter.get("/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  if (!isSlug(slug)) { res.status(404).json({ error: "No such page." }); return; }
  const page = await db.prepare("SELECT slug, title, title_fr, body, body_fr, updated_at FROM legal_pages WHERE slug = ?").get(slug);
  if (!page) { res.status(404).json({ error: "No such page." }); return; }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ page });
});

legalRouter.get("/", requireAuth, requireAdmin, requireScope("legal"), async (_req, res) => {
  const pages = await db.prepare("SELECT slug, title, title_fr, body, body_fr, updated_at FROM legal_pages ORDER BY slug").all();
  res.json({ pages });
});

legalRouter.put("/:slug", requireAuth, requireAdmin, requireScope("legal"), async (req, res) => {
  const slug = String(req.params.slug);
  if (!isSlug(slug)) { res.status(404).json({ error: "No such page." }); return; }
  const title = String(req.body?.title ?? "").trim();
  const titleFr = String(req.body?.title_fr ?? "").trim();
  const body = String(req.body?.body ?? "");
  const bodyFr = String(req.body?.body_fr ?? "");
  if (title.length < 2 || title.length > 120 || titleFr.length < 2 || titleFr.length > 120) { res.status(400).json({ error: "Give both page titles between 2 and 120 characters." }); return; }
  if (body.trim().length < 20 || bodyFr.trim().length < 20) { res.status(400).json({ error: "Write both English and French versions before publishing." }); return; }
  if (body.length > MAX_BODY_LENGTH || bodyFr.length > MAX_BODY_LENGTH) { res.status(400).json({ error: `Keep each page under ${MAX_BODY_LENGTH.toLocaleString()} characters.` }); return; }
  await db.prepare("UPDATE legal_pages SET title = ?, title_fr = ?, body = ?, body_fr = ?, updated_at = now_text() WHERE slug = ?").run(title, titleFr, body, bodyFr, slug);
  audit(req, { action: "legal.update", targetType: "legal_page", targetId: 0, detail: `${slug}: bilingual content` });
  const page = await db.prepare("SELECT slug, title, title_fr, body, body_fr, updated_at FROM legal_pages WHERE slug = ?").get(slug);
  res.json({ ok: true, page });
});
