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
  { name: "admin_action_permissions", sql: `CREATE TABLE IF NOT EXISTS admin_action_permissions (user_id integer NOT NULL, scope text NOT NULL, action text NOT NULL, granted integer NOT NULL DEFAULT 1, updated_at text NOT NULL DEFAULT now_text(), updated_by integer, PRIMARY KEY (user_id, scope, action))` },
  { name: "payments.idempotency_key", sql: "ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key text" },
  { name: "payments.idempotency_key unique", sql: "CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_idx ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL" },
  { name: "payment_events", sql: `CREATE TABLE IF NOT EXISTS payment_events (id serial PRIMARY KEY, payment_id integer NOT NULL, status text NOT NULL, source text NOT NULL, provider_event_id text, detail text, created_at text NOT NULL DEFAULT now_text())` },
  { name: "payment_events.payment_id index", sql: "CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON payment_events (payment_id, id)" },
  { name: "payment_events.provider_event_id unique", sql: "CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_idx ON payment_events (provider_event_id) WHERE provider_event_id IS NOT NULL" },
  { name: "takeaway_orders.idempotency_key", sql: "ALTER TABLE takeaway_orders ADD COLUMN IF NOT EXISTS idempotency_key text" },
  { name: "takeaway_orders.idempotency_key unique", sql: "CREATE UNIQUE INDEX IF NOT EXISTS takeaway_orders_idempotency_key_idx ON takeaway_orders (idempotency_key) WHERE idempotency_key IS NOT NULL" },
  { name: "users.deleted_at", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at text" },
  { name: "payments.points_spent", sql: "ALTER TABLE payments ADD COLUMN IF NOT EXISTS points_spent integer NOT NULL DEFAULT 0" },
  { name: "takeaway_orders.points_spent", sql: "ALTER TABLE takeaway_orders ADD COLUMN IF NOT EXISTS points_spent integer NOT NULL DEFAULT 0" },
  { name: "payments.gift_fcfa", sql: "ALTER TABLE payments ADD COLUMN IF NOT EXISTS gift_fcfa integer" },
  { name: "payments.gift_fcfa backfill", sql: "UPDATE payments SET gift_fcfa = discount_fcfa WHERE gift_fcfa IS NULL" },
  { name: "takeaway_orders.gift_fcfa", sql: "ALTER TABLE takeaway_orders ADD COLUMN IF NOT EXISTS gift_fcfa integer" },
  { name: "takeaway_orders.gift_fcfa backfill", sql: "UPDATE takeaway_orders SET gift_fcfa = discount_fcfa WHERE gift_fcfa IS NULL" },
  { name: "owner bootstrap", sql: `UPDATE users SET role = 'owner' WHERE id = (SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at ASC, id ASC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')` },
  { name: "menu_items.sold_out", sql: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sold_out integer NOT NULL DEFAULT 0" },
  /* When a sold-out dish comes back by itself. Null means somebody switched it
     off by hand and only somebody switching it back on will return it. */
  { name: "menu_items.sold_out_until", sql: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sold_out_until text" },
  { name: "legal_pages.title_fr", sql: "ALTER TABLE legal_pages ADD COLUMN IF NOT EXISTS title_fr text" },
  { name: "legal_pages.body_fr", sql: "ALTER TABLE legal_pages ADD COLUMN IF NOT EXISTS body_fr text" },
  { name: "legal_pages.title_fr backfill", sql: "UPDATE legal_pages SET title_fr = title WHERE title_fr IS NULL" },
  { name: "legal_pages.body_fr backfill", sql: "UPDATE legal_pages SET body_fr = body WHERE body_fr IS NULL" },
  { name: "user_sessions", sql: `CREATE TABLE IF NOT EXISTS user_sessions (id text PRIMARY KEY, user_id integer NOT NULL, device_name text NOT NULL DEFAULT 'Unknown device', device_type text NOT NULL DEFAULT 'unknown', ip text, location text, created_at text NOT NULL DEFAULT now_text(), last_seen_at text NOT NULL DEFAULT now_text(), revoked_at text)` },
  { name: "user_sessions.user_id index", sql: "CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id, revoked_at)" },
  { name: "email_changes", sql: `CREATE TABLE IF NOT EXISTS email_changes (id serial PRIMARY KEY, user_id integer NOT NULL, new_email text NOT NULL, token_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0, expires_at text NOT NULL, used_at text, created_at text NOT NULL DEFAULT now_text())` },
  { name: "email_changes.user_id index", sql: "CREATE INDEX IF NOT EXISTS email_changes_user_idx ON email_changes (user_id, created_at DESC)" },
  /*
   * A booking may hold more than one table.
   *
   * `reservations.table_id` stays, and stays authoritative for "which table is
   * this booking's" — the door, the console's floor and every alternatives
   * query read it. What it holds is the first table chosen, and this table
   * holds every table including that one. Keeping both is a deliberate
   * denormalisation: a party of twelve across three tables is uncommon enough
   * that making every existing query join through a second table to answer the
   * common case would be paying for the exception on every request.
   *
   * ON DELETE CASCADE on the reservation, so a cancelled booking cannot leave
   * a table looking held. SET NULL is not an option here: a row with no table
   * would be a hold on nothing.
   */
  { name: "reservation_tables", sql: `CREATE TABLE IF NOT EXISTS reservation_tables (reservation_id integer NOT NULL REFERENCES reservations (id) ON DELETE CASCADE, table_id integer NOT NULL REFERENCES restaurant_tables (id) ON DELETE CASCADE, PRIMARY KEY (reservation_id, table_id))` },
  { name: "reservation_tables.table index", sql: "CREATE INDEX IF NOT EXISTS reservation_tables_table_idx ON reservation_tables (table_id)" },
  /* Every booking made before the join table existed held exactly one table,
     and that one is in `table_id`. Without this backfill those bookings would
     read as holding no tables at all the moment anything starts asking the
     join table instead. */
  { name: "reservation_tables backfill", sql: `INSERT INTO reservation_tables (reservation_id, table_id) SELECT id, table_id FROM reservations WHERE table_id IS NOT NULL ON CONFLICT DO NOTHING` },
  /* Who said the guest had arrived. 'guest' when they tapped it on their own
     phone, a member of staff's name when it was done at the door. The column
     it qualifies, `checked_in_by`, already exists. */
  { name: "reservations.arrived_by_guest", sql: "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrived_by_guest integer NOT NULL DEFAULT 0" },
  /* Set when the guest taps "I have it" rather than when a member of staff
     marks the order collected. The status is the same either way; this is only
     so the board can show which of the two happened. */
  { name: "takeaway_orders.collected_by_guest", sql: "ALTER TABLE takeaway_orders ADD COLUMN IF NOT EXISTS collected_by_guest integer NOT NULL DEFAULT 0" },
];
export async function migrateSchema(): Promise<void> { for (const step of STEPS) { try { await db.exec(step.sql); } catch (err) { console.error(`[schema] "${step.name}" did not apply:`, err instanceof Error ? err.message : err); } } }
