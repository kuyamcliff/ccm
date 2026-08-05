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

## Done (2026-08-04, v4 frontend redesign)
- [x] New design language in `styles/tokens.css`: black ground, one red, Plus
      Jakarta Sans and Inter. Two font files where there were four.
- [x] `base.css`, `ui.css`, `shell.css` and `pages.css` rewritten against it;
      `desk.css` retuned to the same palette so the console did not drift.
- [x] Chrome rebuilt: transparent top bar over the hero, five tab bottom bar,
      hairline footer. Route changes fade; the tab bar marks the active tab.
- [x] Customer screens recomposed as rows on the page rather than grids of
      cards. Menu rows carry the price beside the name and a neutral Add button
      that only turns red once the dish is in the order.
- [x] Checkout: one page, a sticky total, and a payment button that says
      "Pay Now". The MoMo sheet says the same on the button that pushes the
      prompt.
- [x] Two new pages, Our story (`/story`) and Find us (`/find`), with `/about`
      and `/contact` redirecting to them. Find us draws its own map rather than
      loading a tile layer over a Buea connection.
- [x] `ui/Reveal.tsx`: sections arrive on scroll, one observer each,
      disconnected on first hit, disabled under `prefers-reduced-motion`.
- [x] Every em dash and en dash removed from anything a customer can read.
- [x] Typecheck clean, production build clean, console chunk still split out.
- [x] Driven in a real browser at 390px and 1280px: home signed out and signed
      in, menu, add to basket, checkout, the booking wizard through the floor
      plan, waitlist, sign in, story and find. No page errors.

## Done (2026-08-04, booking rebuilt)
- [x] Booking is a screen, not a dialog. Four questions at full width, a
      progress header that is also the way back, and a bar at the bottom
      carrying the running answer and the next action.
- [x] The step lives in the URL (`/book?step=where`), so the phone's back
      gesture walks back through the questions instead of throwing away a
      half-finished booking.
- [x] Step four is a summary and the payment, with ordering ahead folded into
      it as an option. It used to be a menu with a deposit box at the bottom.
- [x] The floor plan fits the screen. It no longer holds a minimum width and
      scrolls sideways, so no table is off the edge, and a list of tables under
      it gives every one a full width row a thumb cannot miss.
- [x] Times are grouped into midday, evening and late, and slots that have
      already gone today are dropped rather than dimmed.
- [x] Fixed at the same time, and it affected every page: the top bar overflowed
      at 320px, which widened the document and pushed every fixed bar on the
      site off the bottom of the screen. The wordmark now stands down to the
      mark alone on the narrowest phones.
- [x] Checked at 320px and 390px, plus the console's own floor editor, which
      keeps its scrolling canvas.

## Done (2026-08-04, sizing pass and the typing bug)
- [x] **Typing in the console is fixed.** Every sheet took `onClose` in its
      focus effect's dependency list, and every caller passes an inline arrow,
      so one keystroke changed its identity, tore the effect down and set it up
      again. The teardown restored focus and the setup moved it to the panel,
      so focus left the field between every letter and the keyboard closed. One
      character per tap, on menu, promo codes, gift cards and the rest. The
      callbacks are held in refs now and the effect depends on `open` alone.
- [x] The whole type and space ramp came down by roughly a fifth. Body copy
      stays at 16px because anything under it makes iOS zoom on focus.
- [x] The booking pass was taking most of a screen to say four things. The code
      is still the largest thing on it, just not on the phone.
- [x] Console panels, stat tiles and page padding tightened with the ramp.
- [x] Takeaway and booking now share one time picker (`ui/SlotPicker`). The
      checkout used to offer a native select of twenty eight times, which a
      phone renders as a wheel you cannot scan and which happily offered a slot
      that had already gone. It also holds the kitchen's half hour of notice.
- [x] The takeaway confirmation lists what was ordered, not just a code. The
      PDF receipt already itemised.
- [x] Address is Razel Street, opposite the P and T school, throughout: the
      fallback, the prose on Home, Our story and Find us, the page description
      and both PDF receipts.
- [x] Home rebuilt so the words sit on solid black under the photograph rather
      than on top of it. No gradient is safe for both a dark night shot and a
      bright flash one, and the owner uploads both.
- [x] Checkout no longer shows two Pay Now buttons on a phone, and the floating
      support button no longer lands on top of a sticky pay bar.
- [x] Swept all 23 customer and console pages at 320px and 390px: nothing
      overflows.

## Done (2026-08-05, passkeys, density and the account page)
- [x] **Passkeys work.** They could be listed and removed but never created:
      there was no registration endpoint and no library. Added the WebAuthn
      ceremonies on both sides. Credentials are discoverable, so signing in
      needs no email first. The challenge is a short-lived signed token rather
      than a server-side row, which is what makes it safe behind a host running
      more than one instance. Driven in a real browser against a real Postgres
      with a virtual authenticator: enrol, sign out, sign back in with the key
      alone, session confirmed.
- [x] The account page no longer overflows. It was a flex row of avatar, name,
      email and a button with nothing allowed to shrink, and an email address
      is one long unbreakable word. Checked at 320, 390 and 430 on all three
      tabs with a fifty character address: clean.
- [x] Overflow safety is now systemic rather than per component: long words
      break, and flex and grid children are allowed to shrink.
- [x] Takeaway is back on the select it had. The booking flow keeps the slot
      grid. They no longer share a picker.
- [x] Cards down again everywhere: the shared card, the console's stacked rows,
      the empty states, the account. The console's row cards were the worst,
      being one line per column.
- [x] Both floor plans show the room and nothing else. The customer's table
      list is gone; the console's table listing is gone and everything it could
      do, edit, delete and mark a table bookable, moved onto the panel that
      opens when a table is selected.

## Waiting on the owner
- [ ] **Set FRONTEND_URL on the API to the address people actually use.**
      Passkeys are bound for life to the domain they were created under, and
      that domain is read from this variable. If it does not match the address
      in the URL bar, no passkey will work and fixing it later will not rescue
      the keys already made.
- [ ] Real photographs of the food, uploaded in Desk > Menu.
      Everything else on the site is now real; the pictures are the last thing
      standing in for something. The redesign leans on them harder than v3 did:
      the home page hero is a full bleed photograph.
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
