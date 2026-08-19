import type { NextFunction, Request, Response } from "express";
import { db } from "../db.js";
import { featureIsOn } from "../lib/featureWindow.js";
import { decide, readMaintenance } from "../lib/maintenance.js";

export type CustomerFeature = "customerAccounts" | "ordering" | "booking" | "waitlist" | "reviews" | "gallery" | "offers" | "events" | "loyalty" | "giftCards" | "supportChat";
export type CustomerService = "ordering" | "booking" | "waitlist";

async function config(): Promise<Record<string, unknown>> {
  const row = (await db.prepare("SELECT value FROM site_settings WHERE key = 'site_config_json'").get()) as { value: string } | undefined;
  if (!row?.value) return {};
  try { return JSON.parse(row.value) as Record<string, unknown>; } catch { return {}; }
}

function sections(parsed: Record<string, unknown>) {
  return {
    features: (parsed.features ?? {}) as Record<string, unknown>,
    schedules: (parsed.schedules ?? {}) as Record<string, unknown>,
    services: (parsed.services ?? {}) as Record<string, unknown>,
  };
}

export function requireSiteFeature(feature: CustomerFeature) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const { features, schedules } = sections(await config());
    if (featureIsOn(features, schedules, feature)) { next(); return; }
    res.status(503).json({ error: "This service is temporarily unavailable.", feature_disabled: true });
  };
}

export function requireSiteService(service: CustomerService) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const { features, schedules, services } = sections(await config());
    const entry = (services[service] ?? {}) as Record<string, unknown>;
    /* Two separate controls, and either one closes the door: the feature can be
       off or outside its window, and the service can be paused for the evening
       while the feature stays on. */
    if (!featureIsOn(features, schedules, service) || entry.mode === "paused") {
      res.status(503).json({ error: "This service is temporarily unavailable.", service_paused: true });
      return;
    }
    next();
  };
}

/**
 * Closes the site to customers while the owner works on it.
 *
 * Mounted across the whole API rather than route by route, because the point
 * of maintenance is that nothing gets half-served: a customer who can still
 * reach the payment endpoint while the menu is down will find that out at the
 * worst possible moment.
 *
 * Who and what stays reachable is decided in lib/maintenance.ts, under one
 * rule — turning this on must never lock the owner out of turning it off.
 */
export async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  const state = readMaintenance(await config());
  /* baseUrl + path, not path. This is mounted at "/api", and inside a mounted
     handler `req.path` has that prefix stripped — so "/api/auth/login" arrives
     as "/auth/login" and matches none of the paths that are meant to stay
     open. That would close signing in while maintenance is on, which is the
     one thing this feature must never do. */
  const fullPath = `${req.baseUrl}${req.path}`;
  if (decide(state, fullPath, req.user?.role) === "open") { next(); return; }

  /* Retry-After tells a crawler to come back rather than treating the whole
     site as gone, which is what an unqualified 503 eventually means to one. */
  res.setHeader("Retry-After", "3600");
  res.status(503).json({
    error: "The site is closed for maintenance right now. Please try again shortly.",
    maintenance: true,
  });
}
