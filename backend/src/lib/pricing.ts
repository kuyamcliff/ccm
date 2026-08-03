import { db } from "../db.js";

/*
 * What it costs to hold a table.
 *
 * These were two literals in two files — 2,500 in `payments.ts` and 1,500 in
 * `reservations.ts` — with the same numbers written again into the front end's
 * copy. Changing the price meant a developer and a deploy, and missing one of
 * the four places meant the site quoted a figure it did not charge.
 *
 * They live in `site_settings` now, which is a key/value table, so this needed
 * no schema change. The defaults below are the prices the restaurant opened
 * with and are what applies until the owner sets anything.
 */

export const DEPOSIT_KEY = "booking_deposit_fcfa";
export const LATE_CANCEL_KEY = "late_cancel_fee_fcfa";

export const DEFAULT_DEPOSIT_FCFA = 2500;
export const DEFAULT_LATE_CANCEL_FCFA = 1500;

/** Nothing above this can be typed in by accident and charged to a guest. */
export const MAX_PRICE_FCFA = 1_000_000;

/**
 * Reads one money setting.
 *
 * Anything unparseable falls back rather than throwing: a corrupted row must
 * not stop somebody booking a table, and the default is a price the restaurant
 * has actually charged.
 */
async function readMoney(key: string, fallback: number): Promise<number> {
  try {
    const row = (await db.prepare("SELECT value FROM site_settings WHERE key = ?").get(key)) as
      | { value: string }
      | undefined;
    if (!row) return fallback;
    const parsed = Number(String(row.value).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_PRICE_FCFA) return fallback;
    return Math.round(parsed);
  } catch {
    return fallback;
  }
}

/** What a guest pays now to hold a table. Comes off the bill. */
export function getDepositFcfa(): Promise<number> {
  return readMoney(DEPOSIT_KEY, DEFAULT_DEPOSIT_FCFA);
}

/** Charged for cancelling inside the hour, once a deposit has been paid. */
export function getLateCancelFcfa(): Promise<number> {
  return readMoney(LATE_CANCEL_KEY, DEFAULT_LATE_CANCEL_FCFA);
}
