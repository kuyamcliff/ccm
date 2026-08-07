# Project context (living file)

## State
v4, 2026-08-04. The frontend was redesigned end to end: a new design language,
new type, new chrome and rewritten customer screens, plus two new pages (Our
story, Find us). The data layer, the routes and the backend were untouched, so
every feature v3 had, v4 still has. v1 (static site), v2 (butcher paper) and v3
(Charcoal and Ember) are in git history.

## Backend file map (backend/)
Unchanged in this rewrite. Postgres (Supabase) through `pg`, 23 routers under
/api. See `backend/src/server.ts` for the mount list, and MOMO-SETUP.md for the
mobile-money credentials.

## Frontend file map (frontend/)
Vite + React 19 + TypeScript. Path alias `~/` points at `src/`.

- `src/main.tsx` — mounts the app inside the four providers and registers the
  service worker. Fonts are imported here, bundled rather than fetched from a
  font CDN.
- `src/app/` — `App.tsx` (routes, lazy loading), `Shell.tsx` (top bar, tab bar,
  footer), `guards.tsx` (RequireAccount, RequireStaff), `ErrorBoundary.tsx`.
- `src/lib/http.ts` — the only place that talks to the network. Timeouts,
  retries on idempotent reads, `ApiError`.
- `src/lib/api/` — the typed API surface, grouped by what a person is doing:
  `me`, `site`, `booking`, `orders`, `support`, `desk`, `deskSupport`. Types in
  `types.ts` mirror the server's SQL rows.
- `src/lib/useResource.ts` — `useResource` (read), `useAction` (write),
  `usePoll`. Nothing else fetches.
