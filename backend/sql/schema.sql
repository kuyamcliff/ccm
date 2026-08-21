-- ============================================================================
-- CCM base schema
-- ============================================================================
--
-- Until this file existed, the shape of the database lived only inside the
-- running production database. `lib/migrate-schema.ts` holds incremental
-- ALTERs that assume every table below already exists, so a fresh PostgreSQL
-- instance could not be brought up from this repository at all. That meant no
-- local development without a production dump, no integration tests in CI,
-- and — the part that matters most — no way to rebuild the database if it were
-- ever lost.
--
-- This file is the authoritative starting point. It is idempotent: running it
-- against an existing database changes nothing, so it is safe to apply before
-- the incremental migrations on every boot.
--
-- Conventions this codebase already uses, preserved here rather than improved:
--   * Timestamps are `text`, written by now_text() as 'YYYY-MM-DD HH:MM:SS' in
--     UTC. The frontend's parseStamp() reads exactly that shape.
--   * Booleans are `integer` 0/1.
--   * Money is whole FCFA in `integer`. There is no minor unit for this
--     currency, so there is nothing to round.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS camchop;
SET search_path = camchop, public;

-- ── Time helpers ────────────────────────────────────────────────────────────
--
-- Timestamps and dates are stored as text, so every comparison against "now"
-- has to produce text in exactly the stored format. These three functions are
-- the only correct way to do that, and queries across the whole backend depend
-- on them existing. Nothing else in the repository creates them.

/* 'YYYY-MM-DD HH:MM:SS' in UTC — the shape every `created_at` is written in
   and the shape the frontend's parseStamp() expects. */
CREATE OR REPLACE FUNCTION now_text() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;

/* The same, shifted. Used for windows like "payments still pending in the last
   thirty minutes", which compare directly against a stored timestamp. */
CREATE OR REPLACE FUNCTION now_text_offset(shift interval) RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT to_char((now() AT TIME ZONE 'UTC') + shift, 'YYYY-MM-DD HH24:MI:SS') $$;

/* 'YYYY-MM-DD', shifted. Used against `date` columns, which hold a calendar
   day with no time part, so this must not return a timestamp. */
CREATE OR REPLACE FUNCTION today_offset(shift interval) RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT to_char((now() AT TIME ZONE 'UTC') + shift, 'YYYY-MM-DD') $$;

