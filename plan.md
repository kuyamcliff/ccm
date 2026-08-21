# Cam Chop Meat website plan (v5, frontend rebuilt again)

## The business (researched 2026-07-19)
Cam Chop Meat is a grilled meat restaurant in Buea, Cameroon, opposite the
Survey School in Clerks Quarters. Known for grilled chicken, pork and goat over
charcoal, plus matango. Food from about 2,500 FCFA, drinks from about 500 FCFA.
Word of mouth runs through TikTok (@cam.chop.meat), so most visitors arrive on a
phone, usually a mid-range Android on a mobile connection.

## Scope of v5 (user, 2026-08-21)
Delete the frontend and build a new one from nothing again, and this time every
page: customer, admin, super admin, owner, and a developer tier that did not
exist. Keep every feature, keep the black-white-red theme, and fix the five
things that were wrong with v4:

1. The first load waited on pictures.
2. The transitions were not smooth.
3. Buttons gave no sign of being touched, and nothing showed it was working.
4. Everything sat in a box.
5. The writing, including error messages, sounded like a machine.

Mobile first and small throughout, because that is the device this is used on.

### Decided with the user
- **Images and CDN**: deferred. Frontend-only for now (see below).
- **The developer role**: build a real one, backend and frontend.
- **New features**: sold out tonight, cash on collection, and reminders.
  **Not delivery**, which was declined.
- **The launch gate**: keep it. The site stays behind `/admin`.

## Stack
- backend/: Express 5 + TypeScript on Postgres (Supabase), 28 routers under
  /api, MTN MoMo and Orange Money, sessions as JWTs in an httpOnly cookie.
- frontend/: Vite + React 19 + TypeScript + react-router 7. Fonts bundled, no
  CSS framework, no component library, no charting library, no animation
  library. The staff console is a separate bundle chunk.

## Design direction (one sentence)
Black, white and one red, built for a phone held at arm's length outside the
place at eight in the evening: full bleed photography, rows on a page rather
than cards floating on it, red reserved for the thing you are meant to press,
and every control answering the finger that lands on it.

## What was rebuilt in v5
- The boot sequence. `GET /api/bootstrap`, a localStorage boot cache read
  before React renders, a hero preload emitted from `index.html`, and the
  removal of the gate that blanked the app while the session settled.
- The data layer. `lib/store.ts` replaces `lib/useResource.ts`:
  stale-while-revalidate, request de-duplication, persistence, prefetch on
  intent, and a `pending` that the button component requires rather than
  accepts.
- The token layer, the layout language (`.rows` / `.stack` / `.carry`, and no
  `.card` at all), and every stylesheet.
- The primitives, with `press.ts` and `Img.tsx` as the two that matter most.
- All customer screens, all 23 console screens, and 5 developer screens.
- Every line of customer-facing copy, in `src/copy/`, English and French held
  in step by a test, plus `lib/say.ts` so no server string reaches a customer.

## What was carried forward, deliberately
`lib/http.ts`, `lib/api/*`, `lib/format.ts`, `lib/passwordStrength.ts`,
`lib/loyalty.ts`, `siteConfig.ts`, `passkey.ts`, `sse.ts`, `imageFile.ts` and
`search.ts`. These are the network contract and tested arithmetic, not the
design. Re-deriving them from scratch would reintroduce bugs this repo has
already found and written down: that only GET may be retried, that an
`Idempotency-Key` must survive a retry unchanged or MTN charges twice, that
`parseStamp` expects the database's exact text format, and that the password
rules are a byte-for-byte copy of the server's.

## Navigation
Customers: bottom tab bar on phones, top bar from 60rem. Staff: a rail that
collapses to a drawer, grouped by Tonight, The place, Money, People, Settings,
with a Developer group that only appears for that role. The footer is one line
of short links and a rule, not columns.

## API surface used
Everything the backend serves. See `frontend/src/lib/api/` — one file per area,
each function named after what a person is doing rather than after its route.

## Deliberately not done
- **Delivery.** Declined by the user. It changes operations, not just software.
- **The image pipeline.** Deferred by the user, and worth writing down so it is
  not lost: uploads are stored at full size on the server's disk, with no
  derivatives, no WebP or AVIF, and no CDN in front. v5 makes that as smooth as
  it can be made — the download starts inside 350ms, nothing fades in before it
  has decoded, and a repeat visit is served by the service worker — but a 4MB
  hero over a Buea mobile connection is still a 4MB hero. The fix is `sharp`
  derivatives at three widths on upload plus Supabase Storage, which they
  already pay for and which serves from a CDN with automatic WebP.
- **A CSS framework or component library.** Every one of them adds bytes to a
  bundle whose whole problem is weight on a slow connection, and none would
  make the press feedback or the decode-driven crossfade any better.
- **A light theme.** Black is the brand, not a mode.
