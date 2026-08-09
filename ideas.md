# Feature research, August 2026

What the industry and the local market are doing that this site does not do
yet, checked against what is actually in the codebase. Every item says what
exists today, so nothing here is a suggestion to build something twice.

Sources are listed at the bottom. Researched 2026-08-09.

## The three findings that matter most

**1. The site can already message a guest's phone, and almost never does.**
`backend/src/lib/notify.ts` is a finished WhatsApp and SMS sender with a
`notifications` table, a logged-not-sent mode for when credentials are absent,
and normalised Cameroonian numbers. Three messages use it: `booking_confirmed`,
`takeaway_ready`, `waitlist_ready`. There is no scheduler anywhere in the
backend (`grep setInterval` finds a rate limiter and an SSE ping), so nothing
is ever sent ahead of time. A 3-touch reminder sequence is the single most
studied lever in this industry: no-shows fall from 20-25% to 5-8%, a 24 hour
reminder alone cuts them 30-40%, and WhatsApp reminders open at over 90%. The
deposit already protects the money; reminders protect the table.

**2. Loyalty points are earned and can never be spent.**
`routes/loyalty.ts` awards a point per 100 FCFA and keeps a ledger, but
`awardPoints` has exactly one caller: an admin marking a reservation complete
(`routes/admin.ts:99`). Takeaway awards nothing. Neither checkout can redeem.
`points_balance` is a number the guest can look at in Account and nothing else,
which is worse than having no programme, because it makes a promise the product
does not keep. The 2026 direction is away from points-and-redemption friction
towards rewards that apply themselves at checkout.

**3. There is no delivery, and in Buea delivery is the competition.**
Grep confirms the word only appears in this repo about webhooks and email. The
market has Reeyo (Douala, Buea, Limbe), AKOFUD Buea, and Spice Express, which
sells on WhatsApp ordering plus free delivery in 30 minutes. Takeaway that the
customer must collect is a narrower offer than what people in the same town are
already used to. This is the largest build on the list and the only one that
changes operations rather than software, so it is a decision, not a task.

---

## Tier A: ship next

Each of these reuses machinery that is already built and tested.

### A1. Reminder and no-show sequence
Add a scheduled sweep (a Render cron hitting an authenticated route beats an
in-process `setInterval`, which dies with the dyno and doubles up across
instances) that sends `booking_reminder_24h` and `booking_reminder_3h` through
the existing `notify()`. Include a one-tap cancel link: guests who can cancel in
two taps cancel, and a cancelled table can be resold, while a no-show cannot.
The waitlist then has something to fill.
Also worth the same channel: `payment_failed`, `booking_cancelled`,
`table_ready`, and a nudge when a held table is about to expire.

### A2. Make points spendable, and award them everywhere
Call `awardPoints` on paid takeaway as well as completed bookings. Add
`POST /api/loyalty/redeem` and a line at both checkouts, or better, apply the
discount automatically once the balance passes a threshold and say so on the
button. Cap redemption as a share of the bill so margin is not eaten.
`points_ledger` already has `ref_type` and `ref_id`, so spend rows fit the
existing shape without a migration.

### A3. Sold out tonight
`menu_items` has `is_active` only, so taking goat off the board when it runs
out means deactivating a dish and remembering to switch it back tomorrow.
Nobody remembers. Add `sold_out_until` (a timestamp, cleared automatically at
opening), a one-tap toggle in Desk > Menu, a struck-through row on the customer
menu, and a hard refusal at checkout. A grill that sells out is a good sign
right up until somebody pays for something that does not exist.

### A4. The pass has to work with no signal
`sw.js` says plainly: `/api/*` is never touched. So the booking pass, the QR
and the door code all need a live connection at the exact moment a guest is
standing outside a building in Buea at night. Cache the guest's own pass and
order code on issue and serve them offline. Jumia's PWA is the standard
reference for this market: built for expensive data and cheap phones, 33%
higher conversion and 50% lower bounce than the native app.