- `src/lib/format.ts` — every date, money and phone conversion in the product.
- `src/state/` — session, toast, venue (the restaurant's own details) and
  basket (takeaway orders, kept in localStorage).
- `src/ui/` — the primitives: Button, Field, Sheet, Icon, Bits, Feedback, Photo,
  and Reveal (the scroll entrance).
- `src/features/` — one folder per area. `story/` and `find/` are the two pages
  added in v4. `booking/` is a four step flow on one route, with the step in
  the URL so the back gesture works; its `FloorPlan.tsx` fits the screen and
  never scrolls sideways. `desk/` is the staff console, code-split away from
  the customer site, and its floor editor keeps a scrolling canvas of its own.
- `src/styles/` — `tokens.css` (the design language), `base.css`, `ui.css`,
  `shell.css`, `pages.css`, and `desk.css` which ships with the console chunk.

## Design
Black, white and one red. Committed to dark rather than offering a light mode:
it is the brand, and one well made theme beats two half checked ones.

- Ground `#0A0A0A`, panels a measured amount of white mixed back in.
- Red `#E31C23`, and it is an instruction. If it is not a button, an active
  state or a price about to be paid, it is not red. That rule is why the menu
  rows use a neutral Add button that only turns red once the dish is in the
  order.
- Plus Jakarta Sans for headings, Inter for the interface and every figure in
  it, with tabular numerals doing the job a second mono face used to. Both are
  variable, self hosted and subset by unicode range.
- Space and hairlines before borders, borders before boxes. Menu rows, basket
  lines, reviews and the "three ways in" are rows on the page, not cards
  floating on it. A card is kept for something you can pick up and carry: a
  booking pass, an order receipt.
- Motion is transform and opacity only, so it stays on the compositor on a mid
  range Android. Sections arrive on scroll through `ui/Reveal.tsx`, one
  observer per element, disconnected as soon as it fires. Everything collapses
  under `prefers-reduced-motion`.

Full reasoning is at the top of `src/styles/tokens.css`.

## Voice
Plain and direct: "off the fire, every day", "chicken, goat and pork grilled
fresh", "order for takeaway or book your table". The word is "takeaway", never
"collection". The payment button says "Pay Now" and nothing else.

No em dashes or en dashes anywhere a customer can read. `stampLabel` returns
"Not yet" rather than a dash, and the console's empty table cells say what is
missing instead of drawing one.

## State awareness
The site shows different things to a visitor and to a customer.

- Signed out: the hero, the pitch, and one prompt explaining what an account is
  for. Tabs are Home, Menu, Order, Book, Find us.
- Signed in: `features/home/YourStuff.tsx` replaces the hero with their next
  table and their live order, and the account prompt disappears. Tabs are Home,
  Menu, Book, Mine, You.
- Staff additionally get a Desk button in the top bar.

The switch is `useSession()`. Anything gated by it must wait for `ready`, or it
flashes the wrong state at somebody.

Navigation is a bottom tab bar on phones and a top bar from 60rem up. The staff
console has its own chrome: a rail that becomes a drawer, denser type, tables.

## Passkeys
Real WebAuthn, `backend/src/lib/passkeys.ts` and `frontend/src/lib/passkey.ts`.
Discoverable credentials, so the sign-in screen offers the key without an email
being typed first. The relying party ID comes from `FRONTEND_URL` and must be
the domain in the URL bar: a credential is bound to it permanently.

## Passwords
`backend/src/lib/passwordStrength.ts` is the authority on what may be chosen,
and all three places a password gets set go through it: register, Account >
Password, and the reset redeem. Length, a guessed-first blocklist (including
the ones this restaurant invites: camchop, cameroon, buea), keyboard runs,
repeated blocks, and anything built out of the account's own name or email.
Long passphrases pass untouched; only short ones have to mix character types.

`frontend/src/lib/passwordStrength.ts` is a byte-for-byte copy below the header
comment, so the meter in `ui/PasswordField.tsx` says exactly what the server
would say. `cd backend && npm run check:rules` fails if the two drift. Change
one, change both.

Everything else the login endpoint needs was already here and stays: the
session is an httpOnly cookie and never touches localStorage, `/login` is rate
limited per IP and per email with `/register`, `/login/2fa` and both reset
steps limited too, TOTP is real, and every staff capability is enforced by
`requireAdmin` / `requireScope` on the server. What the console hides is
convenience, never the check.

## Payments
Two wallets behind one shape. `lib/wallets.ts` is the interface, `lib/momo.ts`
and `lib/orange.ts` the implementations, and a wallet with no credentials is
never offered rather than failing when tapped (`GET /api/payments/wallets`).
Orange is written from the documented Web Payment API and has not been run
against a live merchant account, so treat its first real transaction as a test.

Three rules hold the money side together:

**The reference is ours, and it is written before the wallet is called.** It
doubles as the wallet's idempotency key (MTN's `X-Reference-Id`, Orange's
`order_id`), so a retry cannot charge twice — which only works because the
value survives the retry. It used to be minted inside `requestToPay` per
attempt, which made every retry a new charge. A row written before the call
means the worst case is an `initiated` row that went nowhere, not a debit with
nothing to reconcile against.

**`Idempotency-Key` is required on `POST /api/payments/initiate`.** The browser
mints it per attempt (`MomoDialog` holds it in a ref) and resends it on every
retry; a key already seen returns the original payment with `replayed: true`
instead of charging again. The unique index settles the race between two
in-flight retries.

**`payment_events` is append-only.** `payments.status` is now a cache of the
last row there. Nothing updates or deletes an event; a correction is another
row. `provider_event_id` is unique, which is what makes a webhook redelivery a
no-op.

