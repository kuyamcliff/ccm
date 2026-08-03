import { Router } from "express";
import { db, transaction } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { DEPOSIT_KEY, LATE_CANCEL_KEY, MAX_PRICE_FCFA } from "../lib/pricing.js";

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
  DEPOSIT_KEY,
  LATE_CANCEL_KEY,
] as const;

/* Settings that are money. They arrive as strings like every other setting, but
   a typo in one of these is a wrong figure charged to a guest, so they are
   parsed and bounded here rather than trusted. */
const MONEY_KEYS = new Set<string>([DEPOSIT_KEY, LATE_CANCEL_KEY]);

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

    if (MONEY_KEYS.has(key)) {
      // Tolerate "2,500" and "2500 FCFA", since that is how a price gets typed.
      const amount = Number(value.replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(amount) || amount < 0 || amount > MAX_PRICE_FCFA) {
        res.status(400).json({ error: `"${key}" must be an amount between 0 and ${MAX_PRICE_FCFA.toLocaleString("en-US")} FCFA.` });
        return;
      }
      entries.push([key, String(Math.round(amount))]);
      written.push(key);
      continue;
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