### A5. Ask for the review after the visit, not on the site
One message a few hours after a completed booking, deep-linked to the review
form the site already has, and a second path to Google. Reviews are the input
to local ranking, and the restaurant currently only gets the ones people
volunteer.

## Tier B: being found

The business is discovered on TikTok and on Maps, so this tier is worth more
than its size suggests.

### B1. A landing route built for the bio link
Guidance is specific: the bio link should be a working reservation link, not a
homepage the guest has to navigate three more steps from. Add `/go` (or `/t`)
that opens on Book and Order side by side, carries a campaign parameter into
Insights, and shows tonight's offer. Then the owner can see what a video is
worth. Three in four TikTok users say it influences where they eat, and the
platform is now used as a search engine for restaurants by under-35s.

### B2. Deepen the structured data
`index.html` carries a good `Restaurant` block. Missing: `Menu` and `MenuItem`
with prices generated from the real menu, `AggregateRating` from real reviews,
`OrderAction` and `ReserveAction`, and `geo`. Structured data lifts click
through by up to 30%, and it is now what makes a business quotable by ChatGPT,
Gemini and Perplexity, which is where a share of "where should I eat in Buea"
now gets asked. `sitemap.xml`, `robots.txt` and `llms.txt` already exist, so the
foundation is there.
Off-site, and free: 40% of restaurants have no menu link on their Google
Business Profile, and complete profiles get 42% more direction requests. The
ordering link there must point here, not at a delivery app taking commission.

### B3. Referral codes
The promo and gift card machinery is built and audited. A referral is a promo
code with a payer: guest shares, friend gets their first delivery or deposit
discounted, guest gets points. Cheapest growth feature available here because
almost none of it is new code.

## Tier C: bigger bets, in the order I would take them

### C1. Delivery
Zones and flat fees rather than distance maths, a rider view that is just the
kitchen board filtered, a status the guest can watch, and cash on delivery as
well as prepaid. Keep it commission-free and it pays for itself against Reeyo
and AKOFUD immediately.

### C2. WhatsApp as a real channel, not just outbound
15 million of Cameroon's 22 million social media users are on WhatsApp, open
rates run around 98%, and platforms are now doing structured menu browsing and
checkout inside the chat. Two-way support routed into the existing Desk > Inbox
is the natural first step, since the support desk, the realtime layer and the
Twilio WhatsApp sender all exist.

### C3. Order from the table
The floor plan, the basket and the payment dialog are all built. A QR on each
table that opens the menu with the table pre-selected turns them into dine-in
ordering with very little new surface. Pair with paying the balance by MoMo at
the table, since the deposit flow already knows how to take part of a bill.

### C4. Pickup slots and kitchen capacity
`takeaway.pickup_time` is free text validated against a regex, so twenty people
can pick 19:30 and the grill takes the hit. Cap orders per slot, grey out full
slots, and show an honest prep time.

### C5. Data saver
AVIF and WebP with responsive sizes, a low-data toggle that drops hero
photography to a single compressed image, and honest wording about it. Almost a
billion people in Africa are covered by mobile broadband and still not using
mobile internet, and cost is the main reason.

### C6. French
Buea is Anglophone, the country is not, and the previous version's French
strings were written against screens that no longer exist. Worth starting from
the current copy when the owner wants it, not before.

### C7. Payment surface
MTN and Orange are rolling out QR payment in shops and BEAC is pushing
interoperability, so a displayed merchant QR at the counter is likely to be
expected soon. Cash on collection with the order held is a smaller, more
immediate gap.

## Refinements to what already exists

- **Passkey registration.** The account can list and remove passkeys but not
  create one; the backend endpoint was never written. This is already in
  `tasks.md` and remains the most visible half-finished thing in the product.
- **Waitlist quality.** `waitlist_ready` fires, but the guest is not told their
  position, given an estimate, or held for a fixed window before the offer
  moves down the list.
