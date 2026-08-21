# Project context (living file)

## State
v5, 2026-08-21. The whole frontend was rebuilt from nothing: every customer
screen, all 23 console screens, and a new developer tier. Unlike v4, this one
went below the paint. The boot sequence, the data layer, the motion system and
the copy were all replaced, and the backend gained four things the frontend
needed (`/api/bootstrap`, `/api/dev/*`, `/api/cron/reminders`, and a real
`developer` role) plus three features the restaurant was missing: sold out
tonight, cash on collection, and reminders. v1 (static site), v2 (butcher
paper), v3 (Charcoal and Ember) and v4 are in git history.

What v5 was for, in the owner's words: the first load waited on pictures, the
transitions were not smooth, buttons showed no sign of being touched,
everything sat in a box, and the writing sounded like a machine. Each of those
had a cause in the code, and each cause is named below.

## Backend file map (backend/)
Postgres (Supabase) through `pg`, 28 routers under /api. See
`backend/src/server.ts` for the mount list, and MOMO-SETUP.md for the
mobile-money credentials. New in v5:

- `src/routes/bootstrap.ts` — session, site settings, highlights and one review
  in a single response. See "The boot sequence" below for why it exists.
- `src/routes/dev.ts` — the developer tier: health, held errors, feature flags,
  table counts, impersonation. Every route behind `requireDeveloper`.
- `src/routes/cron.ts` — `POST /api/cron/reminders`, behind a shared secret
  compared in constant time. A platform cron job rather than an in-process
  `setInterval`, which dies with the dyno and doubles up across instances.
- `src/lib/errorLog.ts` — a 200-entry in-memory ring of recent 500s, keyed by
  the same `reference` the customer is shown. No bodies, headers, cookies or
  query strings are kept, so the buffer cannot become a place secrets collect.
- `src/lib/soldOut.ts` (pure) and `src/lib/menuSweep.ts` (touches the database).
  Split the same way `lib/loyalty.ts` and `routes/loyalty.ts` are, so the
  opening-time arithmetic can be tested without a Postgres.
- `src/lib/bootstrapDeveloper.ts` — promotes `DEVELOPER_EMAIL` at boot. It
  never demotes, so removing the variable cannot lock the tier away mid-flight.

## Frontend file map (frontend/)
Vite + React 19 + TypeScript. Path alias `~/` points at `src/`.

- `src/main.tsx` — mounts the app and registers the service worker. Fonts are
  imported here, bundled rather than fetched from a font CDN.
- `src/app/` — `App.tsx` (routes, lazy loading), `Boot.tsx` (the synchronous
  first paint), `Shell.tsx` (top bar, tab bar, footer), `guards.tsx`,
  `ErrorBoundary.tsx`, `routeMeta.ts` + `RouteMeta.tsx`.
- `src/lib/http.ts` — the only place that talks to the network. Timeouts,
  retries on idempotent reads, `ApiError`.
- `src/lib/api/` — the typed API surface, grouped by what a person is doing.
  Types in `types.ts` mirror the server's SQL rows.
- `src/lib/store.ts` — `useQuery`, `useMutation`, `usePoll`, `prefetch`,
  `seed`, `invalidate`. Nothing else fetches. Replaced `useResource.ts`.
- `src/lib/keys.ts` — every cache key in one file, so two screens cannot
  disagree about what a thing is called.
- `src/lib/boot.ts` — the localStorage boot cache and the hero preload.
- `src/lib/say.ts` — turns an `ApiError` into a sentence a person wrote.
- `src/lib/format.ts` — every date, money and phone conversion in the product.
- `src/copy/` — all customer-facing wording, English and French side by side,
  with a test that holds the two in step.
- `src/state/` — session, toast, venue, locale and basket.
- `src/ui/` — the primitives: `press.ts`, `Button`, `Field`, `Sheet`, `Img`,
  `HeroFrames`, `Icon`, `Bits`, `Feedback`, `Reveal`, `motion.ts`.
- `src/features/` — one folder per area. `desk/` is the staff console, code
  split away from the customer site, with `parts.tsx` holding its shared
  furniture and `desk/dev/` the developer screens.
- `src/styles/` — `tokens.css` (the design language), `base.css`, `ui.css`,
  `shell.css`, `pages.css`, and `desk.css` which ships with the console chunk.

