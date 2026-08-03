import { db } from "../db.js";

/*
 * Turning "what the guest tapped" into "what it costs".
 *
 * Two paths now order food: a takeaway, and food chosen while booking a table.
 * They agree on the stored shape — a JSON array of `{ id, name, price, qty }` —
 * so the kitchen board, the receipt and the console all read one thing.
 *
 * The rule that matters: prices come out of the database, never out of the
 * request body. The name is copied in alongside the price so a dish renamed or
 * withdrawn next month does not rewrite a receipt somebody already holds.
 */

export interface OrderLine {
  id: number;
  name: string;
  price: number;
  qty: number;
}

export interface PricedItems {
  lines: OrderLine[];
  total: number;
}

/** A quantity a person could plausibly mean. */
const MAX_QTY = 20;

/** Enough for a large party; past this it is an event, not a booking. */
const MAX_DISTINCT_ITEMS = 40;

export class OrderItemsError extends Error {}

/**
 * Prices a chosen basket against the live menu.
 *
 * Throws `OrderItemsError` with a message meant for the guest when something
 * they picked is no longer orderable — which is the honest outcome, since the
 * alternative is quietly charging them for a different basket than they chose.
 */
export async function priceChosenItems(raw: unknown): Promise<PricedItems> {
  if (raw === undefined || raw === null) return { lines: [], total: 0 };
  if (!Array.isArray(raw)) throw new OrderItemsError("That basket was not something we could read.");
  if (raw.length === 0) return { lines: [], total: 0 };
  if (raw.length > MAX_DISTINCT_ITEMS) {
    throw new OrderItemsError("That is more separate dishes than we can take on one booking.");
  }

  const menuItems = (await db
    .prepare("SELECT id, name, price_fcfa FROM menu_items WHERE is_active = 1 AND price_fcfa IS NOT NULL")
    .all()) as { id: number; name: string; price_fcfa: number }[];
  const menu = new Map(menuItems.map((m) => [m.id, m]));

  /* Two taps on the same dish are one line with a quantity of two, not two
     lines — otherwise the receipt lists it twice and the kitchen reads it as
     two separate orders. */
  const merged = new Map<number, number>();
  for (const entry of raw as { id: unknown; qty: unknown }[]) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id)) throw new OrderItemsError("One of those items was not something we sell.");
    const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(entry?.qty)) || 1));
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) ?? 0) + qty));
  }

  let total = 0;
  const lines: OrderLine[] = [];
  for (const [id, qty] of merged) {
    const item = menu.get(id);
    if (!item || !item.price_fcfa) {
      throw new OrderItemsError("One of those items is no longer available. Take it off and try again.");
    }
    total += item.price_fcfa * qty;
    lines.push({ id: item.id, name: item.name, price: item.price_fcfa, qty });
  }

  return { lines, total };
}

/** Reads back what was stored, tolerating a row written before this existed. */
export function parseOrderLines(json: string | null | undefined): OrderLine[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is OrderLine =>
        l && typeof l.name === "string" && Number.isFinite(l.price) && Number.isFinite(l.qty)
    );
  } catch {
    return [];
  }
}
