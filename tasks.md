# Tasks

## Done (2026-08-09, the basket belonged to the browser)
- [x] **A basket outlived the account that filled it.** Sign in, choose food,
      sign out, and the items were still there for whoever opened the site
      next. It was stored under one key with nothing saying whose it was.
- [x] The lines are now written beside the id of the account that made them.
      A basket comes back only to whoever put it there, and is emptied the
      moment that account signs out, is signed out by a 401, or is replaced by
      somebody else signing in on the same phone.
- [x] A signed-out basket is stored under `null` and deliberately survives that
      guest signing in, because choosing food and then signing in to pay for it
      is the normal way to order here.
- [x] `ccm.basket.v1` is removed on sight rather than left as an orphan. A
      basket in progress when this ships is lost once, which is the price of
      the old key having no owner to check.
- [x] Mine's action button follows the tab. It was one button offering to book
      a table on both tabs, so the takeaway tab's only way forward was to book
      a table. It reads "Order takeaway" there now and goes to the menu, since
      an order starts by choosing food.
- [x] Driven in a real browser against a stubbed session: six basket cases
      (boot, sign out, own basket returned, a second account, a guest signing
      in, the old key) and both Mine tabs. All pass. Scripts are in the
      session scratchpad, not the repo: they need a dev server and Playwright,
      which is not a dependency here.

## Done (2026-08-09, Mine could not show a takeaway order)
- [x] **`/api/takeaway/my-orders` was hiding the orders Mine exists to show.**
      It excluded `status != 'awaiting_payment'`, copied from the admin list
      above it, where excluding it is correct: the kitchen board must not show
      orders nobody has paid for. On the guest's own list it meant an order
      placed and not yet paid never arrived, so Mine said "No orders yet" to
      somebody who had just ordered.
- [x] The Orders panel has always rendered "This order is not paid yet, so the
      kitchen has not started on it" and a Pay now button for exactly that row,
      and the checkout's parting message tells the guest to go to Mine and pay.
      None of it could ever run. Both work now.
- [x] `awaiting_payment` is in the `OrderStatus` type and the badge map, which
      is what stopped an unlabelled status crashing the panel that renders it.
      It reads "Not paid".
- [x] Two promises the checkout made to signed-out guests that it could not
      keep: the confirmation said the code was saved in Mine, and the toast on
      abandoning payment sent them to Mine to settle it. An order placed
      without an account has no `user_id`, so it is in neither. Both now say
      what is actually true, and the confirmation tells them the code on screen
      is the only copy.

## Done (2026-08-09, points can be spent)
- [x] **The loyalty scheme has a second half now.** Points were earned by one
      admin action and could never be spent by anybody, so the balance on the
      account page was a promise the rest of the product did not keep, and the
      copy under it said to ask at the counter for something the counter had no
      way to honour.
- [x] Spending, at both checkouts: the booking deposit through the payment
      sheet and the takeaway order when it is placed. A switch, on by default,
      saying how many points and what they take off. The amount above the Pay
      Now button is the amount that will be charged.
- [x] Earning on takeaway as well, on the transition to paid rather than per
      poll. Bookings still earn at completion, because a deposit is a held
      table and not a meal.
- [x] Rules the owner sets in Desk > Details rather than a developer: what a
      point is worth, the floor before any can be spent, and the share of a
      bill they may cover. Bounded per key on the way in, because the money
      ceiling would have accepted a rule saying points cover 900,000%.
- [x] Spent like a gift card: conditional deduction inside a transaction, so
      two checkouts on two devices cannot spend the same balance, and returned
      whenever the payment fails, expires, is abandoned or the order is
      cancelled. `points_spent` is cleared as it is credited, so a redelivered
      webhook cannot hand the same points back twice.
- [x] `npm run check:loyalty` asserts the arithmetic without a database: that
      points never cover more than the cap, never more than the bill, never
      more than the balance, and that what is deducted always equals what comes
      off. That is why `lib/loyalty.ts` imports nothing.
- [x] Fixed on the way past, because this change would have made it worse:
      both gift card refunds handed back the whole of `discount_fcfa`, so an
      order that also used a promo code credited the card with the promo's
      value. `gift_fcfa` records what the card itself covered.
- [x] Typecheck clean both sides, production build clean, `check:loyalty`
      green. Not yet exercised against a live database or a real wallet.

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
- [x] Both flows ask for a time with the same plain select. Takeaway went back
      to the one it had, and booking was moved onto it too once the owner
      showed which control they meant. The grid of twenty eight buttons is
      gone, along with its styles.
