# Cam Chop Meat — pitch pack

For the meeting with the owner. Every price is in **FCFA (XAF)**, researched
2026-08-29. Dollar prices converted at **575 FCFA = $1** — the mid-market rate
on 26 Aug 2026 was 562.85, and the extra ~2% covers the card/FX margin a
Cameroonian card adds. Sources are at the bottom.

---

## 1. The one thing to remember

**Do not pitch a website. Pitch a second till.**

The site is not decoration. It takes a **2,500 FCFA Mobile Money deposit before
the guest arrives**, it messages them the day before and three hours ahead with
a cancel link, and it lets a table cancelled at 4pm be sold again by 8pm. That
is the sentence he has to hear in the first thirty seconds.

Everything else — the menu, the photos, the reviews, the loyalty points — is
support for that one sentence.

---

## 2. Open your phone. Do not open a slide.

The site is **already built and already running**. That is the whole advantage.
Nobody else walking into that restaurant can show a finished product.

Order of the demo, six minutes, on your phone:

1. **clipfx.me/admin** — the site as a customer sees it. Let it load in front of
   him and say nothing: first picture starts in about a third of a second.
2. **Book a table.** Pick the day, pick a table off the real floor plan, add a
   chicken to the order, and stop at the Mobile Money prompt. Say: *"that
   2,500 is in your account before he leaves his house."*
3. **Hand him the phone** and let him press a button. The dip under his finger
   is the thing that makes people believe it is real.
4. **clipfx.me/admin/desk → Overview**, then **Door**, then **Floor**. Say:
   *"this is your side. Twenty-three screens. You never call me to change a
   price."*
5. **Menu → mark a dish sold out.** Switch back to the customer tab and show it
   struck through. This is the demo that closes restaurant owners.
6. **Desk → Launch.** *"Your site goes public the day you press this. Not the
   day I finish."*

Then put the phone down and stop talking.

---

## 3. What the platform does

### What a customer can do
- Create an account, with two-step sign-in if they want it.
- **Book a table**: pick a day and time, pick a real table off the floor plan,
  choose what they want to eat, and hold it with a **2,500 FCFA Mobile Money
  deposit that comes off the bill**. Food ordered ahead is paid with the same
  prompt, so it is on the fire as they sit down.
- **Book several tables at once** for a party of ten.
- Get a **pass with a code** and a PDF receipt carrying a signed QR.
- **Cancel themselves.** More than an hour before, the deposit comes back.
- **Order takeaway for collection** — pay ahead on the phone, or pay cash at the
  counter. Show a code. Tap *"I have it"* when they collect.
- Tap **"I am here"** on arrival; it shows on the staff screens within a minute.
- **Join the queue** from their phone when the place is full.
- **Earn a point for every 100 FCFA paid** and spend points at checkout. The
  owner sets what a point is worth and the maximum share of a bill points may
  cover.
- Use **promo codes and gift cards**.
- Look at **any receipt they have ever had** and download it.
- Leave one review, edit it, add a photo, reply to others.
- Send in photos for the gallery, ask about booking the place out, message the
  restaurant live.
- All of it in **English and French**, phone-first, and it works as an installed
  app on the home screen.

### What the owner and staff can do (the console, at /desk)
Twenty-three screens. The ones that matter in the meeting:

| Screen | What it is for |
|---|---|
| **Overview** | Tonight at a glance, refreshing every minute. |
| **Door** | Scan the code on a guest's phone. Let them in, or not. |
| **Bookings** | Every booking, every table it holds, what the party ordered ahead. |
| **Collection** | The kitchen board: new → cooking → ready → collected. |
| **Floor** | Drag your tables into the shape of the real room. Guests book off it. |
| **Menu** | Dishes, prices, photos, and one tap for **sold out tonight**. |
| **Payments** | Every Mobile Money attempt, including the ones that failed. |
| **Insights** | Last thirty days against the thirty before. |
| **Guests** | Accounts. Make somebody staff, or block them. |
| **Reminders** | Every message the site sent, who got it, what failed. |
| **Audit log** | Who did what. Owner only. |
| **Launch** | The switch that opens the site to the public. |
| Queue, Offers, Photos, Reviews, Events, Promo codes, Gift cards, Messages, Details, Terms | The rest. |

