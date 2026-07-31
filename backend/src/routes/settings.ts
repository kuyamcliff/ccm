import { Router } from "express";
import { db, transaction } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  const rows = (await db.prepare("SELECT key, value FROM site_settings").all()) as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

/* Keys the admin is allowed to write. Anything not listed here is ignored, so a
   crafted request cannot invent settings the frontend never expects. */
const EDITABLE_KEYS = [
  "phone",
  "address",
  "city",
  "region",
  "hours",
  "tiktok_url",
  "ig_url",
  "fb_url",
] as const;

const MAX_VALUE_LENGTH = 400;

settingsRouter.patch("/", requireAuth, requireAdmin, async (req, res) => {
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    res.status(400).json({ error: "Expected an object of settings." });
    return;
  }

  const written: string[] = [];
  const rejected: string[] = [];
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!(EDITABLE_KEYS as readonly string[]).includes(key)) { rejected.push(key); continue; }
    if (typeof value !== "string") { rejected.push(key); continue; }
    if (value.length > MAX_VALUE_LENGTH) {
      res.status(400).json({ error: `"${key}" is too long. Keep it under ${MAX_VALUE_LENGTH} characters.` });
      return;
    }
    entries.push([key, value.trim()]);
    written.push(key);
  }

  if (entries.length === 0) {
    res.status(400).json({ error: "No recognised settings to update." });
    return;
  }

  // All or nothing: a half-applied address change would leave the site showing
  // the old town beside the new street.
  await transaction(async () => {
    const stmt = db.prepare(
      "INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
    );
    for (const [key, value] of entries) await stmt.run(key, value);
  });

  res.json({ ok: true, updated: written, ignored: rejected });
});
