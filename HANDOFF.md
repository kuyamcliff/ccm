# Cam Chop Meat website: owner's guide (v5)

The site is two programs that talk to each other:

- **frontend/** — what people see. Rebuilt from scratch in July 2026 and again,
  end to end, in August 2026: black, white and one red, built phone first, and
  built to open fast on a phone on a Buea mobile connection.
- **backend/** — the engine: accounts, bookings, orders, payments, messages.
  Its data lives in a Postgres database at Supabase.

## What changed in August 2026
Every page was rebuilt. The differences you will notice:

- **It opens fast.** The first photograph starts downloading in about a third
  of a second instead of after six. Come back a second time and the page is
  already drawn before anything is fetched.
- **Buttons answer you.** Every button dips when your finger lands on it, and
  anything that takes a moment says what it is doing: "Signing you in",
  "Holding your table". Pressing twice does not order twice.
- **Nothing floats in a box.** Lines on a page, separated by hairlines. The
  only thing that looks like a card is a thing you carry: a booking pass, an
  order receipt.
- **It reads like a person wrote it.** Including when something goes wrong: a
  customer is never shown a server's own words.
- **Three new things:** sold out tonight, cash on collection, and reminders.
  All three are below.

## The two halves of the site

**The public site** is for customers: the menu, booking a table, ordering
takeaway, your story, where to find you, reviews, photos, events, the queue.

**The console** is for you and your staff, at **/desk**. Sign in with a staff
account and a "Desk" button appears in the top bar. Everything you used to have
to ask a developer for is in there.

## What you can do from the console

| Where | What it is for |
|---|---|
| Overview | Tonight at a glance. Refreshes itself every minute. |
| Door | Scan the code on a guest's phone, or type it. Says let them in or not. |
| Bookings | Every booking. Finish, cancel with a reason, or restore one. |
| Collection | The kitchen board for prepaid orders. New, cooking, ready, collected. |
| Queue | The waiting list on a full night. |
| Floor | Drag your tables into the shape of the actual room. Guests see this. |
| Menu | Dishes, prices, photos, and what is showing. |
| Offers | Whatever is running this week. |
| Photos | Approve what customers send in, and add your own. |
| Reviews | Read them, reply as the restaurant, delete only if you must. |
| Events | Enquiries about booking the place out. |
| Payments | Every mobile money attempt, including the ones that failed. |
| Promo codes, Gift cards | Create, retire, and see what is left on a card. |
| Messages | The support chat, live. Hand a conversation to another member of staff. |
| Guests | Accounts. The owner can make somebody staff or block them. |
| Insights | The last thirty days against the thirty before. |
| Details | Your phone number, address, hours and social links. These feed the whole site. Also what a loyalty point is worth. |
| Terms and privacy | Your own wording, edited here. |
| Reminders | Every message the site sent a guest, who it went to, and what failed. |
| Audit log | Who did what. Owner only. |

**Set your details first.** Phone, address and hours are read from there by the
footer, the help page and the contact links. Nothing is hard-coded any more.

If a developer is looking after the site for you, they get five screens of
their own under Desk that you will never need: how the server is doing, recent
faults by their reference code, the settings behind the settings, the size of
the database, and the ability to see the site as one of your guests sees it.
That last one is written into the audit log every single time it is used.

## The three new things

**Sold out tonight.** In **Menu**, one tap marks a dish sold out. It strikes
through on the customer's menu and cannot be added to an order. You do not have
to remember to switch it back: it clears itself by the time you open the next
day.

**Cash on collection.** A guest can now order without paying on their phone and
settle at the counter. The order arrives on the kitchen board marked as owing
money, with the amount, and a **Mark paid** button for whoever takes it. Mobile
Money still works exactly as before, and there is still no card payment
anywhere on this site.

**Reminders.** Guests are messaged the day before their table and again three
hours ahead. Each reminder carries a cancel link, which is the whole point of
it: a table cancelled at four in the afternoon can be sold again, a no-show at
eight cannot. **Reminders** in the console shows every message the site has
sent, including the ones that failed and why.

Reminders run off a scheduled job rather than from inside the server, so they
need two things set up once: `CRON_SECRET` in the server's settings, and a cron
job that calls `/api/cron/reminders` with that secret at least once an hour.
Every fifteen minutes is safer and costs nothing, because a reminder already
sent is never sent twice.

Telling somebody their order is ready is separate and needs no setup: it goes
the moment the kitchen marks the order ready on the board.

## What customers can do
- Create an account, with two-step sign in if they want it.
- Book a table: pick a day and time, then a table off the real floor plan, and
  hold it with a 2,500 FCFA Mobile Money deposit that comes off the bill.
- Get a pass with a code, and a PDF receipt carrying a signed QR.
- Cancel themselves. More than an hour before, the deposit comes back.
- Order for collection, pay ahead or pay cash at the counter, and show a code.
- Join the queue from their phone when the place is full.
- Earn a point for every 100 FCFA they pay, and spend them at the checkout on
  a deposit or an order. You set what a point is worth in **Details**, along
  with how many they need before spending any and the most of one bill points
  are allowed to cover. Half is a sensible ceiling: the rest still comes in as
  money.
- Leave one review, edit it, add a photo, reply to other people's.
- Send in photos for the gallery, ask about an event, message you.

## Running it on a computer
1. Install Node.js LTS from nodejs.org.
2. In one terminal: `cd backend`, `npm install`, `npm run dev` (port 4000).
   It needs `DATABASE_URL` in `backend/.env`. Copy `.env.example` and fill it in.
3. In another: `cd frontend`, `npm install`, `npm run dev` (port 5173).
4. Open **http://localhost:5173** — that exact address. The server refuses
   requests from `127.0.0.1` because it does not recognise it as the site.

## Putting changes on the internet
The site is already deployed: the frontend on Vercel, the backend on Render,
the database on Supabase. Pushing to the main branch is what publishes it.

The frontend builds with `npm run build` in `frontend/` and the result is the
`dist` folder. `frontend/vercel.json` is what points /api at the Render service.

## Before a busy night
- Check **Details** is right: a wrong phone number is one nobody can reach.
- Check **Floor** matches the room, since guests pick their table off it.
- Check **Menu** prices. The site charges what is in there, not what is on the
  board outside.

## Photographs
The home page and the menu use the photos attached to your dishes in
**Menu**, so changing a dish photo changes the site. There are no stock
pictures left in the code. The single biggest visual upgrade available is real
photographs of your own grill and plates, uploaded there.

## What is tested
- `backend/scripts/smoke.ts` exercises every endpoint. Run it with the backend
  up: `cd backend && npm run smoke`.
- `cd backend && npm run check:loyalty` checks the points sums on their own: it
  needs no database and no internet, and it fails if points could ever cover
  more of a bill than you allow, or take more off than was deducted.
- `cd frontend && npm test` and `cd backend && npm test` are the unit tests,
  and `cd backend && npm run test:integration` runs against a real database.
- The rebuilt frontend was driven in a real browser against a real database, on
  a throttled phone profile: signing in, booking a table through all four
  steps, ordering from the menu, paying by wallet and again by cash, marking a
  dish sold out and watching the customer row strike through, replying to a
  review, checking a code at the door, and every developer screen. Every screen
  was loaded as a customer, an admin, the owner and a developer, with no errors
  in the console on any of them.

## If something breaks
Every working version is a git commit; `git log` shows them and any earlier one
can be restored. The database is separate from the code, so rolling the code
back never deletes a booking.