- **Insights that answer questions.** The console compares thirty days against
  thirty. Missing and cheap from existing tables: no-show rate, repeat-guest
  rate, revenue by hour, and which dish actually sells rather than which is
  viewed.
- **Admin reviews row.** `/api/admin/reviews` returns a thinner row than the
  public list, so the console reads the public one. Known, harmless, still
  wrong.
- **Gift cards over WhatsApp.** They can be created but only handed over by the
  buyer. `notify()` could deliver one with its code.
- **Deposit policy visibility.** The 2,500 FCFA deposit and 1,500 FCFA late
  cancellation fee are enforced by the server but should be stated at the point
  of decision, in the same words, in the booking summary and the reminder.

## Sources

Reservations, no-shows and waitlists:
[eat App](https://restaurant.eatapp.co/blog/restaurant-no-shows),
[Hostie](https://www.hostie.ai/resources/ai-reservation-assistants-reduce-no-shows-sms-reminder-impact),
[HappyChef](https://happychef.cloud/en/blog/reservations/reduce-no-shows.html),
[Chowbus](https://www.chowbus.com/blog/restaurant-reservation-waitlist-system-2026),
[Milagro](https://www.milagrocorp.com/blog/how-digital-waitlists-are-transforming-restaurant-operations-in-2026/)

Loyalty and ordering technology:
[ChowNow](https://get.chownow.com/blog/restaurant-technology-trends/),
[Incentivio](https://incentivio.com/2026-restaurant-technology-trends-what-forward-thinking-operators-need-to-know/),
[Restolabs](https://www.restolabs.com/blog/restaurant-technology-trends),
[Craver](https://www.getcraver.com/blog/restaurant-technology-trends/)

TikTok and discovery:
[Malou](https://www.malou.io/en-us/blog/tiktok-for-restaurants),
[ChowNow](https://get.chownow.com/blog/tiktok-marketing-for-restaurants/),
[Frankia](https://frankiapp.com/blog/tiktok-restaurant-marketing),
[HappyChef](https://happychef.cloud/en/blog/marketing/tiktok-restaurant-marketing.html)

Search, structured data and Google Business Profile:
[Malou structured data guide](https://www.malou.io/en-us/blog/structured-data-for-restaurants),
[Chowly](https://chowly.com/resources/blogs/get-found-first-on-google-restaurant-seo-checklist-for-your-business-profile/),
[Restolabs GBP guide](https://www.restolabs.com/blog/restaurants-google-business-profile)

WhatsApp and Cameroon:
[Menubly](https://www.menubly.com/blog/whatsapp-for-restaurants/),
[Techpoint Africa on Swoop](https://techpoint.africa/brandpress/swoop-brings-restaurant-browsing-and-checkout-into-whatsapp/),
[BusinessHAB on WhatsApp in Cameroon](https://businesshab.com/whatsapp-business-in-cameroon/)

Mobile money:
[BEONWEB 2026 payment guide](https://www.beonweb.cm/en/blog/paiement-en-ligne-cameroun-mtn-orange-money-2026),
[Riverpe](https://www.riverpe.com/blog/cameroon-payment-methods-mtn-momo-orange-money),
[Business in Cameroon on the MTN and Orange joint venture](https://www.businessincameroon.com/telecom/2711-8619-cameroon-orange-and-mtn-launch-a-mobile-money-joint-venture)

Delivery in Buea:
[Reeyo](https://reeyoapp.com/),
[AKOFUD Buea](https://www.buea.akofud.com/),
[Spice Express Buea](https://spiceexpressbuea.com/)

Low bandwidth and PWAs:
[TechBuild Africa](https://techbuild.africa/low-bandwidth-product-design-africa/),
[MobiLoud PWA examples](https://www.mobiloud.com/blog/progressive-web-app-examples),
[Digital Applied](https://www.digitalapplied.com/blog/progressive-web-apps-2026-pwa-performance-guide)
