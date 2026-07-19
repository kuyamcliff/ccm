# Cam Chop Meat website: owner's guide (v2)

The site is now a real web application in two parts:

- **frontend/**: what visitors see. React + TypeScript. Pages: home, menu, book a
  table, reviews, sign in, create account, my tables.
- **backend/**: the engine. Node.js + Express + TypeScript. It stores accounts,
  reservations and reviews in a single SQLite database file (backend/data/camchop.db).
  That file IS your data; back it up and never commit it to git.

## Running it on a computer
1. Install Node.js LTS from nodejs.org (already installed on this machine).
2. In one terminal: `cd backend`, `npm install`, `npm run dev` (starts on port 4000).
3. In another: `cd frontend`, `npm install`, `npm run dev` (starts on port 5173).
4. Open http://localhost:5173.

## What users can do
- Create an account (name, email, password). Passwords are stored hashed, never plain.
- Book a table: date, half-hour slots from 12:00 to 21:30, 1 to 20 people, phone,
  optional note. They get a "table ticket" with a number.
- See and cancel their bookings under "My tables". Cancelling keeps a record
  (status becomes cancelled) so you can still see no-show history.
- Leave one review each (1 to 5 stars plus text), edit it, or delete it.

## Where the owner looks things up
There is no admin dashboard yet (good first upgrade). Until then, reservations can be
read straight from the database with any SQLite viewer (for example "DB Browser for
SQLite", free) opened on backend/data/camchop.db, table "reservations".

## Before real customers use it
1. Replace the placeholder phone number: search the frontend folder for
   `+237 000 000 000` (Footer.tsx and Reserve.tsx).
2. Confirm hours: search for `midday till late` (Footer.tsx and App.tsx ticker).
3. Set a real secret for sessions: on the production server, set the environment
   variable JWT_SECRET to a long random string. The dev fallback in
   backend/src/auth.ts must not be used in production.
4. Menu prices: edit frontend/src/data/menu.ts. Plain text, hard to get wrong.

## Putting it on the internet
The frontend builds to static files (`cd frontend && npm run build`, output in
frontend/dist). The backend needs a small always-on Node server. The simplest path:
- Render.com or Railway.app free/cheap tier: deploy backend as a Node service
  (build: `npm install && npm run build`, start: `npm start`), set JWT_SECRET there.
- Deploy frontend/dist to Netlify, and set a redirect so /api/* forwards to the
  backend URL.
A domain (camchopmeat.com, roughly 10,000 to 15,000 FCFA per year) plugs into
Netlify. Ask a developer for an hour of help the first time; after that, deploys are
one command.

## What is tested
backend/scripts/smoke.ts exercises every endpoint (register, login, duplicate email,
bad dates, double booking, cancel, reviews). Run it with the backend up:
`cd backend && npm run smoke`. The booking, review and account flows were also
clicked through in a real browser before handoff.

## If something breaks
Every working version is a git commit. `git log` shows the history; any earlier
version can be restored. The database file is separate from the code, so rolling back
code never deletes reservations.
