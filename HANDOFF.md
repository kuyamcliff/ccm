# Cam Chop Meat website: owner's guide

This is a plain website. Three pages, no monthly software costs, no accounts that can
expire. Anyone who can edit a text file can maintain it.

## What was built
- index.html: the home page. Big headline, the four things you sell, your story, directions teaser.
- menu.html: the menu with prices and "Order this" buttons that open WhatsApp with the order already typed.
- contact.html: address, hours, phone, WhatsApp, TikTok and a map.
- css/style.css: all the colors and layout. The colors live at the top of the file.
- js/main.js: small touches (mobile menu button, sections fading in as you scroll).

## Before you launch: replace the placeholders
Open each file in Notepad and use "Find" to locate these:

1. **WhatsApp number.** Search for `237000000000` and replace every one with the real
   number in international format without the plus sign. Example: if the number is
   +237 6 70 12 34 56, write `237670123456`. It appears in all three HTML files.
2. **Phone number.** In contact.html, search for `+237 000 000 000` and replace it.
3. **Opening hours.** Search for `midday till late` in all three files and write the
   real hours.
4. **Photos.** The dish cards on the home page currently show drawn art. To use real
   photos, take them in similar light (evening, near the fire, phone camera is fine),
   then replace each `<div class="dish-art">...</div>` block with
   `<img src="images/your-photo.jpg" alt="describe the dish">` and put the photos in
   a new `images` folder. Keep photos under about 300 KB each so the page stays fast
   on mobile data (tinypng.com shrinks them for free).
5. **Menu prices.** Edit the text inside `<span class="price">` in menu.html any time
   prices change. It is plain text.

## How to put it online, free
1. Make a free account at netlify.com (or use GitHub Pages if you have GitHub).
2. On Netlify: "Add new site", then "Deploy manually", then drag the whole
   "Camchop Meat" folder onto the page. The site is live in about a minute at a free
   netlify.app address.
3. When ready, buy a domain (about 10,000 to 15,000 FCFA per year, e.g. camchopmeat.com
   from Namecheap or Hostinger) and connect it in Netlify's "Domain settings". Netlify
   gives you the padlock (SSL) automatically.

## What is real vs what needs confirming
Already sourced and correct: the location (opposite the Survey School, Clerks
Quarters), the TikTok account (@cam.chop.meat), and the price anchors (food from
2,500 FCFA, drinks from 1,000 FCFA). Confirm with the kitchen: exact prices, hours,
the sides list, and whether fish or soya should be added to the menu.

## If something breaks
The whole site is in a git history. Every working version is saved. Ask anyone with
basic git knowledge to run `git log` in the folder and restore any earlier version
with one command. Nothing here can "crash": there is no server code, no database.