- [x] Cards down again everywhere: the shared card, the console's stacked rows,
      the empty states, the account. The console's row cards were the worst,
      being one line per column.
- [x] Both floor plans show the room and nothing else. The customer's table
      list is gone; the console's table listing is gone and everything it could
      do, edit, delete and mark a table bookable, moved onto the panel that
      opens when a table is selected.

## Done (2026-08-05, the scroll-snap gutter bug)
- [x] Found the real cause of "the container is overflowing to the left" on
      the booking day rail and the home page dish rail: `scroll-snap-align:
      start` snaps to a container's bare scrollport, not its padded content
      edge, so on load both rails silently scrolled themselves forward by
      exactly the gutter width, sliding the padding out of view. The first
      item then sat flush against the screen edge with zero visible margin,
      even though the computed padding was correct the whole time. Fixed by
      adding `scroll-padding-inline` (the property scroll snap actually
      reads) alongside the existing `padding-inline` on both `.chip-rail` and
      `.dish-grid`. Confirmed with `scrollLeft` measurements before and after:
      16px stray offset on load, now 0.
      Swept every other `overflow-x: auto` container in the stylesheets;
      only these two combine snapping with a gutter bleed, so nothing else
      had the same bug.
- [x] Both rails also sized down: day chips lost about a third of their
      padding and height, and home page dish cards went from 68vw to 54vw so
      a third card now peeks into view as an invitation to keep scrolling.

## Done (2026-08-21, v5: the whole frontend again)
Every page rebuilt from nothing, plus what the frontend needed underneath it.
The reasoning is in `context.md`; this is the checklist.

- [x] **The boot waterfall.** `GET /api/bootstrap` collapses three round trips
      into one, `lib/boot.ts` reads a localStorage copy of it synchronously
      before React renders, and an inline script in `index.html` preloads the
      cached hero before the bundle has parsed. Measured cold on a throttled
      phone profile: first paint 612ms, first image requested at 349ms.
- [x] **The data layer.** `lib/store.ts` replaces `lib/useResource.ts`, with
      stale-while-revalidate, request de-duplication and prefetch on intent.
      `Action`'s `pending` prop is required, so a button that fires a promise
      cannot be written without a pending state.
- [x] **Press feedback on everything.** `ui/press.ts` on every control,
      firing on pointerdown and held a minimum of 90ms so a fast tap still
      shows. Verified with a delayed response: the button goes `aria-busy`,
      disables, swaps its label to a verb, and a second press makes no second
      request. Width moved 0.003px across the swap.
- [x] **Motion.** `ui/Img.tsx` awaits `decode()` before revealing;
      `ui/HeroFrames.tsx` only lets a frame join the rotation once it has
      decoded, which is what the old fixed 21s crossfade never did. Named View
      Transitions between screens.
- [x] **No boxes.** `.card` is gone from the stylesheets entirely. Rows with
      inset hairlines, and one raised surface (`.carry`) for a pass, a receipt
      or the payment sheet.
- [x] **The writing.** All of it in `src/copy/`, English and French together,
      held in step by `copy.test.ts`. `lib/say.ts` means no server string ever
      reaches a customer; three responses are read directly, and only because
      each carries data the screen must show.
- [x] Smaller throughout: the type ramp cut again, section gaps down a step,
      body held at 16px because iOS zooms the page below that.
- [x] **A real `developer` role**, five screens, and impersonation that
      refuses anyone who is not a plain guest and audits before it issues the
      cookie.
- [x] **Sold out tonight**, with `sold_out_until` and a sweep that clears it by
      opening, so nobody has to remember.
- [x] **Cash on collection**, with an idempotent audited "Mark paid" on the
      kitchen board. Still no card UI anywhere, and CI still fails the build if
      a card term appears.
- [x] **Reminders**, 24h and 3h, deduplicated off the `notifications` table
      rather than a new column, behind a shared secret so a cron job can call
      it and nobody else can.
- [x] French is no longer a gap: the customer site ships both languages.
- [x] Passkeys can now be registered as well as listed and removed
      (`POST /api/account/passkeys/options` and `/verify`).

## Done (2026-08-21, v5.1: the fixes round)

