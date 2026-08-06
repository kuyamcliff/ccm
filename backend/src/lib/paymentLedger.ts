import { db } from "../db.js";

/**
 * Every state a payment has passed through, appended and never edited.
 *
 * `payments.status` still holds the current state, because the console, the
 * receipts and two dozen queries read it, but it is a cache of the last row
 * here rather than the record itself. The distinction only matters on the day
 * somebody says they were charged twice, and on that day an overwritten column
 * has nothing to say: it holds one word, with no idea what came before it, who
 * caused it, or what the wallet actually reported at the time.
 *
 * Nothing in here ever updates or deletes. A correction is another row.
 */

export type LedgerStatus = "initiated" | "pending" | "completed" | "failed";

/** Where the state change came from, so a disputed charge can be traced to the
 *  thing that caused it rather than guessed at. */
export type LedgerSource = "checkout" | "poll" | "webhook" | "reconcile" | "customer" | "admin";

export interface LedgerEntry {
  paymentId: number;
  status: LedgerStatus;
  source: LedgerSource;
  /** The wallet's own event id, when this came from a webhook. Unique, so a
   *  redelivery is refused by the index rather than replayed. */
  providerEventId?: string | null;
  /** Free text: the failure code, the wallet transaction id, whatever helps. */
  detail?: string | null;
}

/**
 * Appends one event.
 *
 * Returns false when the row was rejected as a duplicate, which is the answer
 * the webhook route acts on: a delivery that has already been recorded must
 * not be settled a second time.
 *
 * A ledger write must never be what takes down a payment, so anything other
 * than a duplicate is logged and swallowed. Losing the audit row is bad;
 * failing a request that has already moved money is worse.
 */
export async function record(entry: LedgerEntry): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO payment_events (payment_id, status, source, provider_event_id, detail)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        entry.paymentId,
        entry.status,
        entry.source,
        entry.providerEventId ?? null,
        entry.detail ?? null
      );
    return true;
  } catch (err) {
    // 23505 is Postgres's unique_violation: this event has been seen before.
    if (err && typeof err === "object" && "code" in err && String((err as { code: unknown }).code) === "23505") {
      return false;
    }
    console.error("[ledger] could not record payment event:", err instanceof Error ? err.message : err);
    return true;
  }
}

/** Whether a wallet event has already been recorded, whatever it concerned.
 *  Checked before the work, so a redelivery is cheap to refuse. */
export async function alreadySeen(providerEventId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS hit FROM payment_events WHERE provider_event_id = ?")
    .get(providerEventId);
  return Boolean(row);
}

export interface LedgerRow {
  status: string;
  source: string;
  detail: string | null;
  created_at: string;
}

/** One payment's history, oldest first. Read by the console. */
export async function history(paymentId: number): Promise<LedgerRow[]> {
  return (await db
    .prepare(
      `SELECT status, source, detail, created_at FROM payment_events
       WHERE payment_id = ? ORDER BY id ASC`
    )
    .all(paymentId)) as unknown as LedgerRow[];
}