**Say this out loud:** *"There is nothing on this site you have to phone me to
change. Prices, photos, hours, your phone number, your tables, your opening
times — all of it is yours."*

### What it deliberately does **not** do
Say this before he finds it himself; it buys you enormous credit.
- **No delivery.** That changes how the kitchen runs, not just the software.
- **No card payments.** Mobile Money and cash only, which is what Buea uses.
- Photos are not yet resized on upload, so a 4MB hero is still 4MB on a slow
  connection. It is on the list and it is cheap to fix.

---

## 4. What the running costs actually are

He will ask. Have the real number ready, and do not hide it — a man who sees
your cost sheet believes your price.

### Bought once
| Item | Price | FCFA |
|---|---|---|
| **camchopmeat.com** — checked today, **available** | $11.25 (Vercel) / $9.58 (Namecheap) | **≈ 6,500 / 5,500** |
| .com renewal, every year after | $13.98 | ≈ 8,000/yr |
| camchopmeat.cm (the national domain) | $120/yr | ≈ 69,000/yr — **skip it** |
| Two business SIMs (MTN + Orange) | — | ≈ 2,000 |

Buy the **.com**. The `.cm` costs twelve times more every single year and no
customer in Buea types a domain anyway — they tap a link from TikTok.

### Every month
| Service | What it is for | Lean (month 1) | Proper (once money flows) |
|---|---|---|---|
| **Vercel** | the site itself | Hobby, 0 — *but see note* | Pro, $20 → **11,500** |
| **Render** | the engine: bookings, payments | Starter $7 → **4,000** | 4,000 |
| **Supabase** | the database | Free, **0** | Pro $25 → **14,375** |
| **Zoho Mail** | 3 professional mailboxes | Mail Lite $1/user/mo → **1,725** | 1,725 |
| **Resend** | receipts and password emails | Free (3,000/mo) → **0** | Pro $20 → 11,500 |
| **SMS / WhatsApp reminders** | ~300 bookings × 2 messages | ≈ **9,000** | ≈ 9,000 |
| **Domain**, spread over the year | — | **500** | 500 |
| **Two business lines** | Orange Flex+ plan 1 = 5,000, MTN line ≈ 5,000 | **10,000** | 10,000 |
| **Total** | | **≈ 25,000 FCFA/month** | **≈ 51,000 FCFA/month** |

**The Vercel note, and be honest about it:** the free Hobby plan forbids
commercial use. You can run on it for a few weeks while he decides; the day the
site goes public and takes money, it should be Pro at 11,500/month. Tell him
that yourself before he reads it somewhere.

**Optional, quote separately if he asks:**
- Restaurant WiFi: Orange unlimited **25,000 FCFA/30 days**, or MTN Surf Pro from
  4,000 (1.5 GB) to 150,000 (150 GB).
- MTN My Office prepaid business voice: **45 FCFA/minute**, free within the fleet.
- Orange Flex+ plan 2: **10,000 FCFA/month** — 2 GB, 50 SMS a day, 10 min
  international, unlimited calls inside the fleet.

### The money line — this one is worth real FCFA to him
| Route | Fee on every payment |
|---|---|
| Aggregator (Fapshi, Campay) — live in two days, no setup fee | **3%** |
| **Direct MTN MoMo + Orange Money merchant account** | **0.5% – 1.5%** |

**The backend is already written against MTN MoMo and Orange Money directly.**
So say this:

> *"An aggregator takes 3%. I built you the direct connection, so you pay
> about 1%. On 10 million FCFA a month through the site, that difference is
> about 200,000 FCFA a month — more than three times what you are paying me."*

Plan: go live on an aggregator in week one so nothing waits on paperwork, and
run the MTN and Orange merchant KYC in parallel. That is why you want **one MTN
business line and one Orange business line** — each merchant account hangs off a
line on its own network, and a customer on either network reaches you cheaply.

---