`POST /api/payments/webhook/:provider` sits above `requireAuth` because the
caller is the wallet, not a guest. It is the only route where an anonymous
request can mark a booking paid, so it verifies an HMAC over the raw bytes
(hence `express.json`'s `verify` hook) in constant time, and refuses everything
it cannot prove. With no webhook secret set it refuses every delivery and
settlement falls back to polling, which is the safe direction to fail in.

## Closing an account
`lib/closeAccount.ts`, used by both the guest's own delete and the console's.
It settles before it forgets: any payment still `pending` or `initiated` is
failed first (which also hands back the promo use and gift card value it was
holding), held tables are cancelled, then the row is emptied rather than
deleted.

It is not a hard delete because it cannot be. `reservations.user_id` cascades
from `users`, but `payments.reservation_id` does not cascade from
`reservations`, so `DELETE FROM users` raised a foreign key violation for any
guest who had ever paid — both delete routes returned a 500 for exactly the
customers most likely to use them. For guests who had never paid it succeeded
and took their bookings, reviews and points with it.

What survives is the restaurant's: reservations and payments. What goes is
theirs: name, email, password, passkeys, reviews, votes, replies. The address
moves to `deleted-<id>@deleted.invalid`, which keeps the unique index happy,
cannot collide with a real address, and frees the original if they come back.
`deleted_at` is what `loadUser` checks, so a closed account reads as no account
at all rather than as a sign-in to refuse.

## Security posture, and what was checked
Audited against the usual vibecoded-app checklist. Most of it was already
covered, so this records what was verified rather than implying it was added:

- **XSS**: no `dangerouslySetInnerHTML` or `innerHTML` anywhere, so React's
  escaping is never bypassed. SVG is deliberately absent from the upload
  allowlist, since an SVG served from our own origin is a script.
- **SQL injection**: every value is bound. Two places interpolate identifiers
  (`applyUpdate`, gallery's PATCH) and both take column names from fixed sets
  in our code, never from a request body.
- **Uploads**: mime allowlist, magic-byte sniff so a renamed file cannot pose
  as an image, per-type size caps, content-addressed names with the extension
  taken from the allowlist rather than the upload. Served with `nosniff` and
  `dotfiles: deny`.
- **Secrets**: nothing under `VITE_`. The browser holds no key of any kind.
- **CSRF**: SameSite=Lax plus an Origin check on every unsafe method.
- **Transport**: HSTS with preload in production, `upgrade-insecure-requests`,
  and a CSP with `script-src 'self'`, `object-src 'none'`, `frame-ancestors
  'none'`.
- **Sessions**: httpOnly cookie, 30-day expiry, and `session_version` so a
  password change or "sign out everywhere" kills tokens already issued.

Two things are knowingly not done. There is no CAPTCHA on signup — the
registration rate limit (5 per hour per address) stands in for one, and adding
a real one means a third-party key. And `npm audit` reports a high-severity
React Router advisory (GHSA-qwww-vcr4-c8h2): it applies to RSC mode, this app
mounts a plain `BrowserRouter` with no server actions, and no patched version
exists yet — 8.3.0 is not published. Recheck when it is; downgrading below
7.12.0 to silence the tool would trade six minor versions of real fixes for a
vulnerability the app cannot reach.

## Placeholders still in the code
None. Every fact on the site (phone, address, hours, socials) comes from
site_settings and is edited in the console under Details.

## Real, sourced details
- Location: Razel Street, opposite the P and T school, Buea. The address the
  site actually shows comes from site_settings and is edited in Desk > Details;
  what is in the code is the fallback and the prose around it.
- TikTok: https://www.tiktok.com/@cam.chop.meat
- Price anchors: food from 2,500 FCFA, drinks from 500 FCFA.
- Table deposit: 2,500 FCFA. Late cancellation fee: 1,500 FCFA. Both are set by
  the server (`backend/src/routes/payments.ts`, `reservations.ts`).

## How to run
- backend: `cd backend && npm install && npm run dev` (port 4000, needs
  DATABASE_URL)
- frontend: `cd frontend && npm install && npm run dev` (port 5173, proxies
  /api and /uploads to the backend)
- Point the dev server at a different API with `VITE_API_TARGET`.
- Open http://localhost:5173. Use `localhost`, not `127.0.0.1`: the server
  rejects state-changing requests from an origin it does not recognise.
