# Cam Chop Meat website plan

## The business (researched 2026-07-19)
Cam Chop Meat is a grilled meat restaurant in Buea, Cameroon, opposite the Survey School
in Clerks Quarters. Known for grilled chicken, pork and goat over charcoal, plus matango
(palm wine) and drinks. Food from about 2,500 FCFA, drinks from about 1,000 FCFA.
Customer word of mouth runs through TikTok (@cam.chop.meat) and local recommendation
lists. No official website exists.

## Agreed scope (user answers, 2026-07-19)
- Full static site: home, menu with prices, location and contact.
- Ordering happens through WhatsApp links with prefilled messages.
- Design: smoky grill-house. Charcoal blacks, ember orange, flame red.
- Contact number, hours and photos are PLACEHOLDERS the owner swaps in later.

## Stack
Plain HTML, CSS and a little JavaScript. No build step, no backend, no framework.
Reason: a three page restaurant site does not need one. Anything that can serve
static files (Netlify, GitHub Pages, any shared host) can host this for free.

## Pages
1. index.html: hero, what we grill, about, location teaser.
2. menu.html: full menu grouped by grill / sides / drinks, order buttons.
3. contact.html: address, directions, hours, WhatsApp, TikTok, map embed.

## Design direction (one sentence)
Butcher-shop signage meets night grill: heavy slab headlines, charcoal surfaces,
ember gradients, and a grill-grate motif, lit like the fire is just off screen.
Fonts: Alfa Slab One (display) + Karla (body), via Google Fonts.