## 5. What to charge

### The anchor, said before any number of yours
> *"An agency in Douala quotes four to six million for something like this, and
> takes six months. It is already built, and it is running on my phone right
> now."*

Say the agency number **first**. Every number you say after it sounds small.

### Three packages — put all three on the table

| | **Essentiel** | **Business** ← recommend this | **Propriétaire** |
|---|---|---|---|
| Today | **0** | **500,000 FCFA** | **2,500,000 FCFA** |
| Every month | **100,000** | **60,000** | 40,000 (optional) |
| **Year one** | **1,200,000** | **1,220,000** | **2,980,000** |
| Year two onward | 1,200,000 | 720,000 | 480,000 |
| Hosting, domain, email, SIMs | included | included | he pays direct |
| Who owns the code | licensed to him | licensed, **buy-out at 2,000,000 any time, setup credited** | **his, transferred** |
| Support | WhatsApp, working hours | WhatsApp, 7 days, same-night on a Friday or Saturday | 8 hours a month |
| New features | fixes only | one improvement a quarter, agreed with him | quoted separately |

Two things about that table, and they are deliberate:

- **Essentiel and Business cost almost the same in year one.** That is on
  purpose. It proves the monthly is not a trick, and it makes Business the
  obvious choice because year two halves.
- **Propriétaire exists to be refused.** Its job is to make 500,000 feel small.
  If he takes it, wonderful.

### Your negotiation ladder — decide this before you walk in

| | Number |
|---|---|
| **Open at** | 1,000,000 setup + 75,000/month |
| **Expect to land** | 500,000 – 750,000 setup + 60,000/month |
| **Floor** | 300,000 setup + 50,000/month |
| **Never** | below 45,000/month — hosting alone is 25,000 to 51,000 |

**Concede the setup fee, never the monthly.** A setup fee is one payment and he
forgets it. The monthly is your business. If he pushes, cut 1,000,000 → 750,000
→ 500,000 and hold 60,000 like it is the law.

### If he will not commit tonight — the pilot
> *"Three months. 75,000 a month, nothing today. If it does not bring you money
> by the third month, we stop and you owe me nothing more. If it does, the
> 225,000 comes off the setup fee."*

**225,000 FCFA total, credited in full.** This is the close for a man who likes
the idea but does not trust a stranger yet. Do not offer it until he has
hesitated twice — offered too early it becomes the only price he hears.

### Never do this
- **Never free.** A free site is a site nobody logs into. If he truly cannot
  pay, take 25,000/month as a hosting pass-through and nothing for your work —
  but write it down as a discount off 60,000 so the real price stays on paper.
- **Never a percentage of his food sales.** He will not open his books to you
  and asking insults him. A share of *online payments only* is defensible —
  the console counts every one — but the flat monthly is cleaner. Keep it flat.
- **Never quote a number for "changes later" on the spot.** Say *"that's in your
  quarterly improvement"* or *"let me look and tell you tomorrow."*

---

## 6. Justify the price with his own money

Do this arithmetic **out loud, with his numbers, not yours**. Ask him first:
*"How many tables do you lose on a Saturday to people who booked and never
came?"* Then work from whatever he says.

- **A no-show at 8pm on a Saturday** is a table that earns nothing all night. At
  a 12,000 FCFA average bill for a party, three of those a week is **144,000
  FCFA a month gone**.
- **Reminders with a cancel link fix exactly that.** A table cancelled at four in
  the afternoon gets sold again. One at eight cannot.
- **The 2,500 deposit** means the ones who do not come have already paid
  something, and the ones who cancel late leave it behind.
- **Ordering ahead** turns a 45-minute table into a 30-minute table on a full
  night, because the meat is on the fire before they sit.

> *"If this saves you two tables a week, it has paid for itself twice over.
> Everything after that is yours."*

Then stop. Let him do the sum in his head.

---

## 7. The four objections, and what to say

**"It is too expensive."**
> *"Which part? The 60,000 a month, or the 500,000 today?"* — then concede only
> the part he names. Half of the 60,000 is Vercel, Render, Supabase and Zoho;
> show him the cost table. Nobody argues with a receipt.

