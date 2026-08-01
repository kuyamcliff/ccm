# Project context (living file)

## State
v3, 2026-07-31. The frontend was deleted and rebuilt from nothing; the backend
was not touched. v1 (static site) and v2 (butcher-paper React app) are in git
history.

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
- `src/ui/` — the primitives: Button, Field, Sheet, Icon, Bits, Feedback, Photo.
- `src/features/` — one folder per area. `desk/` is the staff console and is
  code-split away from the customer site.
- `src/styles/` — `tokens.css` (the design language), `base.css`, `ui.css`,
  `shell.css`, `pages.css`, and `desk.css` which ships with the console chunk.

## Design
Dark by commitment, not as a mode: warm near-black surfaces, one hot colour,
Anton for display type, Karla for the interface, DM Mono for anything a person
reads aloud (codes, prices, times). Full reasoning is at the top of
`src/styles/tokens.css`.

## Voice
Plain and direct: "the best meat in Buea", "beef, chicken and more", "order a
takeaway meal or book a table". The site does not describe how the food is
cooked. The word is "takeaway", never "collection".

## State awareness
The site shows different things to a visitor and to a customer.

- Signed out: the hero, the pitch, and one prompt explaining what an account is
  for. Tabs are Home, Menu, Book, Takeaway, Sign in.
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
- Location: opposite the Survey School, Clerks Quarters, Buea.
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
