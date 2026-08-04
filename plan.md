# Cam Chop Meat website plan (v3, frontend rebuilt)

## The business (researched 2026-07-19)
Cam Chop Meat is a grilled meat restaurant in Buea, Cameroon, opposite the
Survey School in Clerks Quarters. Known for grilled chicken, pork and goat over
charcoal, plus matango. Food from about 2,500 FCFA, drinks from about 500 FCFA.
Word of mouth runs through TikTok (@cam.chop.meat), so most visitors arrive on a
phone.

## Scope of v3 (user, 2026-07-31)
Delete the frontend and build a new one from nothing: a different design, a
different structure, nothing carried over. Keep every feature and keep speaking
to the same backend, which is untouched.

## Stack
- backend/: unchanged. Express 5 + TypeScript on Postgres (Supabase), 23 routers
  under /api, MTN MoMo for payments, sessions as JWTs in an httpOnly cookie.
- frontend/: Vite + React 19 + TypeScript + react-router. Fonts bundled, no
  runtime CSS framework, no component library, no charting library. The staff
  console is a separate bundle chunk.

## Design direction (one sentence)
Black, white and one red, built for a phone held at arm's length outside the
place at eight in the evening: full bleed photography, type that carries the
hierarchy on its own, red reserved for the thing you are meant to press, and
bookings that behave like a torn pass rather than a form receipt.

Committed to dark rather than offering a light mode: it is the brand, and one
well-made theme beats two half-checked ones.

Redesigned end to end on 2026-08-04. What changed: the palette (warm charcoal
and orange became black and red), the type (Anton, Karla and DM Mono became
Plus Jakarta Sans and Inter, two files instead of four), the chrome, and the
composition of every customer screen. What did not: the data layer, the API
surface, the routes, and the backend.

## What was rebuilt
- A token layer that nothing is allowed to reach past (`styles/tokens.css`).
- Primitives: button, field, sheet, toast, icon set drawn by hand, feedback
  states, resilient photo.
- A new data layer: one fetch core, a typed API grouped by task, a small
  resource hook, an SSE client.
- 16 customer screens and 20 console screens, plus the shared payment dialog.
- Charts drawn in SVG, one series each, with a table alternative for screen
  readers.

## Navigation
Customers: bottom tab bar on phones (Home, Menu, Order, Book or Mine, Find us
or You, depending on whether they are signed in), top bar from 60rem. Staff: a rail that collapses to a drawer, grouped by Tonight, The place,
Money, People, Settings.

## API surface used
Everything the backend serves. See `frontend/src/lib/api/` — one file per area,
each function named after what a person is doing rather than after its route.
