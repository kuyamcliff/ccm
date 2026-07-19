# Project context (living file)

## State
v2 full-stack rebuild, 2026-07-19. v1 static site removed (lives in git history).

## Backend file map (backend/)
- src/server.ts: Express app, mounts routers, error handler, port 4000.
- src/db.ts: opens data/camchop.db via node:sqlite, creates tables users,
  reservations, reviews.
- src/auth.ts: JWT sign/verify, session cookie options, attachUser + requireAuth
  middleware. JWT_SECRET env var (dev fallback baked in; set a real one in prod).
- src/routes/auth.ts: register, login, logout, me. bcryptjs hashing.
- src/routes/reservations.ts: list mine, create (validates date/time slot/party
  size/phone, blocks double booking of the same slot), cancel (soft, status field).
- src/routes/reviews.ts: public list, upsert own (one per user), delete own.
- scripts/smoke.ts: API smoke tests, run with npm run smoke while dev server is up.

## Frontend file map (frontend/)
- src/main.tsx: root, BrowserRouter + AuthProvider.
- src/App.tsx: routes + ticker/header/footer shell.
- src/api.ts: typed fetch wrapper for every endpoint.
- src/auth.tsx: AuthContext, restores session from /api/auth/me on load.
- src/data/menu.ts: menu content and marquee items. Edit menu prices here.
- src/components/: Header (nav + auth-aware), Footer, Stars.
- src/pages/: Home, MenuPage, Reserve (booking form -> ticket confirmation),
  Reviews (list + leave/edit/delete own), Login, Register, Account (my tables,
  cancel), NotFound.
- src/styles.css: the entire design. Tokens at :root. Butcher-paper look:
  Fraunces + Archivo + Space Mono, paper/ink/red/mustard palette.
- vite.config.ts: proxies /api to http://localhost:4000 in dev.

## Placeholders still in the code (search for "PLACEHOLDER" or the values)
- Phone number +237 000 000 000 (Footer.tsx, Reserve.tsx).
- Opening hours "midday till late" (Footer.tsx, ticker in App.tsx).
- No real photos yet; design is typographic by choice until the owner sends photos.

## Real, sourced details
- Location: opposite the Survey School, Clerks Quarters, Buea.
- TikTok: https://www.tiktok.com/@cam.chop.meat
- Price anchors: food from 2,500 FCFA, drinks from 1,000 FCFA.

## How to run
- backend: cd backend && npm install && npm run dev (port 4000)
- frontend: cd frontend && npm install && npm run dev (port 5173)