**"My customers do not use websites, they call."**
> *"They will keep calling. This is for the ones who found you on TikTok at ten
> at night and will not call a stranger. Every one of those is a table you are
> not getting today."* The TikTok account is the proof — that traffic is real
> and it is arriving on a phone.

**"What if you disappear?"**
> *"Everything is in your name from day one: the domain, the email, the Vercel
> account, the Render account, the database. I hold the keys, you hold the
> accounts. If I vanish tomorrow, any developer picks it up — and there is a
> written guide in the project explaining every screen."* True, and it is
> `HANDOFF.md`. Say the file exists.

**"Let me think about it."**
> *"Of course. Can I do one thing tonight? Buy camchopmeat.com in your name —
> six thousand francs, my money. If we do nothing else, you own your name and
> nobody else can take it."* A yes to something small tonight is worth more than
> a maybe to something large.

---

## 8. What you agree before you stand up

Get these five in writing, even on WhatsApp. Written on a phone in front of him
is a contract.

1. **The package and the number.** Which of the three, what today, what monthly.
2. **The domain.** camchopmeat.com, bought tonight, registered in **the
   restaurant's name** with his email as owner contact. You pay for it now, it
   is on the first invoice, and the account transfers when the setup fee is
   paid. Say all of that plainly — hiding it is what makes people suspicious.
3. **The launch date.** A real date. *"We press Go live on Friday the 11th."*
   Without a date, nothing happens.
4. **Who from his staff.** One name. Somebody who will hold the Door screen on a
   Saturday. Train that person, not him.
5. **Photographs.** The single largest visual upgrade available is real photos
   of his own grill on the Menu screen. Either he sends them or you shoot them —
   quote **50,000 – 100,000 FCFA** for a session, separately, another day.

---

## 9. The numbers to have in your head

| | |
|---|---|
| camchopmeat.com | **6,500 FCFA**, available today |
| Real running cost, month 1 | **≈ 25,000 FCFA/month** |
| Real running cost, at full tilt | **≈ 51,000 FCFA/month** |
| Mobile Money: aggregator vs. direct | **3% vs ~1%** |
| **The price you say** | **500,000 today + 60,000 a month** |
| Open at | 1,000,000 + 75,000 |
| Floor | 300,000 + 50,000 |
| The pilot, if he stalls | 3 × 75,000 = **225,000**, credited |
| The agency comparison | **4 – 6 million FCFA** |
| Exchange rate used | 575 FCFA = $1 |

---

## Sources
Domain availability and price checked live against Vercel Domains, 2026-08-29.

- Zoho Mail pricing — https://www.zoho.com/mail/zohomail-pricing.html
- Vercel pricing — https://costbench.com/software/developer-tools/vercel/
- Render pricing — https://costbench.com/software/developer-tools/render/
- Supabase pricing — https://costbench.com/software/database-as-service/supabase/
- Resend pricing — https://automationatlas.io/answers/resend-pricing-explained-2026/
- Namecheap .com pricing — https://priceworld.com/domains/namecheap/
- USD/XAF rate — https://www.xe.com/en-us/currencyconverter/convert/?Amount=1&From=USD&To=XAF
- Fapshi fees — https://www.fapshi.com/en
- Mobile money gateway fees in Cameroon — https://payatlas.com/countries/cameroon-cm
- Orange Business Cameroun, Flex+ — https://business.orange.cm/fr/forfaits-appels/flex-plus.html
- Orange Cameroun internet — https://www.orange.cm/fr/internet.html
- MTN Cameroon business offers (My Office / Elite Corporate) — https://www.digitalbusiness.africa/cameroun-mtn-lance-deux-nouvelles-offres-en-direction-des-entreprises/
- MTN Cameroon internet bundles — https://lemobileaukamer.com/les-forfaits-internet-mobile-3g-4g-chez-mtn-cameroon/
- Bulk SMS rates in Cameroon — https://www.mediasystem.cm/blog/mtn-orange-ou-camtel-quel-operateur-pour-vos-sms-pro
