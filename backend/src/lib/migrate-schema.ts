import { db } from "../db.js";

interface Step { name: string; sql: string; }

const STEPS: Step[] = [
  { name: "reservations.items_json", sql: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS items_json text" },
  { name: "reservations.items_total_fcfa", sql: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS items_total_fcfa integer NOT NULL DEFAULT 0" },
  { name: "reservations.deposit_fcfa", sql: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_fcfa integer" },
  { name: "floor_fixtures", sql: `CREATE TABLE IF NOT EXISTS floor_fixtures (id serial PRIMARY KEY, kind text NOT NULL, label text NOT NULL DEFAULT '', pos_x integer NOT NULL DEFAULT 320, pos_y integer NOT NULL DEFAULT 280, width integer NOT NULL DEFAULT 90, height integer NOT NULL DEFAULT 90, created_at text NOT NULL DEFAULT now_text())` },
  { name: "notifications", sql: `CREATE TABLE IF NOT EXISTS notifications (id serial PRIMARY KEY, channel text NOT NULL, recipient text NOT NULL, template text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'queued', provider_ref text, error text, user_id integer, reservation_id integer, created_at text NOT NULL DEFAULT now_text(), sent_at text)` },
  { name: "notifications.created_at index", sql: "CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at DESC)" },
  { name: "user_passkeys table", sql: `CREATE TABLE IF NOT EXISTS user_passkeys (id serial PRIMARY KEY, user_id integer NOT NULL, display_name text NOT NULL DEFAULT 'Passkey', created_at text NOT NULL DEFAULT now_text())` },
  { name: "user_passkeys.credential_id", sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS credential_id text" },
  { name: "user_passkeys.public_key", sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS public_key text" },
  { name: "user_passkeys.counter", sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS counter bigint NOT NULL DEFAULT 0" },
  { name: "user_passkeys.transports", sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS transports text" },
  { name: "user_passkeys.last_used_at", sql: "ALTER TABLE user_passkeys ADD COLUMN IF NOT EXISTS last_used_at text" },
  { name: "user_passkeys.credential_id unique", sql: "CREATE UNIQUE INDEX IF NOT EXISTS user_passkeys_credential_idx ON user_passkeys (credential_id)" },
  { name: "admin_permissions", sql: `CREATE TABLE IF NOT EXISTS admin_permissions (user_id integer NOT NULL, scope text NOT NULL, granted integer NOT NULL DEFAULT 1, updated_at text NOT NULL DEFAULT now_text(), updated_by integer, PRIMARY KEY (user_id, scope))` },
  { name: "payments.idempotency_key", sql: "ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key text" },
  { name: "payments.idempotency_key unique", sql: "CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_idx ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL" },
  { name: "payment_events", sql: `CREATE TABLE IF NOT EXISTS payment_events (id serial PRIMARY KEY, payment_id integer NOT NULL, status text NOT NULL, source text NOT NULL, provider_event_id text, detail text, created_at text NOT NULL DEFAULT now_text())` },
  { name: "payment_events.payment_id index", sql: "CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON payment_events (payment_id, id)" },
  { name: "payment_events.provider_event_id unique", sql: "CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_idx ON payment_events (provider_event_id) WHERE provider_event_id IS NOT NULL" },
  { name: "takeaway_orders.idempotency_key", sql: "ALTER TABLE takeaway_orders ADD COLUMN IF NOT EXISTS idempotency_key text" },
  { name: "takeaway_orders.idempotency_key unique", sql: "CREATE UNIQUE INDEX IF NOT EXISTS takeaway_orders_idempotency_key_idx ON takeaway_orders (idempotency_key) WHERE idempotency_key IS NOT NULL" },
  { name: "legal_pages.title_fr", sql: "ALTER TABLE legal_pages ADD COLUMN IF NOT EXISTS title_fr text" },
  { name: "legal_pages.body_fr", sql: "ALTER TABLE legal_pages ADD COLUMN IF NOT EXISTS body_fr text" },
  { name: "legal_pages.title_fr backfill", sql: "UPDATE legal_pages SET title_fr = title WHERE title_fr IS NULL" },
  { name: "legal_pages.body_fr backfill", sql: "UPDATE legal_pages SET body_fr = body WHERE body_fr IS NULL" },
];

export async function migrateSchema(): Promise<void> {
  for (const step of STEPS) {
    try { await db.exec(step.sql); }
    catch (err) { console.error(`[schema] "${step.name}" did not apply:`, err instanceof Error ? err.message : err); }
  }
}
