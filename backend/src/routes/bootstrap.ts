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

  /* Cached for a few seconds at most. Long enough to absorb a burst of tabs
     opening from one TikTok link, short enough that flipping the site to
     maintenance mode reaches everybody almost at once. `private` because the
     body carries who is signed in and must never sit in a shared cache. */
  res.setHeader("Cache-Control", "private, max-age=5");
  res.json({ user, settings, topItems, topReview: topReview ?? null });
});
