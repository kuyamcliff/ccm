import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, "camchop.db"));

/*
 * Connection settings, applied before any query runs.
 *
 * The defaults are tuned for a single-user file, not a web server:
 *
 * - WAL lets readers carry on while a write is in progress. On the default
 *   rollback journal a single order being saved blocks every menu request until
 *   it finishes, which is exactly what falls over when several people order at
 *   once.
 * - busy_timeout makes a blocked write wait its turn instead of failing
 *   immediately with SQLITE_BUSY.
 * - foreign_keys is OFF by default in SQLite, which means every ON DELETE
 *   CASCADE in the schema below silently does nothing. Deleting a support
 *   thread would have left its messages behind forever.
 * - synchronous NORMAL is the documented safe pairing with WAL: durable across
 *   an application crash, and far fewer fsyncs than FULL.
 */
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA synchronous = NORMAL");

/** The value types SQLite columns accept from this codebase. */
export type SqlValue = string | number | null;

/**
 * Applies a partial update by primary key.
 *
 * `table` and the keys of `fields` are always literals chosen in our own code —
 * never request input — so they are safe to interpolate. Values stay bound.
 */
export function applyUpdate(table: string, fields: Record<string, SqlValue>, id: number): boolean {
  const keys = Object.keys(fields);
  if (keys.length === 0) return false;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const info = db
    .prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
  return info.changes > 0;
}

/**
 * Runs `fn` inside an IMMEDIATE transaction and rolls back if it throws.
 * IMMEDIATE takes the write lock up front, so two concurrent redemptions of the
 * same gift card serialise instead of both reading a stale balance.
 *
 * Not reentrant — never call it from inside another transaction.
 */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw err;
  }
}

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  -- Safe with WAL: survives process crashes, only risks the last commits on
  -- sudden power loss, and removes an fsync from every write.
  PRAGMA synchronous = NORMAL;
  -- Wait rather than throwing SQLITE_BUSY when a write overlaps a read.
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -16000;
`);

db.exec(`

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    zone TEXT NOT NULL DEFAULT 'main',
    pos_x REAL NOT NULL DEFAULT 0,
    pos_y REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES restaurant_tables(id),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    phone TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    cancellation_fee_fcfa INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_reservations_table ON reservations(table_id, date, time);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id),
    amount_fcfa INTEGER NOT NULL,
    momo_phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reference TEXT,
    type TEXT NOT NULL DEFAULT 'reservation',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_fcfa INTEGER,
    price_label TEXT,
    image_url TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