## The boot sequence
The complaint was "I have to wait for all the pictures to load". The cause was
four sequential round trips before the first image byte was even requested:
HTML, then the JS chunks, then `/api/auth/me` and `/api/site-settings`, then a
gate that refused to render anything until those settled, then `/api/popular`
— and only then did an image URL exist. Nothing started an image download in
the first three seconds of a visit.

Four changes, in the order they matter:

1. **`GET /api/bootstrap`** returns session, settings and highlights together.
   Three round trips become one.
2. **The boot cache.** `lib/boot.ts` writes that payload to localStorage under
   a schema-versioned key (`ccm.boot.v5`, 12-hour life) and reads it
   synchronously before React renders. A repeat visitor gets a painted page
   with real content on frame one; fresh data swaps in behind them.
3. **The hero preload.** An inline script in `index.html` emits
   `<link rel="preload" as="image" fetchpriority="high">` for the cached hero
   URL before the bundle has parsed.
4. **The blocking gate is gone.** The shell paints immediately; only a route
   body that genuinely depends on role waits.

Measured cold on a throttled Pixel 7 profile with no cache at all: first
contentful paint 612ms, first image requested at 349ms.

`/api/bootstrap` is deliberately **not** in the service worker's
stale-while-revalidate list, though the other public reads are. Its body
carries `user`, and a cache the app cannot reach into would outlive a sign-out
and show the previous person's name to the next one. The app caches that
payload itself, in localStorage, where `clearBoot()` can wipe it.

It is also in `ALWAYS_OPEN` in `lib/maintenance.ts`. Gating it would mean a
closed site answering 503 to the one request that could explain the 503,
leaving the visitor on a blank screen.

## Design
Black, white and one red. Committed to dark rather than offering a light mode:
it is the brand, and one well made theme beats two half checked ones.

Four rules, stated at the top of `styles/tokens.css` and enforced by what the
stylesheets do and do not contain:

- **Red is an instruction.** If it is not a button, an active state or a price
  about to be paid, it is not red. That rule is why a menu row uses a neutral
  Add that only turns red once the dish is in the order.
- **Boxes are earned.** `base.css` has no `.card`, and says so. The layout
  language is `.rows` (lines separated by inset hairlines), `.stack` and
  `.carry`, which is the only raised surface in the product and is reserved for
  something you carry: a booking pass, an order receipt, the payment sheet.
- **Small.** The type ramp was cut again in v5 — hero
  `clamp(1.875rem, 7.2vw, 3rem)`, down from 2.125 to 4rem — and the section
  gaps with it. Body stays at 16px and will not go lower: below that, iOS zooms
  the page on input focus and the layout never recovers.
- **Transform and opacity only**, so a four-year-old Android holds 60fps.

Plus Jakarta Sans for headings, Inter for the interface and every figure in it,
with tabular numerals. Both variable, self hosted, subset by unicode range.

## Motion and touch
The two complaints here were that transitions were not smooth and that buttons
gave nothing back. Both were true.

- **Press.** `ui/press.ts` is one hook used by every interactive element in the
  product, including the ones that are links and the ones that are page-local
  `<button>`s. It fires on `pointerdown`, not on click: `scale(0.97)` for 90ms
  minimum so a fast tap still registers visibly, released on
  `pointerup`/`pointercancel`/`pointerleave`, with `navigator.vibrate` where
  the device offers it. The release curve is a sampled `linear()` spring that
  overshoots about 4%.
- **Pending.** `Action`'s `pending` prop is **required**, not optional. A
  button that fires a promise cannot be written without a pending state,
  because it would not compile. The label swaps to a verb ("Signing you in",
  "Holding your table") with a spinner, and both labels live in the same CSS
  grid cell so the width cannot jump — measured at 362.9375 to 362.9408px
  across the swap. A second press while pending makes no second request.
- **Images.** `ui/Img.tsx` awaits `img.decode()` before revealing, inside a
  fixed aspect-ratio box so nothing shifts. `ui/HeroFrames.tsx` warms the next
  frame one at a time and only lets it join the rotation once it has decoded,
  which is the actual fix for "the transitions are not smooth": the old
  crossfade was a fixed 21s CSS loop fading into images that had not arrived.
- **Between screens.** Same-document View Transitions through React Router's
  `viewTransition` prop, with named transitions so a dish thumbnail morphs into
  its sheet. Browsers without support simply navigate.
- Everything collapses under `prefers-reduced-motion`.

