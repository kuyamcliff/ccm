# Tasks

## Done (2026-07-31, v3 frontend rebuild)
- [x] Deleted frontend/ entirely and scaffolded a new Vite + React 19 + TS app
- [x] New design language, Charcoal and Ember, in `styles/tokens.css`
- [x] Primitives, a hand-drawn icon set, and a resilient photo component
- [x] New data layer: `lib/http.ts`, `lib/api/*`, `useResource`, SSE client
- [x] 16 customer screens: home, menu, basket and checkout, booking in three
      steps with the real floor plan, pass, mine, reviews, gallery, events,
      queue, offers, account and security, sign in, join, reset, help, legal
- [x] 20 console screens, including the door scanner, kitchen board, floor
      editor, support desk, insights and the audit log
- [x] Fonts self-hosted; service worker replaced (the old one is superseded)
- [x] Typecheck clean, production build clean, console chunk split out
- [x] Driven in a real browser against a real Postgres: sign in, book, order,
      pay, reply to a review, check a code at the door. No console errors on
      any of the 38 routes, signed out or as the owner.

## Done (2026-08-01)
- [x] Copy rewritten site-wide: no charcoal, no grill, no "collection". The
      site now leads with "the best meat in Buea" and "beef, chicken and more".
- [x] The home page, both navigations and the account prompt are state aware

## Waiting on the owner
- [ ] Real photographs of the food, uploaded in Desk > Menu.
      Everything else on the site is now real; the pictures are the last thing
      standing in for something.
- [ ] Confirm the phone number and hours in Desk > Details.
- [ ] Confirm menu prices in Desk > Menu.
- [ ] The menu data itself still says "From the grill", "Grilled chicken" and
      "Charcoal all the way". That is content in the database, not code, and it
      is edited in Desk > Menu. There is also no beef on the menu yet.

## Known gaps, deliberately left
- `/api/admin/reviews` returns a thinner row than `/api/reviews` (no
  admin_reply, no votes), so the console reads the public list instead. Worth
  tidying in the backend one day; it changes nothing for the user.
- Passkeys can be listed and removed in the account, but not registered: the
  backend has no registration endpoint yet.
- The customer site is English only. The previous version had French strings;
  they were written against screens that no longer exist, so translation should
  start from the new copy when it is wanted.