`);

// Migrations: add new columns to existing tables without breaking current data
const migrations: string[] = [
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
  "ALTER TABLE users ADD COLUMN banned_at TEXT",
  "ALTER TABLE reservations ADD COLUMN ccm_code TEXT",
  "ALTER TABLE reservations ADD COLUMN cancelled_at TEXT",
  "ALTER TABLE reservations ADD COLUMN cancel_reason TEXT",
  "ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'mtn_momo'",
  // Legacy column from the previous payment gateway. Kept so historic rows
  // still read back; nothing writes to it any more.
  "ALTER TABLE payments ADD COLUMN notchpay_trx TEXT",
  "ALTER TABLE users ADD COLUMN totp_secret TEXT",
  "ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS user_passkeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    display_name TEXT NOT NULL DEFAULT 'My passkey',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "ALTER TABLE reviews ADD COLUMN media_urls TEXT NOT NULL DEFAULT '[]'",
  `CREATE TABLE IF NOT EXISTS review_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote TEXT NOT NULL CHECK (vote IN ('like', 'dislike')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(review_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS review_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "ALTER TABLE users ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE menu_items ADD COLUMN dietary_tags TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE reviews ADD COLUMN admin_reply TEXT",
  "ALTER TABLE reviews ADD COLUMN admin_reply_at TEXT",
  `CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'percent',
    value INTEGER NOT NULL,
    min_spend_fcfa INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '🔥',
    valid_until TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS waitlist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    notified_at TEXT,
    seated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS gallery_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitter_name TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    is_approved INTEGER NOT NULL DEFAULT 0,
    is_featured INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS event_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'other',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    guest_count INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS gift_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    initial_value_fcfa INTEGER NOT NULL,
    remaining_value_fcfa INTEGER NOT NULL,
    purchased_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS takeaway_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_no TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    total_fcfa INTEGER NOT NULL,
    pickup_time TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    promo_code TEXT,
    gift_card_code TEXT,
    discount_fcfa INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS points_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_type TEXT,
    ref_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "ALTER TABLE payments ADD COLUMN promo_code TEXT",
  "ALTER TABLE payments ADD COLUMN gift_card_code TEXT",
  "ALTER TABLE payments ADD COLUMN discount_fcfa INTEGER NOT NULL DEFAULT 0",

  // Bumping session_version invalidates every JWT already issued to that user.
  "ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1",

  // Set once a payment's promo/gift-card discount has been consumed, so two
  // callers racing to settle cannot redeem the same one twice.
  "ALTER TABLE payments ADD COLUMN redeemed_at TEXT",

  // MTN's own transaction id, returned once a MoMo collection succeeds.
  "ALTER TABLE payments ADD COLUMN momo_transaction_id TEXT",

  // Takeaway can be paid up front by MoMo or settled at the counter. Tracking
  // that on the order avoids widening `payments`, which is keyed to a booking.
  "ALTER TABLE takeaway_orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'",
  "ALTER TABLE takeaway_orders ADD COLUMN momo_reference TEXT",
  "ALTER TABLE takeaway_orders ADD COLUMN momo_transaction_id TEXT",
  "ALTER TABLE takeaway_orders ADD COLUMN momo_phone TEXT",
  "ALTER TABLE takeaway_orders ADD COLUMN paid_at TEXT",
  "ALTER TABLE takeaway_orders ADD COLUMN pay_requested_at TEXT",
  "ALTER TABLE takeaway_orders ADD COLUMN fail_reason TEXT",
  "CREATE INDEX IF NOT EXISTS idx_takeaway_momo_ref ON takeaway_orders(momo_reference)",
  // MoMo failure code (NOT_ENOUGH_FUNDS, EXPIRED, …) kept for support queries.
  "ALTER TABLE payments ADD COLUMN fail_reason TEXT",

  // Every gift card debit is written here, giving an auditable balance history.
  `CREATE TABLE IF NOT EXISTS gift_card_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
    amount_fcfa INTEGER NOT NULL,
    ref_type TEXT NOT NULL DEFAULT '',
    ref_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Append-only record of privileged actions.
  `CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT,
    detail TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Indexes matching the filters these tables are actually queried by.
  "CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(date, status)",
  // Unique so two bookings can never share a reference, and so a lookup by
  // scanned code resolves to exactly one row. The earlier non-unique index
  // used this same name, and CREATE ... IF NOT EXISTS matches on name alone,
  // so it has to be dropped before the unique one can take effect.
  "DROP INDEX IF EXISTS idx_reservations_ccm",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_ccm ON reservations(ccm_code)",

  // Door check-in. Recording who admitted the party and when is what stops the
  // same receipt (or a screenshot of it) being walked in twice.
  // Lets a guest clear a finished or cancelled booking off their own list
  // without destroying the record the restaurant still needs for its books.
  "ALTER TABLE reservations ADD COLUMN hidden_at TEXT",

  "ALTER TABLE reservations ADD COLUMN checked_in_at TEXT",
  "ALTER TABLE reservations ADD COLUMN checked_in_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
  "CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference)",
  "CREATE INDEX IF NOT EXISTS idx_payments_reservation ON payments(reservation_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_gallery_approved ON gallery_photos(is_approved, is_featured, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_menu_active ON menu_items(is_active, category, position)",
  "CREATE INDEX IF NOT EXISTS idx_review_votes_review ON review_votes(review_id, vote)",
  "CREATE INDEX IF NOT EXISTS idx_review_replies_review ON review_replies(review_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_takeaway_user ON takeaway_orders(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist_entries(status, joined_at)",
  "CREATE INDEX IF NOT EXISTS idx_events_status ON event_bookings(status, date)",
  "CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at)",

  // Terms and privacy text, so the owner can edit them without a deploy.
  `CREATE TABLE IF NOT EXISTS legal_pages (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  /* ── Support chat ──────────────────────────────────────────────────────
     One open thread per person. Guests are identified by a random token kept
     in their own browser, so someone can ask a question before signing up and
     still see the reply when they come back. */
  `CREATE TABLE IF NOT EXISTS support_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    guest_token TEXT,
    display_name TEXT NOT NULL DEFAULT 'Guest',
    status TEXT NOT NULL DEFAULT 'open',
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    unread_for_admin INTEGER NOT NULL DEFAULT 0,
    unread_for_user INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    author_name TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_support_thread_user ON support_threads(user_id) WHERE user_id IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_support_thread_guest ON support_threads(guest_token) WHERE guest_token IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS idx_support_threads_activity ON support_threads(status, last_message_at)",
  "CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages(thread_id, created_at)",

  /* ── Password resets ───────────────────────────────────────────────────
     Only the hash of the token is stored, so a leaked database still does not
     hand anyone a working reset link. `issued_by` records which admin created
     it when the reset came from the dashboard rather than the user. */
  `CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'admin',
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token_hash)",
  "CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id, used_at)",
  /* A 6-digit code is only a million guesses, so every wrong attempt is counted
     and the code is burned after a handful. Without this the code would be
     trivially brute-forced. */
  "ALTER TABLE password_resets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0",

  /* Offers used to carry an emoji. Emoji render differently on every platform
     and fight the palette, so an offer now names one of the site's line icons
     and the front end draws it in the current text colour. */
  "ALTER TABLE offers ADD COLUMN icon TEXT NOT NULL DEFAULT 'flame'",

  /* ── Support: many conversations per person ────────────────────────────
     A thread used to be one-per-customer, which meant a question asked in
     March and one asked in July shared a transcript and there was no way to
     start a fresh one. The uniqueness constraints are dropped so a customer
     keeps a history of separate conversations. */
  "DROP INDEX IF EXISTS idx_support_thread_user",
  "DROP INDEX IF EXISTS idx_support_thread_guest",
  "CREATE INDEX IF NOT EXISTS idx_support_thread_user ON support_threads(user_id, last_message_at)",
  "CREATE INDEX IF NOT EXISTS idx_support_thread_guest ON support_threads(guest_token, last_message_at)",

  /* The first line a customer writes, kept as the thread's title so a list of
     past conversations is readable without opening each one. */
  "ALTER TABLE support_threads ADD COLUMN subject TEXT NOT NULL DEFAULT ''",

  /* Which admin owns the conversation. Null means it is waiting for whoever
     comes online next. */
  "ALTER TABLE support_threads ADD COLUMN assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
  "ALTER TABLE support_threads ADD COLUMN assigned_at TEXT",
  "CREATE INDEX IF NOT EXISTS idx_support_thread_assignee ON support_threads(assigned_admin_id, status)",

  /* A handover is recorded rather than just overwriting the assignee, so the
     admin receiving a thread can see where it came from and why. */
  `CREATE TABLE IF NOT EXISTS support_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
    from_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    to_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_support_transfers_thread ON support_transfers(thread_id, created_at)",

  /* Marks the system lines the desk writes itself — an assignment or a
     handover — so the UI can style them apart from what a person typed. */
  "ALTER TABLE support_messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'",

  /* ── Takeaway: paid before it is cooked ────────────────────────────────
     An order now starts life awaiting payment and only enters the kitchen
     queue once the money has landed. Collection is recorded the same way a
     booking's arrival is, so one scanner handles both. */
  "ALTER TABLE takeaway_orders ADD COLUMN collected_at TEXT",
  "ALTER TABLE takeaway_orders ADD COLUMN collected_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
  "CREATE INDEX IF NOT EXISTS idx_takeaway_order_no ON takeaway_orders(order_no)",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column already exists in an upgraded DB */ }
}

// Promote existing admins to super_admin role
db.exec(`UPDATE users SET role = 'super_admin' WHERE is_admin = 1 AND role = 'user'`);

// Seed tables if empty
const tableCount = (db.prepare("SELECT COUNT(*) as c FROM restaurant_tables").get() as { c: number }).c;
if (tableCount === 0) {
  const ins = db.prepare(
    "INSERT INTO restaurant_tables (label, capacity, zone, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)"
  );
  ins.run("T1", 2, "main", 80, 80);
  ins.run("T2", 4, "main", 220, 80);
  ins.run("T3", 4, "main", 360, 80);
  ins.run("T4", 6, "main", 80, 200);
  ins.run("T5", 4, "main", 230, 200);
  ins.run("T6", 4, "main", 370, 200);
  ins.run("T7", 2, "main", 80, 320);
  ins.run("T8", 6, "main", 250, 320);
  ins.run("O1", 4, "outdoor", 80, 470);
  ins.run("O2", 4, "outdoor", 230, 470);
  ins.run("O3", 6, "outdoor", 380, 470);
  ins.run("O4", 2, "outdoor", 510, 470);
}

// Seed menu items if empty
const menuCount = (db.prepare("SELECT COUNT(*) as c FROM menu_items").get() as { c: number }).c;
if (menuCount === 0) {
  const mi = db.prepare(
    "INSERT INTO menu_items (category, name, description, price_fcfa, image_url, position) VALUES (?, ?, ?, ?, ?, ?)"
  );
  mi.run("From the grill", "Grilled chicken, half", "Charcoal all the way, with onions and pepper sauce.", 2500, "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&q=80", 1);
  mi.run("From the grill", "Grilled chicken, full", "A whole bird. For sharing, or not. We will not judge.", 4500, "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&q=80", 2);
  mi.run("From the grill", "Pork ribs", "Slow over charcoal, glazed with our house sauce.", 3500, "https://images.unsplash.com/photo-1544025162-d76594f0d702?w=600&q=80", 3);
  mi.run("From the grill", "Goat on the bone", "The whole neighbourhood smells it coming.", 3500, "https://images.unsplash.com/photo-1607116667981-ff148a5e4a97?w=600&q=80", 4);
  mi.run("From the grill", "Mixed grill plate", "Chicken, pork and goat for two.", 8000, "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80", 5);
  mi.run("Sides", "Fried plantain", "Sweet and golden.", 500, null, 1);
  mi.run("Sides", "Extra bread", "Fresh rolls.", 300, null, 2);
  mi.run("Sides", "Pepper sauce", "Our house sauce.", 200, null, 3);
  mi.run("Drinks", "Beer 33cl", "Cold from the fridge.", 800, null, 1);
  mi.run("Drinks", "Beer 65cl", "The big one.", 1200, null, 2);
  mi.run("Drinks", "Soft drink", "Coke, Fanta, Sprite.", 500, null, 3);
  mi.run("Drinks", "Water", "600ml.", 300, null, 4);
}

/* Seed the legal pages from the text that used to be hardcoded in the React
   components, so an owner who never opens the editor still has a real policy.
   Body format is plain text: "## " starts a heading, blank lines split
   paragraphs. Deliberately not HTML, so nothing the admin types can inject
   markup into the page. */
const legalCount = (db.prepare("SELECT COUNT(*) as c FROM legal_pages").get() as { c: number }).c;
if (legalCount === 0) {
  const lp = db.prepare("INSERT INTO legal_pages (slug, title, body) VALUES (?, ?, ?)");

  lp.run("terms", "Terms of use", `## Using this website
This website is operated by Cam Chop Meat. By using it, you agree to these terms. If you do not agree, please do not use the site.

## Reservations
A reservation made through this website is a request to hold a table. We do our best to honour every booking. If something prevents us from doing so, we will contact you on the phone number you provided.

Reservations are held for 15 minutes after the booked time. If you are running late, call us and we will hold the table longer.

## Payments
Where a deposit is collected through MTN MoMo, it is applied to your bill on arrival. Deposits are non-refundable if you do not show up and do not cancel at least one hour before your booking time.

## Reviews
Reviews you post are public and linked to your account name. We may remove reviews that are abusive, spam, or unrelated to the restaurant.

## Accounts
You are responsible for keeping your password secure. Do not share your account with others. Contact us if you believe your account has been compromised.

## Limitation of liability
This website is provided as-is. We are not liable for any loss arising from your use of the website or from a reservation that could not be honoured due to circumstances beyond our control.

## Contact
Reach us at the address and phone number shown in the footer of this site.`);

  lp.run("privacy", "Privacy policy", `## What we collect and why
When you create an account we store your name, email address, and a hashed copy of your password. The password itself is never stored, only a one-way cryptographic hash that cannot be reversed.

When you make a reservation we store the date, time, party size, phone number, and any note you add. This is so we can hold your table and reach you if something changes on our side.

When you post a review we store your rating, your text, and the name from your account. Reviews are public.

## Cookies
We set one session cookie when you sign in. It keeps you logged in for up to 30 days and is deleted when you sign out. We do not use advertising cookies, analytics cookies, or any third-party tracking.

## Who we share data with
Nobody. We do not sell, rent, or share your personal information with any third party. Your data stays on our server.

## How long we keep it
We keep your account and reservation history for as long as your account is open. If you want your data deleted, contact us and we will remove it within a reasonable time.

## Your rights
You can ask us what data we hold about you, request a copy, ask us to correct it, or ask us to delete it. Contact us and we will sort it out.

## Security
Passwords are hashed using a modern algorithm. Sessions use HTTP-only cookies that JavaScript on the page cannot read. We use HTTPS in production.

## Contact
Reach us at the address and phone number shown in the footer of this site.`);
}

// Seed site settings if empty
const settingsCount = (db.prepare("SELECT COUNT(*) as c FROM site_settings").get() as { c: number }).c;
if (settingsCount === 0) {
  const ss = db.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)");
  ss.run("phone", "");
  ss.run("address", "562V+C7V, Clerks Quarters, Buea");
  ss.run("tiktok_url", "https://www.tiktok.com/@cam.chop.meat");
  ss.run("ig_url", "");
  ss.run("fb_url", "");
}
