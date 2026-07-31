# Cam Chop Meat website: owner's guide (v3)

The site is two programs that talk to each other:

- **frontend/** — what people see. Rebuilt from scratch in July 2026.
- **backend/** — the engine: accounts, bookings, orders, payments, messages.
  Unchanged by the rebuild. Its data lives in a Postgres database at Supabase.

## The two halves of the site

**The public site** is for customers: the menu, booking a table, ordering for
collection, reviews, photos, events, the queue.

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
| Details | Your phone number, address, hours and social links. These feed the whole site. |
| Terms and privacy | Your own wording, edited here. |
| Audit log | Who did what. Owner only. |

**Set your details first.** Phone, address and hours are read from there by the
footer, the help page and the contact links. Nothing is hard-coded any more.

## What customers can do
- Create an account, with two-step sign in if they want it.
- Book a table: pick a day and time, then a table off the real floor plan, and
  hold it with a 2,500 FCFA Mobile Money deposit that comes off the bill.
- Get a pass with a code, and a PDF receipt carrying a signed QR.
- Cancel themselves. More than an hour before, the deposit comes back.
- Order for collection, pay ahead, and show a code at the counter.
- Join the queue from their phone when the place is full.
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
- The rebuilt frontend was driven in a real browser against a real database:
  signing in, booking a table through all three steps, ordering from the menu,
  paying, replying to a review from the console, and checking a code at the
  door. Every screen was loaded as a customer and as the owner with no errors.

## If something breaks
Every working version is a git commit; `git log` shows them and any earlier one
can be restored. The database is separate from the code, so rolling the code
back never deletes a booking.
