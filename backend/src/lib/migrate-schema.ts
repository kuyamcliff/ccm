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

  /*
   * Passkeys.
   *
   * The table already existed with somewhere to hang a name and a date, from
   * when the account page could list and remove keys that nothing could yet
   * create. What it never had was the credential itself. Every column below is
   * added rather than assumed, and every one is nullable, because ALTER cannot
   * add a NOT NULL column to a table that already has rows in it. The routes
   * treat a row with no credential_id as unusable, which is what those rows
   * always were.
   */
  {
    name: "user_passkeys table",
    sql: `CREATE TABLE IF NOT EXISTS user_passkeys (
            id serial PRIMARY KEY,
            user_id integer NOT NULL,
            display_name text NOT NULL DEFAULT 'Passkey',
            created_at text NOT NULL DEFAULT now_text()
          )`,
  },
  {
    name: "user_passkeys.credential_id",
    sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS credential_id text",
  },
  {
    name: "user_passkeys.public_key",
    sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS public_key text",
  },
  /* The authenticator's own use count. A value that goes backwards is the
     signature of a cloned key, which is the one thing this column is for. */
  {
    name: "user_passkeys.counter",
    sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS counter bigint NOT NULL DEFAULT 0",
  },
  /* How the browser reached the authenticator: internal, hybrid, usb. Passing
     it back on the next sign-in is what lets a phone offer the right prompt
     rather than asking which kind of key this is. */
  {
    name: "user_passkeys.transports",
    sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS transports text",
  },
  {
    name: "user_passkeys.last_used_at",
    sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS last_used_at text",
  },
  /* A credential may exist once across the whole system. Sign-in looks a key up
     by this alone, because a discoverable credential arrives with no hint of
     who it belongs to. */
  {
    name: "user_passkeys.credential_id unique",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS user_passkeys_credential_idx ON user_passkeys (credential_id)",
  },

  /* Per-admin restrictions, set by the owner on the Access page. A missing row
     means "never restricted" — every admin account that existed before this
     table did loses nothing until the owner deliberately locks a scope. */
  {
    name: "admin_permissions",
    sql: `CREATE TABLE IF NOT EXISTS admin_permissions (
            user_id integer NOT NULL,
            scope text NOT NULL,
            granted integer NOT NULL DEFAULT 1,
            updated_at text NOT NULL DEFAULT now_text(),
            updated_by integer,
            PRIMARY KEY (user_id, scope)
          )`,
  },
  /* ── Payments: idempotency and an audit trail ──────────────────────────
     A charge is the one thing here that cannot be undone by editing a row, so
     it gets the two protections a payment flow is expected to have.

     The key is generated by the browser before the first attempt and sent with
     every retry of it. A phone on a bad connection that never sees the response
     will send the same request again; without this the second one starts a
     second real prompt on the customer's handset for money they may already
     have paid. Unique, so the race between two in-flight retries is settled by
     the database rather than by whichever query ran first. */
  {
    name: "payments.idempotency_key",
    sql: "ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key text",
  },
  {
    name: "payments.idempotency_key unique",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_idx ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL",
  },
  /* Every state a payment has been in, appended and never edited.
     `payments.status` stays as the current state because the whole codebase
     reads it, but it is now a cache of the last row here rather than the only
     record. Overwriting a status loses the one thing you need when a customer
     says they were charged twice: what happened, in what order, and what the
     wallet actually told us at each step. */
  {
    name: "payment_events",
    sql: `CREATE TABLE IF NOT EXISTS payment_events (
            id serial PRIMARY KEY,
            payment_id integer NOT NULL,
            status text NOT NULL,
            source text NOT NULL,
            provider_event_id text,
            detail text,
            created_at text NOT NULL DEFAULT now_text()
          )`,
  },
  {
    name: "payment_events.payment_id index",
    sql: "CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON payment_events (payment_id, id)",
  },
  /* Wallets retry a webhook until they get a 2xx, and a retried delivery must
     not be replayed as a second event. The wallet's own event id is the thing
     to key on; unique, so the second delivery is rejected by the index rather
     than by a check that races with itself. */
  {
    name: "payment_events.provider_event_id unique",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_idx ON payment_events (provider_event_id) WHERE provider_event_id IS NOT NULL",
  },

  /* Takeaway is prepaid over the same wallets, so it gets the same protection
     the booking side does. Without it, the retry that follows a lost response
     starts a second prompt for an order already being paid for. */
  {
    name: "takeaway_orders.idempotency_key",
    sql: "ALTER TABLE takeaway_orders ADD COLUMN IF NOT EXISTS idempotency_key text",
  },
  {
    name: "takeaway_orders.idempotency_key unique",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS takeaway_orders_idempotency_key_idx ON takeaway_orders (idempotency_key) WHERE idempotency_key IS NOT NULL",
  },

  /* Closing an account keeps the row and empties it, rather than deleting it.
     The restaurant's books hang off `reservations`, which hangs off `users`,
     and a customer asking to be forgotten is not asking the restaurant to lose
     what it was paid last March. `deleted_at` is what makes the difference
     between a live account and the shell left behind. */
  {
    name: "users.deleted_at",
    sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at text",
  },

  /* One tier above super admin. There was no such role before this feature,
     so the first boot after it ships has to create one: whoever has been
     `super_admin` the longest becomes the `owner`, once, and only if nobody
     already holds that role. Every boot after that is a no-op. */
  {
    name: "owner bootstrap",
    sql: `UPDATE users SET role = 'owner'
          WHERE id = (SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at ASC, id ASC LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')`,
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
