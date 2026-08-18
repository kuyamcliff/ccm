import { db } from "../db.js";

/** Small additive migrations for the customer-control layer. Safe to rerun. */
export async function migrateUxControls(): Promise<void> {
  const steps = [
    ["takeaway_orders.payment_method", "ALTER TABLE takeaway_orders ADD COLUMN IF NOT EXISTS payment_method text"],
  ] as const;

  for (const [name, sql] of steps) {
    try {
      await db.exec(sql);
    } catch (err) {
      console.error(`[schema] "${name}" did not apply:`, err instanceof Error ? err.message : err);
    }
  }
}