**The basket emptied itself.** Three bugs, any one of them enough. Written up
in `context.md` under "The basket that emptied itself".
- [x] `price()` dropped every line, because it required `is_active === 1` and
      the public menu does not return that column at all. Moved to
      `lib/basketPricing.ts` with five tests, one of which builds a dish exactly
      as the public endpoint returns one.
- [x] `/api/bootstrap` was `Cache-Control: private, max-age=5` on a body that
      carries `user`, so signing in and moving to the next screen read a copy
      taken while signed out. Now `no-store`, with an integration test.
- [x] `app/Boot.tsx` fetched the payload and then threw it away: a `started`
      ref and a `cancelled` cleanup flag cancelled each other out under
      StrictMode's double mount.

**The screens.**
- [x] Menu: "Our Menu" and nothing under it. The category rail is full bleed
      and got the page gutter back, so "All" is no longer half off the edge.
- [x] No focus ring on anything you type into, anywhere in the product. The
      universal `:focus-visible` also stopped forcing its own border-radius,
      which is what turned a ring into four white corners. Buttons and links
      keep the ring: for those it is the only thing saying where you are.
- [x] Footer trimmed to what is nowhere else: Terms, Privacy, Help, phone,
      WhatsApp, socials. Menu, Book and Find us came out because all three are
      tabs at the bottom of the screen at all times.
- [x] Paying is three names now: MTN Mobile Money, Orange Money, Cash at the
      counter. The lines under each explaining that a PIN prompt arrives on the
      handset are gone, on both the order page and the payment sheet, along
      with "nine digits, starting with 6" and the sentence under the button
      repeating the total.

**Tables.**
- [x] A booking can hold more than one table. Tap a second and the seats add up;
      nothing on the screen says so in words.
- [x] The guest's floor plan was drawing tables at a fixed six units on a
      640-unit canvas, which is about seven pixels on a phone. Everything is
      sized off the room now: a table lands at 43 to 49px, measured.
- [x] The console's floor editor scales to fit instead of being a fixed 640 by
      560 with the wrapper scrolling. A sizing box carries the scaled
      dimensions so the scroller measures what is actually on screen.
- [x] A table with somebody at it reads as in use on the console. Not on the
      guest's plan: they are choosing for nine o'clock and it is a fact about
      this minute.

**Visits.**
- [x] Book a table and Order something as standing actions on the two tabs,
      not only when the list is empty.
- [x] View receipt on every table and every order, however old, opening the
      whole receipt as a sheet built from data already on the page. Download is
      a button inside it. The rows themselves are rows again.
- [x] "I am here" on a held table, on the day. The console polls, so it reaches
      staff within the minute.
- [x] "I have it" on an order that is ready, so nobody behind the counter has
      to remember to close it. It does not touch the money.

**The door.**
- [x] The camera. The aiming frame was `position: absolute` with no positioned
      ancestor and a hard-coded `margin-top: -14rem`, so on any screen but one
      it sat off the picture. The video was also pinned to 4:3 and cropped,
      which on a phone held upright threw away most of what the camera could
      see before jsQR ever looked at it.

**Wording.**
- [x] Ten em and en dashes in strings a customer or a member of staff can read,
      including one printed on every PDF receipt. A previous check reported the
      file clean because it scanned whole-file rather than line by line, which
      let quotes pair across lines and hid them.

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
- [ ] **Set `CRON_SECRET` on the API and point a cron job at
      `/api/cron/reminders`** with it in an `x-cron-secret` header, at least
      once an hour. Until that exists no reminder goes out, which is the safe
      direction to fail in but is not the point of building them.
- [ ] Set `DEVELOPER_EMAIL` if somebody is looking after the site. It only
      promotes; clearing it never demotes anybody.
- [ ] The menu data itself still says "From the grill", "Grilled chicken" and
      "Charcoal all the way". That is content in the database, not code, and it
      is edited in Desk > Menu. There is also no beef on the menu yet.

## Known gaps, deliberately left
- `/api/admin/reviews` returns a thinner row than `/api/reviews` (no
  admin_reply, no votes), so the console reads the public list instead. Worth
  tidying in the backend one day; it changes nothing for the user.
- **The image pipeline.** Deferred by the owner in favour of the frontend work.
  Uploads are stored at full size with no derivatives and no CDN. v5 makes the
  download start early and never shows a half-decoded picture, but a 4MB hero
  is still 4MB. The fix is `sharp` derivatives on upload plus Supabase Storage.
- **Delivery.** Declined. It changes how the restaurant runs, not just the
  software.
