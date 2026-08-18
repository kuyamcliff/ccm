import type { NextFunction, Request, Response } from "express";
import { db } from "../db.js";

export type CustomerFeature = "customerAccounts" | "ordering" | "booking" | "waitlist" | "reviews" | "gallery" | "offers" | "events" | "loyalty" | "giftCards" | "supportChat";

async function enabled(feature: CustomerFeature): Promise<boolean> {
  const row = (await db.prepare("SELECT value FROM site_settings WHERE key = 'site_config_json'").get()) as { value: string } | undefined;
  if (!row?.value) return true;
  try {
    const parsed = JSON.parse(row.value) as { features?: Record<string, unknown> };
    return parsed.features?.[feature] !== false;
  } catch {
    return true;
  }
}

export function requireSiteFeature(feature: CustomerFeature) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    if (await enabled(feature)) { next(); return; }
    res.status(503).json({ error: "This service is temporarily unavailable." , feature_disabled: true });
  };
}
