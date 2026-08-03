import { db } from "../db.js";

/**
 * Schema changes, applied at boot.
 *
 * This project has no migrations directory: the schema was built directly in
 * Supabase, and `migrate-media.ts` set the precedent that anything which has to
 * change does so on the way up. Every statement below is written to be safe to
 * run again — `IF NOT EXISTS` throughout — so a deploy that restarts three
 * instances applies the same change three times with the same result.
 *
 * A failure here is logged and stepped over rather than thrown. A column that
 * did not get added will fail loudly at the query that needs it, which is a far
 * better outcome than a restaurant whose site will not boot during service.
 */

interface Step {
  name: string;
  sql: string;
}

const STEPS: Step[] = [
  /* Food and drink chosen while booking a table.
     Deliberately the same shape as `takeaway_orders.items_json` — a JSON array
     of `{ id, name, price, qty }` — so the two order paths can share the
     formatting, the receipt rendering and the kitchen's reading of them. The
     total is stored beside it because a price edited in the console later must
     not silently restate what somebody already paid. */
  {
    name: "reservations.items_json",
    sql: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS items_json text",
  },
  {
    name: "reservations.items_total_fcfa",
    sql: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS items_total_fcfa integer NOT NULL DEFAULT 0",
  },
  /* What a guest paid to hold the table, frozen at the moment they paid it.
     The deposit is a setting now, so without this a receipt reprinted after the
     owner changes the price would quote a figure that was never charged. */
  {
    name: "reservations.deposit_fcfa",
    sql: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_fcfa integer",
  },

  /* Everything in the room that is not a table: the grill, the television, the
     bar, a doorway. Guests cannot book these — that is the whole reason they
     are a separate table rather than a `kind` column on `restaurant_tables`,
     where every one of the booking queries would have had to learn to exclude
     them. */
  {
    name: "floor_fixtures",
    sql: `CREATE TABLE IF NOT EXISTS floor_fixtures (
            id serial PRIMARY KEY,
            kind text NOT NULL,
            label text NOT NULL DEFAULT '',
            pos_x integer NOT NULL DEFAULT 320,
            pos_y integer NOT NULL DEFAULT 280,
            width integer NOT NULL DEFAULT 90,
            height integer NOT NULL DEFAULT 90,
            created_at text NOT NULL DEFAULT now_text()
          )`,
  },

  /* Every message the site tries to send, kept whether it went out or not.
     The provider is not wired up yet, so today every row lands as 'logged';
     when Twilio credentials arrive the same rows start saying 'sent' and this
     table becomes the record of what a guest was actually told. */
  {
    name: "notifications",
    sql: `CREATE TABLE IF NOT EXISTS notifications (
            id serial PRIMARY KEY,
            channel text NOT NULL,
            recipient text NOT NULL,
            template text NOT NULL,
            body text NOT NULL,
            status text NOT NULL DEFAULT 'queued',
            provider_ref text,
            error text,
            user_id integer,
            reservation_id integer,
            created_at text NOT NULL DEFAULT now_text(),
            sent_at text
          )`,
  },
  {
    name: "notifications.created_at index",
    sql: "CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at DESC)",
  },
];

export async function migrateSchema(): Promise<void> {
  for (const step of STEPS) {
    try {
      await db.exec(step.sql);
    } catch (err) {
      console.error(`[schema] "${step.name}" did not apply:`, err instanceof Error ? err.message : err);
    }
  }
}