## Voice
All customer-facing wording lives in `src/copy/index.ts`, English written first
and French carried beside it. Before v5 it was split between a 50-key module
and inline `locale === "fr" ? … : …` ternaries buried in JSX, which is how the
French drifted. `copy.test.ts` holds the two in step: every key present in
both, placeholders matching, nothing blank, and no em or en dashes anywhere.

`EN` is deliberately not `as const`. Literal types would make every French
string a type error against its English sibling.

The tagline is **"The best meat in Buea."** The register is plain Cameroonian
English: "Off the fire, every day", not restaurant-brochure prose. The word is
"takeaway", never "collection". Success lines say what happened to you, not
what happened to a row: "Table held. See you Friday at 7."

**Nothing echoes the server.** `lib/say.ts` maps an `ApiError` to a sentence by
status and intent, and the raw string never reaches a customer — the old
`customerSafeError` passed anything through that missed a blocklist regex, so
`Request failed (500).` was reaching people. Three responses are read directly
instead, and only three, because each carries data the screen must show: the
409 booking clash with its alternatives, the 402 late cancellation with its
fee, and the 503 that means the site is closed.

## The developer tier
`developer` is a real role, ranked above owner because it exists to look at the
machinery the owner's business runs on rather than at the business. It is in
`UserRole`, in `STAFF_ROLES`, and in `canAccessScope`. Five screens under
`/desk/dev`: system health, held errors by reference, feature flags as raw
JSON, table counts, and impersonation.

Impersonation is the sharp one, so it is fenced four ways: only a developer may
call it, it refuses any target who is not a plain guest, it writes the audit
entry **before** it issues the cookie, and what it issues is an ordinary
session that "sign out everywhere" revokes like any other.

## Sold out, cash, and reminders
- **Sold out tonight.** `menu_items.sold_out` already existed and takeaway
  already refused a sold-out dish; what was missing was that nobody remembered
  to switch it back on. `sold_out_until` is stamped when the toggle is thrown,
  and a lazy sweep at the top of both menu reads clears anything past the next
  opening. `lib/soldOut.ts` computes that in explicit UTC against a WAT+1
  offset rather than trusting the server's clock zone.
- **Cash on collection.** An order path that skips the wallet: the order is
  created `pending` with `payment_required: false` and a `cash_due_fcfa`, and
  the kitchen board gets an idempotent "Mark paid" that is audited. No card UI,
  ever: CI fails the build if a card term appears in either `src` tree.
- **Reminders.** `lib/notify.ts` was a finished WhatsApp/SMS sender that only
  three messages ever used, and there was no scheduler anywhere.
  `POST /api/cron/reminders` sends the 24h and 3h booking reminders and the
  order-ready message through it, deduplicating off the `notifications` table
  rather than adding a column. Each reminder carries a one-tap cancel link,
  because a cancelled table can be resold and a no-show cannot.

## State awareness
The site shows different things to a visitor and to a customer.

- Signed out: the hero, what people order, and one line explaining what an
  account is for. Tabs are Home, Menu, Order (or Book), Find us.
- Signed in: `features/home/YourStuff.tsx` replaces the hero with their next
  table and their live order. Tabs are Home, Menu, Order (or Book), Mine, You.
- Staff additionally get a Desk button in the top bar. A developer gets the
  Developer group inside the console rail, and nobody else sees it exists.

The switch is `useSession()`, and the tab list is also filtered by
`siteConfig.features`, so a service the owner has switched off does not leave a
tab pointing at a page that refuses.

In v4 anything gated by the session had to wait for `ready` or it flashed the
wrong state. v5 mostly removes the wait rather than the rule: the boot cache
means `user` is usually known on frame one. Where it is not known, the rule
still stands.

Navigation is a bottom tab bar on phones and a top bar from 60rem up, never
both: a phone showing a top nav and a tab bar spends a fifth of a small screen
on navigation. The staff console has its own chrome: a rail that becomes a
drawer, denser type, tables that scroll inside themselves.

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
comment, so the meter in `ui/Field.tsx` says exactly what the server
would say. `cd backend && npm run check:rules` fails if the two drift. Change
one, change both.

Everything else the login endpoint needs was already here and stays: the
session is an httpOnly cookie and never touches localStorage, `/login` is rate
limited per IP and per email with `/register`, `/login/2fa` and both reset
steps limited too, TOTP is real, and every staff capability is enforced by
`requireAdmin` / `requireScope` on the server. What the console hides is
convenience, never the check.

