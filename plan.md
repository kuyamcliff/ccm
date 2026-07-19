# Cam Chop Meat website plan (v2, full-stack)

## The business (researched 2026-07-19)
Cam Chop Meat is a grilled meat restaurant in Buea, Cameroon, opposite the Survey School
in Clerks Quarters. Known for grilled chicken, pork and goat over charcoal, plus matango
(palm wine). Food from about 2,500 FCFA, drinks from about 1,000 FCFA. Word of mouth
runs through TikTok (@cam.chop.meat). Google Maps has a pin for "Cam chop meat".

## Agreed scope (user, 2026-07-19)
v1 was a static HTML site; user rejected it and the design. v2 requirements:
- Two folders: frontend/ and backend/.
- Stack: TypeScript, Node.js, React. No plain HTML site.
- Users can create accounts and sign in.
- Users can book tables online (reservations), view and cancel them.
- Users can leave reviews (one per user, editable, deletable).
- Completely new design, nothing that reads as default AI output.

## Stack
- backend/: Node.js + Express 5 + TypeScript. SQLite through the node:sqlite module
  built into Node 24 (no native compilation). Passwords hashed with bcryptjs. Sessions
  are JWTs in an httpOnly cookie. Port 4000. All endpoints under /api.
- frontend/: Vite + React 19 + TypeScript + react-router. Dev server on 5173 proxies
  /api to the backend, so no CORS and cookies stay same-origin.

## Design direction (one sentence)
Butcher-paper editorial: warm cream paper with grain, heavy Fraunces serif headlines,
Space Mono receipt details, stamp-red accents, dashed ticket cards, hard offset
shadows; reservations are literal "table tickets".

## API surface
- POST /api/auth/register, /login, /logout; GET /api/auth/me
- GET/POST /api/reservations; DELETE /api/reservations/:id (cancel, own only)
- GET /api/reviews (public); POST /api/reviews (upsert own); DELETE /api/reviews/mine
