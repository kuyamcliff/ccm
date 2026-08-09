import { Router } from "express";
import { db, transaction } from "../db.js";
import { requireAuth, requireAdmin, requireScope } from "../auth.js";
import { DEPOSIT_KEY, LATE_CANCEL_KEY, MAX_PRICE_FCFA } from "../lib/pricing.js";
import { MAX_SHARE_KEY, MIN_REDEEM_KEY, POINT_VALUE_KEY } from "../lib/loyalty.js";

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
  POINT_VALUE_KEY,
  MIN_REDEEM_KEY,
  MAX_SHARE_KEY,
] as const;

/* Settings that are numbers. They arrive as strings like every other setting,
   but a typo in one of these is a wrong figure charged to a guest, so they are
   parsed and bounded here rather than trusted.
   Each carries its own ceiling. Bounding a percentage by the money ceiling
   would accept a rule saying points may cover 900,000% of a bill. */
const NUMBER_KEYS = new Map<string, { max: number; unit: string }>([
  [DEPOSIT_KEY, { max: MAX_PRICE_FCFA, unit: "FCFA" }],
  [LATE_CANCEL_KEY, { max: MAX_PRICE_FCFA, unit: "FCFA" }],
  [POINT_VALUE_KEY, { max: 1000, unit: "FCFA" }],
  [MIN_REDEEM_KEY, { max: 1_000_000, unit: "points" }],
  [MAX_SHARE_KEY, { max: 100, unit: "percent" }],
]);

const MAX_VALUE_LENGTH = 400;

settingsRouter.patch("/", requireAuth, requireAdmin, requireScope("settings"), async (req, res) => {
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

    const numeric = NUMBER_KEYS.get(key);
    if (numeric) {
      // Tolerate "2,500" and "2500 FCFA", since that is how a price gets typed.
      const amount = Number(value.replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(amount) || amount < 0 || amount > numeric.max) {
        res.status(400).json({
          error: `"${key}" must be between 0 and ${numeric.max.toLocaleString("en-US")} ${numeric.unit}.`,
        });
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