## Points
A guest earns one point per 100 FCFA they pay, and can put them against a
booking deposit or a takeaway order. Before 2026-08-09 they could only be
earned: `awardPoints` had one caller, an admin marking a reservation complete,
and no checkout could spend them, so the balance on the account page was a
promise nothing else in the product kept.

`lib/loyalty.ts` holds the arithmetic and touches no database, which is what
lets `npm run check:loyalty` assert it without one. `routes/loyalty.ts` holds
everything that does: the rules, the spend, the refund and the award.

Three numbers, all in `site_settings` and all editable in Desk > Details, so
changing what the scheme costs is not a deploy: what a point is worth (5 FCFA),
how many are needed before any can be spent (100), and the most of one bill
they may cover (50%). The last is the one that protects a busy night — however
many somebody has saved, half of every bill still arrives as money.

Points are spent the way a gift card is spent, deliberately: deducted with a
conditional UPDATE inside a transaction so two open checkouts cannot spend the
same balance, recorded on the payment or the order in `points_spent`, and given
back when the payment fails, expires, is abandoned or the order is cancelled.
The browser previews the discount with `frontend/src/lib/loyalty.ts`, which
mirrors the server's sum, but the server quotes again against the balance it
can see and what it deducts is what comes off.

Earning is at different moments on the two paths, and the difference is
intentional. A takeaway earns when the money lands, because a paid order is a
sale. A booking still earns when an admin marks it complete, because a deposit
is a held table and not yet a meal, and a no-show should not be rewarded.

The order of discounts is promo, then points, then gift card. Value on a card
was paid for by somebody; points were not, so the card is drawn down last and
only for what is still owed.

While this was being written, `discount_fcfa` was being handed back to the gift
card in full by both refund paths, which credited a card with the promo code's
value too. It only escaped notice because `refundGiftCard` caps a credit at the
card's own headroom. Points made a third component of that total, so
`gift_fcfa` now records what the card itself covered and the refunds use it.

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

## What search engines and share cards see
Split deliberately, because the two audiences read different things.

**Static, in `index.html`**: the sharing card (`og:image`, 1200x630, plus
`summary_large_image`) and the `Restaurant` JSON-LD. The crawlers behind
WhatsApp, TikTok and Facebook do not run JavaScript, and this site is found
through TikTok and passed around as a link — setting the card from React would
be setting it long after the only reader that mattered had gone. Regenerate the
card from `scratchpad/og.html` if the wording changes; the address and hours in
the JSON-LD mirror `state/venue.tsx` and Desk > Details, so change them
together.

**Runtime, in `app/routeMeta.ts`**: title, description and canonical per route,
applied by `<RouteMeta />` mounted once inside the router. Google renders
JavaScript, so this is soon enough for it. A table rather than a hook each page
calls, because the failure mode of the per-page version is a page that forgets
and nobody notices for months. Private routes get `noindex` and no canonical at
all — every page used to carry a canonical pointing at `/`, which told Google
the menu was a duplicate of the homepage.

There is no phone number in the JSON-LD. Nothing in this codebase hardcodes
one, on purpose, and inventing one for a real business is worse than omitting
it. Add it there once it is settled.

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

Three things v5 added that are worth naming, because each one is a new way in:

- **`/api/bootstrap`** returns the session, so it is the one public-shaped
  route with a personal body. It is kept out of the service worker cache for
  exactly that reason; see "The boot sequence".
- **`/api/dev/*`** is `requireDeveloper` on every route, and `/api/dev/errors`
  holds no request bodies, headers, cookies or query strings, so the buffer
  cannot become a place secrets accumulate. Impersonation refuses any target
  who is not a plain guest, audits before it issues the cookie, and issues an
  ordinary revocable session.
- **`/api/cron/reminders`** has no session at all, so the secret is the whole
  door. It is compared in constant time, a length mismatch returns false
  instead of throwing, and an unset `CRON_SECRET` refuses every request rather
  than accepting an empty one.

Two things are knowingly not done. There is no CAPTCHA on signup — the
registration rate limit stands in for one, and adding a real one means a
third-party key and a third-party script on a page whose whole problem is
weight on a slow connection. The ceiling is 5 per hour per address in
production and 100 outside it, because `scripts/smoke.ts` makes six
registration attempts by design and a limit that makes the test suite
unrunnable is a limit nobody runs the test suite against. The relaxation is
keyed on `IS_PROD` and cannot follow the code to production. And `npm audit` reports a high-severity
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
