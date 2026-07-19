# Tasks

## Done (2026-07-19, v2 rebuild)
- [x] v1 static site built, then rejected by user; removed (in git history)
- [x] Node.js LTS 24 installed (winget)
- [x] backend/: Express 5 + TS + node:sqlite, JWT cookie auth, reservations, reviews
- [x] backend/scripts/smoke.ts: endpoint smoke tests
- [x] frontend/: Vite + React 19 + TS, router, auth context, 8 pages
- [x] Complete redesign: butcher-paper editorial (Fraunces/Archivo/Space Mono)
- [x] Docs rewritten (plan, context, HANDOFF)

## In flight
- [x] npm install both folders, typecheck both (clean), 19/19 smoke tests pass
- [x] Browser end-to-end verified: register, auth gate, book, ticket, review
      post + edit mode, account list, cancel with CANCELLED stamp
- [x] Commit v2

## Waiting on the owner
- [ ] Real phone number (search "+237 000 000 000" in frontend/src)
- [ ] Real opening hours (search "midday till late")
- [ ] Real dish photos, then a photo pass on the design
- [ ] Confirm menu items and prices (frontend/src/data/menu.ts)
- [ ] Production deploy (see HANDOFF.md) + JWT_SECRET env var
- [ ] Later upgrade: admin dashboard for reservations
