import type { NextFunction, Request, Response } from "express";
import { db } from "../db.js";

export type CustomerFeature = "customerAccounts" | "ordering" | "booking" | "waitlist" | "reviews" | "gallery" | "offers" | "events" | "loyalty" | "giftCards" | "supportChat";
export type CustomerService = "ordering" | "booking" | "waitlist";

async function config(): Promise<Record<string, unknown>> {
  const row = (await db.prepare("SELECT value FROM site_settings WHERE key = 'site_config_json'").get()) as { value: string } | undefined;
  if (!row?.value) return {};
  try { return JSON.parse(row.value) as Record<string, unknown>; } catch { return {}; }
}

export function requireSiteFeature(feature: CustomerFeature) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const parsed = await config();
    const features = (parsed.features ?? {}) as Record<string, unknown>;
    if (features[feature] !== false) { next(); return; }
    res.status(503).json({ error: "This service is temporarily unavailable.", feature_disabled: true });
  };
}

export function requireSiteService(service: CustomerService) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const parsed = await config();
    const features = (parsed.features ?? {}) as Record<string, unknown>;
    const services = (parsed.services ?? {}) as Record<string, unknown>;
    const entry = (services[service] ?? {}) as Record<string, unknown>;
    if (features[service] === false || entry.mode === "paused") {
      res.status(503).json({ error: "This service is temporarily unavailable.", service_paused: true });
      return;
    }
    next();
  };
}
