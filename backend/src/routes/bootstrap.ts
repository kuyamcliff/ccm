import { Router } from "express";
import { db } from "../db.js";

export const bootstrapRouter = Router();

/**
 * Everything the browser needs before it can draw anything.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The site opened with three separate round trips before a single photograph
 * was even requested:
 *
 *   1. GET /api/auth/me        (who is this)
 *   2. GET /api/site-settings  (is the site open, what is the address)
 *   3. GET /api/popular        (what to put in the hero)
 *
 * The first two ran in parallel but the page refused to render until both had
 * landed, and the third could not start until the home page had mounted, which
 * could not happen until the first two were done. Only then did the browser
 * learn the URLs of the hero photographs and start downloading them.
 *
 * On a mobile connection in Buea, against a Render instance that may have been
 * asleep, that is several seconds of black screen before the first image byte is
 * asked for. The customer's description was "I have to wait for all the pictures
 * to load", and this was most of the reason.
 *
 * One request instead of three. It is the same data, from the same tables, with
 * no new access rules: `user` is exactly what /api/auth/me returns and is null
 * for a visitor, and the rest is already public.
 *
 * ── Why the settings are not filtered here ─────────────────────────────────
 *
 * `site_settings` is served whole by /api/site-settings and every value in it is
 * public by design: the phone number, the address, the hours, the deposit, and
 * `site_config_json`, which the customer site has to read to know which features
 * are switched on. Filtering here and not there would be a difference with no
 * security behind it, and the kind that rots.
 */
bootstrapRouter.get("/", async (req, res) => {
  const [settingRows, topItems, topReview] = await Promise.all([
    db.prepare("SELECT key, value FROM site_settings").all() as Promise<{ key: string; value: string }[]>,

    /* The same three dishes the home page has always shown, and the same order,
       so the hero does not change character just because it is now fetched from
       a different route. */
    db
      .prepare(
        `SELECT id, category, name, description, price_fcfa, price_label, image_url, sold_out, dietary_tags
         FROM menu_items WHERE is_active = 1 ORDER BY price_fcfa DESC LIMIT 3`
      )
      .all(),

    db
      .prepare(
        `SELECT rv.id, rv.rating, rv.text, rv.updated_at, u.name as author
         FROM reviews rv JOIN users u ON rv.user_id = u.id
         ORDER BY rv.rating DESC, rv.updated_at DESC LIMIT 1`
      )
      .get(),
  ]);

  const settings: Record<string, string> = {};
  for (const row of settingRows) settings[row.key] = row.value;

  /*
   * `attachUser` has already run and either put a user on the request or not.
   * A visitor is `null` here rather than a 401, because this endpoint is not
   * asking "are you signed in", it is asking "what should I draw" and the answer
   * for a visitor is a perfectly good page.
   */
  const user = req.user
    ? { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }
    : null;

  /*
   * Never stored. Not by a proxy, not by the browser's own cache.
   *
   * This used to be `private, max-age=5`, reasoning that five seconds was long
   * enough to absorb a burst of tabs from one TikTok link and short enough that
   * maintenance mode still reached everybody quickly. Both of those are true and
   * neither survives what it actually did: this body carries `user`, so for five
   * seconds after any request the browser served its own copy to whoever asked
   * next.
   *
   * What that looked like in the product: sign in, land on the next screen, and
   * the app reads a bootstrap cached moments earlier while signed out. The tab
   * bar drops back to the signed-out set, and `state/basket.tsx` sees the owner
   * of the basket change from an account to nobody and empties it, which is
   * exactly what it is supposed to do when one person signs out and another
   * signs in on the same phone. The food somebody had just chosen disappeared
   * between the menu and the checkout.
   *
   * The same reasoning already keeps this route out of the service worker's
   * cache list. It applies with just as much force to the cache built into the
   * browser, which is the one nothing in this codebase can reach into and clear.
   *
   * The burst this was meant to absorb is handled where it should be: the app
   * keeps its own copy of the payload in localStorage (`lib/boot.ts`), which it
   * can and does clear on sign-out.
   */
  res.setHeader("Cache-Control", "no-store");
  res.json({ user, settings, topItems, topReview: topReview ?? null });
});
