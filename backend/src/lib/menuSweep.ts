import { db } from "../db.js";

/**
 * Putting sold-out dishes back on the menu.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 *
 * When the goat runs out at nine, somebody marks it sold out. Tomorrow there is
 * goat again, and the only thing standing between the restaurant and a menu that
 * lies is somebody remembering to un-mark it. Nobody remembers. The dish stays
 * struck through for a week and the kitchen sells it over the counter anyway,
 * which is how a menu stops being trusted.
 *
 * So selling out has an expiry. Marking a dish sold out sets `sold_out_until` to
 * the next opening (`lib/soldOut.ts`), and this clears anything past it.
 *
 * ── Why a lazy sweep and not a scheduled job ───────────────────────────────
 *
 * This runs at the top of the two reads that could show a stale value: the
 * public menu and the console's menu. That is deliberate.
 *
 * A scheduled job would need a scheduler, would need to stay reachable, and
 * would fail silently at exactly the moment nobody was looking. This cannot: the
 * only way to see a wrongly sold-out dish is to read the menu, and reading the
 * menu is what fixes it. It costs one indexed UPDATE against a table of a few
 * dozen rows, on a request that is already talking to the database.
 *
 * `sold_out_until IS NULL` is left alone on purpose. That is a dish somebody
 * took off by hand with no return date, and inventing one would put something
 * back on sale that the kitchen cannot make.
 */
export async function clearExpiredSoldOut(): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE menu_items
            SET sold_out = 0, sold_out_until = NULL
          WHERE sold_out = 1
            AND sold_out_until IS NOT NULL
            AND sold_out_until <= now_text()`
      )
      .run();
  } catch (err) {
    /* Never let tidying up break the menu. A dish that stays sold out an hour
       too long is a far smaller problem than a menu that will not load. */
    console.error("[menuSweep] clearing expired sold-out dishes failed", err);
  }
}
