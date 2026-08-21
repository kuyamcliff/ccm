import type { MenuItem } from "~/lib/api";

/**
 * Joining a basket to a menu.
 *
 * Pulled out of `state/basket.tsx` so it can be tested without a React tree,
 * the same way `lib/loyalty.ts` holds the points arithmetic away from the
 * screens that show it. It exists as its own file because of the bug below,
 * which was invisible in a provider and is one assertion here.
 */

export interface BasketLine {
  id: number;
  qty: number;
}

export interface PricedLine extends BasketLine {
  item: MenuItem;
  lineTotal: number;
}

export interface PricedBasket {
  lines: PricedLine[];
  subtotal: number;
  /** How many lines could not be priced and were taken out. */
  dropped: number;
}

/**
 * Whether a dish can still be ordered ahead.
 *
 * ── The bug this encodes ────────────────────────────────────────────────────
 *
 * This used to read `item.is_active !== 1`, which looks right and emptied every
 * basket in the product. The public menu does not return `is_active` at all
 * (see PUBLIC_COLUMNS in the server's `routes/menu.ts`) because it already
 * filters on it, so the field is `undefined` for every dish a customer can
 * see, `undefined !== 1` is true, and every line was dropped at the checkout.
 * The basket badge counted them, the order page said they were no longer on the
 * menu, and the food vanished between one screen and the next.
 *
 * Being in the list is the active check. The field is only meaningful on the
 * console's own fetch, which is why it is compared against 0 rather than 1:
 * absent must mean "fine", not "gone".
 */
export function orderable(item: MenuItem): boolean {
  if (item.is_active === 0) return false;
  if (item.sold_out === 1) return false;
  /* Priced by the market rather than by the plate. The server refuses these
     too: there is no amount to charge ahead of weighing it. */
  return item.price_fcfa != null;
}

export function priceBasket(lines: BasketLine[], menu: MenuItem[]): PricedBasket {
  const byId = new Map(menu.map((item) => [item.id, item]));
  const priced: PricedLine[] = [];
  let dropped = 0;

  for (const line of lines) {
    const item = byId.get(line.id);
    if (!item || !orderable(item)) {
      dropped += 1;
      continue;
    }
    priced.push({ ...line, item, lineTotal: item.price_fcfa! * line.qty });
  }

  return {
    lines: priced,
    subtotal: priced.reduce((sum, line) => sum + line.lineTotal, 0),
    dropped,
  };
}