-- ── People ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL,
  password_hash   text NOT NULL,
  role            text NOT NULL DEFAULT 'user',
  points_balance  integer NOT NULL DEFAULT 0,
  /* Bumped to invalidate every issued token for this account at once: a
     session cookie carries the version it was signed with, and loadUser()
     rejects it once the two disagree.

     The default must stay 1. Registration signs the new visitor's cookie with
     a hardcoded version 1 rather than reading this column back, so a default
     of 0 leaves every newly registered account holding a cookie the server
     refuses — signed up, and immediately signed out. */
  session_version integer NOT NULL DEFAULT 1,
  totp_secret     text,
  totp_enabled    integer NOT NULL DEFAULT 0,
  banned_at       text,
  deleted_at      text,
  created_at      text NOT NULL DEFAULT now_text()
);
-- Email identity is case-insensitive: one account per address however typed.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS user_passkeys (
  id            serial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id text,
  public_key    text,
  counter       bigint NOT NULL DEFAULT 0,
  transports    text,
  display_name  text NOT NULL DEFAULT 'Passkey',
  last_used_at  text,
  created_at    text NOT NULL DEFAULT now_text()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_passkeys_credential_idx ON user_passkeys (credential_id);

-- One row per signed-in device, so "Sessions" in the account's security tab
-- can show and individually revoke each one. `id` is the session's own random
-- id (the JWT's `jti` claim), not a serial — it has to be guessable by
-- nobody and generated before the row exists, at the moment a session is
-- signed. A session cookie issued before this table existed carries no jti
-- and is validated the old way, purely by session_version; it simply never
-- appears in this list until its owner signs in again.
CREATE TABLE IF NOT EXISTS user_sessions (
  id            text PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_name   text NOT NULL DEFAULT 'Unknown device',
  device_type   text NOT NULL DEFAULT 'unknown',
  ip            text,
  location      text,
  created_at    text NOT NULL DEFAULT now_text(),
  last_seen_at  text NOT NULL DEFAULT now_text(),
  revoked_at    text
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id, revoked_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  issued_by  integer,
  channel    text NOT NULL DEFAULT 'email',
  attempts   integer NOT NULL DEFAULT 0,
  expires_at text NOT NULL,
  used_at    text,
  created_at text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at DESC);

-- A pending email change, proven by a code sent to the *new* address rather
-- than the old one: the property that matters here is that the guest can
-- read mail sent there, not that they remember their old inbox. Kept as its
-- own table rather than folded into password_resets so starting one flow can
-- never silently burn a code issued for the other.
CREATE TABLE IF NOT EXISTS email_changes (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_email  text NOT NULL,
  token_hash text NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  expires_at text NOT NULL,
  used_at    text,
  created_at text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS email_changes_user_idx ON email_changes (user_id, created_at DESC);

-- ── Staff authorisation ─────────────────────────────────────────────────────
-- Page-level scope first, then the action within it. Both default-deny by
-- absence of a row only for plain admins; higher roles bypass these entirely.

CREATE TABLE IF NOT EXISTS admin_permissions (
  user_id    integer NOT NULL,
  scope      text NOT NULL,
  granted    integer NOT NULL DEFAULT 1,
  updated_at text NOT NULL DEFAULT now_text(),
  updated_by integer,
  PRIMARY KEY (user_id, scope)
);

CREATE TABLE IF NOT EXISTS admin_action_permissions (
  user_id    integer NOT NULL,
  scope      text NOT NULL,
  action     text NOT NULL,
  granted    integer NOT NULL DEFAULT 1,
  updated_at text NOT NULL DEFAULT now_text(),
  updated_by integer,
  PRIMARY KEY (user_id, scope, action)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          serial PRIMARY KEY,
  actor_id    integer,
  actor_name  text NOT NULL DEFAULT '',
  action      text NOT NULL,
  target_type text NOT NULL DEFAULT '',
  target_id   text,
  detail      text NOT NULL DEFAULT '',
  ip          text,
  created_at  text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC, id DESC);

-- ── The room ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id         serial PRIMARY KEY,
  label      text NOT NULL,
  capacity   integer NOT NULL DEFAULT 2,
  zone       text NOT NULL DEFAULT '',
  pos_x      integer NOT NULL DEFAULT 320,
  pos_y      integer NOT NULL DEFAULT 280,
  active     integer NOT NULL DEFAULT 1,
  created_at text NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS floor_fixtures (
  id         serial PRIMARY KEY,
  kind       text NOT NULL,
  label      text NOT NULL DEFAULT '',
  pos_x      integer NOT NULL DEFAULT 320,
  pos_y      integer NOT NULL DEFAULT 280,
  width      integer NOT NULL DEFAULT 90,
  height     integer NOT NULL DEFAULT 90,
  created_at text NOT NULL DEFAULT now_text()
);

-- ── Menu ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS menu_items (
  id           serial PRIMARY KEY,
  category     text NOT NULL DEFAULT '',
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  -- Null price means sold by weight and settled at the counter, which is why
  -- this is nullable and price_label exists beside it.
  price_fcfa   integer,
  price_label  text,
  image_url    text,
  position     integer NOT NULL DEFAULT 0,
  /* Off the menu entirely: not shown, not orderable, not mentioned. */
  is_active    integer NOT NULL DEFAULT 1,
  /* On the menu but not available today. Deliberately distinct from
     is_active: a guest who cannot find the goat at all assumes it was never
     sold here, where "sold out today" tells them to come back tomorrow. */
  sold_out     integer NOT NULL DEFAULT 0,
  dietary_tags text NOT NULL DEFAULT '',
  created_at   text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS menu_items_category_idx ON menu_items (category, position, id);

-- ── Bookings ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservations (
  id                    serial PRIMARY KEY,
  user_id               integer REFERENCES users (id) ON DELETE SET NULL,
  table_id              integer REFERENCES restaurant_tables (id) ON DELETE SET NULL,
  date                  text NOT NULL,
  time                  text NOT NULL,
  party_size            integer NOT NULL DEFAULT 2,
  phone                 text NOT NULL DEFAULT '',
  note                  text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'pending_payment',
  payment_status        text NOT NULL DEFAULT 'unpaid',
  cancellation_fee_fcfa integer NOT NULL DEFAULT 0,
  ccm_code              text,
  cancelled_at          text,
  cancel_reason         text,
  checked_in_at         text,
  checked_in_by         text,
  arrived_by_guest      integer NOT NULL DEFAULT 0,
  hidden_at             text,
  items_json            text,
  items_total_fcfa      integer NOT NULL DEFAULT 0,
  deposit_fcfa          integer,
  created_at            text NOT NULL DEFAULT now_text()
);
/*
 * The tables a booking holds.
 *
 * `reservations.table_id` is the first one chosen and stays the answer to
 * "which table is this booking's" for the door, the floor and the alternatives
 * queries. This holds every table it took, that one included, so a party of
 * twelve can be sat across three. See migrate-schema.ts for why both exist.
 */
CREATE TABLE IF NOT EXISTS reservation_tables (
  reservation_id integer NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
  table_id       integer NOT NULL REFERENCES restaurant_tables (id) ON DELETE CASCADE,
  PRIMARY KEY (reservation_id, table_id)
);
CREATE INDEX IF NOT EXISTS reservation_tables_table_idx ON reservation_tables (table_id);
CREATE INDEX IF NOT EXISTS reservations_date_idx ON reservations (date, time);
CREATE INDEX IF NOT EXISTS reservations_user_idx ON reservations (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS reservations_ccm_code_idx ON reservations (ccm_code) WHERE ccm_code IS NOT NULL;
/*
 * Deliberately NOT here: a unique index on (table_id, date, time).
 *
 * Two guests can still race each other onto the same table, because the route
 * checks for a clash and then inserts, and another request fits between those
 * two statements. A unique index is the usual answer and would close it.
 *
 * It cannot be added as things stand. The application treats a booking left in
 * `pending_payment` for more than thirty minutes as having released its table,
 * but that rule lives only in the WHERE clause of the clash query — nothing
 * ever moves the row out of `pending_payment`. A partial index cannot express
 * "within the last thirty minutes" either, because now() is not immutable. So
 * an index over pending_payment + confirmed would hold a table for ever the
 * first time somebody abandoned a checkout on it, and one over confirmed alone
 * would move the failure into payment settlement, after the money is taken.
 *
 * Closing this properly means giving an abandoned hold a real end: expire the
 * row to a terminal status, then index on what is genuinely live. That is a
 * change to the payment lifecycle and wants its own work, not a line here.
 *
 * The route already translates a 23505 on this table into the same "already
 * reserved" message a guest would otherwise have seen, so the constraint can
 * be introduced later without a customer ever meeting a raw database error.
 */

-- ── Takeaway ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS takeaway_orders (
  id               serial PRIMARY KEY,
  order_no         text NOT NULL,
  user_id          integer REFERENCES users (id) ON DELETE SET NULL,
  name             text NOT NULL DEFAULT '',
  phone            text NOT NULL DEFAULT '',
  items_json       text NOT NULL DEFAULT '[]',
  total_fcfa       integer NOT NULL DEFAULT 0,
  pickup_time      text NOT NULL DEFAULT '',
  note             text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'awaiting_payment',
  payment_status   text NOT NULL DEFAULT 'unpaid',
  payment_method   text,
  momo_reference   text,
  momo_phone       text,
  pay_requested_at text,
  fail_reason      text,
  momo_transaction_id text,
  promo_code       text,
  gift_card_code   text,
  discount_fcfa    integer NOT NULL DEFAULT 0,
  gift_fcfa        integer,
  points_spent     integer NOT NULL DEFAULT 0,
  idempotency_key  text,
  -- When the money actually landed, as distinct from when the order was made.
  -- The receipt prints this, so it is not merely a duplicate of created_at.
  paid_at          text,
  collected_at     text,
  collected_by     text,
  collected_by_guest integer NOT NULL DEFAULT 0,
  created_at       text NOT NULL DEFAULT now_text()
);
CREATE UNIQUE INDEX IF NOT EXISTS takeaway_orders_order_no_idx ON takeaway_orders (order_no);
CREATE UNIQUE INDEX IF NOT EXISTS takeaway_orders_idempotency_key_idx
  ON takeaway_orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS takeaway_orders_user_idx ON takeaway_orders (user_id, created_at DESC);

-- ── Money ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id                  serial PRIMARY KEY,
  reservation_id      integer REFERENCES reservations (id) ON DELETE CASCADE,
  user_id             integer REFERENCES users (id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'pending',
  amount_fcfa         integer NOT NULL DEFAULT 0,
  discount_fcfa       integer NOT NULL DEFAULT 0,
  gift_fcfa           integer,
  points_spent        integer NOT NULL DEFAULT 0,
  reference           text NOT NULL,
  type                text NOT NULL DEFAULT 'deposit',
  method              text,
  momo_phone          text,
  momo_transaction_id text,
  promo_code          text,
  gift_card_code      text,
  idempotency_key     text,
  redeemed_at         text,
  -- The provider's reason, kept so a customer asking "why did it fail" gets an
  -- answer rather than a shrug.
  fail_reason         text,
  created_at          text NOT NULL DEFAULT now_text(),
  -- Last state change. The booking receipt reads this as the moment the
  -- payment settled, so it must move whenever `status` does.
  updated_at          text NOT NULL DEFAULT now_text()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_idx ON payments (reference);
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_idx
  ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_reservation_idx ON payments (reservation_id, id DESC);

-- Every state a payment has been in, so a disputed charge can be reconstructed
-- rather than inferred from the single mutable status column above.
CREATE TABLE IF NOT EXISTS payment_events (
  id                serial PRIMARY KEY,
  payment_id        integer NOT NULL,
  status            text NOT NULL,
  source            text NOT NULL,
  provider_event_id text,
  detail            text,
  created_at        text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON payment_events (payment_id, id);
-- The provider's own event id, so a redelivered webhook settles once.
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_idx
  ON payment_events (provider_event_id) WHERE provider_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS promo_codes (
  id             serial PRIMARY KEY,
  code           text NOT NULL,
  type           text NOT NULL DEFAULT 'percent',
  value          integer NOT NULL DEFAULT 0,
  description    text NOT NULL DEFAULT '',
  min_spend_fcfa integer NOT NULL DEFAULT 0,
  max_uses       integer,
  uses_count     integer NOT NULL DEFAULT 0,
  expires_at     text,
  is_active      integer NOT NULL DEFAULT 1,
  created_at     text NOT NULL DEFAULT now_text()
);
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_idx ON promo_codes (upper(code));

CREATE TABLE IF NOT EXISTS gift_cards (
  id                   serial PRIMARY KEY,
  code                 text NOT NULL,
  initial_value_fcfa   integer NOT NULL DEFAULT 0,
  remaining_value_fcfa integer NOT NULL DEFAULT 0,
  purchased_by         integer REFERENCES users (id) ON DELETE SET NULL,
  is_active            integer NOT NULL DEFAULT 1,
  created_at           text NOT NULL DEFAULT now_text()
);
CREATE UNIQUE INDEX IF NOT EXISTS gift_cards_code_idx ON gift_cards (upper(code));

-- Append-only movement record for a card's balance.
CREATE TABLE IF NOT EXISTS gift_card_ledger (
  id           serial PRIMARY KEY,
  gift_card_id integer NOT NULL REFERENCES gift_cards (id) ON DELETE CASCADE,
  amount_fcfa  integer NOT NULL,
  ref_type     text NOT NULL DEFAULT '',
  ref_id       text,
  created_at   text NOT NULL DEFAULT now_text()
);
-- One movement per reference. This is what makes a refund idempotent: a repeat
-- of the same reversal cannot credit the card a second time.
CREATE UNIQUE INDEX IF NOT EXISTS gift_card_ledger_ref_idx
  ON gift_card_ledger (gift_card_id, ref_type, ref_id) WHERE ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS points_ledger (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount     integer NOT NULL,
  reason     text NOT NULL DEFAULT '',
  ref_type   text NOT NULL DEFAULT '',
  ref_id     text,
  created_at text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS points_ledger_user_idx ON points_ledger (user_id, id DESC);
-- Same invariant as the gift-card ledger: one movement per reference.
CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_ref_idx
  ON points_ledger (user_id, ref_type, ref_id) WHERE ref_id IS NOT NULL;

-- ── Customer voice ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
  id             serial PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating         integer NOT NULL DEFAULT 5,
  text           text NOT NULL DEFAULT '',
  media_urls     text NOT NULL DEFAULT '[]',
  admin_reply    text,
  admin_reply_at text,
  created_at     text NOT NULL DEFAULT now_text(),
  updated_at     text NOT NULL DEFAULT now_text()
);
-- One review per person, which is what "is_verified_diner" is worth anything for.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_idx ON reviews (user_id);

CREATE TABLE IF NOT EXISTS review_replies (
  id         serial PRIMARY KEY,
  review_id  integer NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text       text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS review_replies_review_idx ON review_replies (review_id, id);

CREATE TABLE IF NOT EXISTS review_votes (
  review_id  integer NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  vote       text NOT NULL,
  created_at text NOT NULL DEFAULT now_text(),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id             serial PRIMARY KEY,
  user_id        integer REFERENCES users (id) ON DELETE SET NULL,
  submitter_name text NOT NULL DEFAULT '',
  caption        text NOT NULL DEFAULT '',
  image_url      text NOT NULL,
  is_featured    integer NOT NULL DEFAULT 0,
  is_approved    integer NOT NULL DEFAULT 0,
  created_at     text NOT NULL DEFAULT now_text()
);

-- ── Front of house ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offers (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  badge       text NOT NULL DEFAULT '',
  icon        text NOT NULL DEFAULT '',
  valid_until text,
  is_active   integer NOT NULL DEFAULT 1,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  text NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS event_bookings (
  id          serial PRIMARY KEY,
  user_id     integer REFERENCES users (id) ON DELETE SET NULL,
  name        text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  event_type  text NOT NULL DEFAULT 'other',
  date        text NOT NULL DEFAULT '',
  time        text NOT NULL DEFAULT '',
  guest_count integer NOT NULL DEFAULT 0,
  note        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'pending',
  created_at  text NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id          serial PRIMARY KEY,
  name        text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  party_size  integer NOT NULL DEFAULT 1,
  note        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'waiting',
  joined_at   text NOT NULL DEFAULT now_text(),
  notified_at text,
  seated_at   text
);
CREATE INDEX IF NOT EXISTS waitlist_entries_status_idx ON waitlist_entries (status, joined_at);

-- ── Support ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_threads (
  id                serial PRIMARY KEY,
  user_id           integer REFERENCES users (id) ON DELETE SET NULL,
  -- Lets a signed-out visitor come back to their own conversation.
  guest_token       text,
  display_name      text NOT NULL DEFAULT '',
  subject           text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'open',
  assigned_admin_id integer REFERENCES users (id) ON DELETE SET NULL,
  assigned_at       text,
  unread_for_user   integer NOT NULL DEFAULT 0,
  unread_for_admin  integer NOT NULL DEFAULT 0,
  last_message_at   text NOT NULL DEFAULT now_text(),
  created_at        text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS support_threads_status_idx ON support_threads (status, last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS support_threads_guest_token_idx
  ON support_threads (guest_token) WHERE guest_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_messages (
  id          serial PRIMARY KEY,
  thread_id   integer NOT NULL REFERENCES support_threads (id) ON DELETE CASCADE,
  sender      text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '',
  kind        text NOT NULL DEFAULT 'chat',
  created_at  text NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON support_messages (thread_id, id);

CREATE TABLE IF NOT EXISTS support_transfers (
  id            serial PRIMARY KEY,
  thread_id     integer NOT NULL REFERENCES support_threads (id) ON DELETE CASCADE,
  from_admin_id integer,
  to_admin_id   integer,
  note          text NOT NULL DEFAULT '',
  created_at    text NOT NULL DEFAULT now_text()
);

-- ── Outbound messages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id             serial PRIMARY KEY,
  channel        text NOT NULL,
  recipient      text NOT NULL,
  template       text NOT NULL,
  body           text NOT NULL,
  status         text NOT NULL DEFAULT 'queued',
  provider_ref   text,
  error          text,
  user_id        integer,
  reservation_id integer,
  created_at     text NOT NULL DEFAULT now_text(),
  sent_at        text
);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at DESC);

-- ── Owner-controlled content ────────────────────────────────────────────────

-- Key/value, because the owner's site configuration is one JSON payload plus a
-- handful of scalars and does not deserve a column per setting.
CREATE TABLE IF NOT EXISTS site_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS legal_pages (
  slug       text PRIMARY KEY,
  title      text NOT NULL DEFAULT '',
  title_fr   text,
  body       text NOT NULL DEFAULT '',
  body_fr    text,
  updated_at text NOT NULL DEFAULT now_text()
);
