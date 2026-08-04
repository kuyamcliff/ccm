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
