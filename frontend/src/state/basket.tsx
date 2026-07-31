import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MenuItem } from "~/lib/api";

/**
 * The collection basket.
 *
 * Kept in localStorage because people build an order over several visits to
 * the menu, and losing it to an accidental back gesture is the fastest way to
 * lose the order entirely. Only the item id and quantity are stored — prices
 * and names are re-read from the menu on load, so a price change on the server
 * can never be undercut by a stale basket, and the server prices it again
 * anyway when the order is placed.
 */

const STORAGE_KEY = "ccm.basket.v1";

export interface BasketLine {
  id: number;
  qty: number;
}

export interface PricedLine extends BasketLine {
  item: MenuItem;
  lineTotal: number;
}

interface BasketValue {
  lines: BasketLine[];
  count: number;
  add: (id: number, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  /** Joins the basket to a menu, dropping anything no longer on sale. */
  price: (menu: MenuItem[]) => { lines: PricedLine[]; subtotal: number; dropped: number };
}

const BasketContext = createContext<BasketValue | null>(null);

function read(): BasketLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const id = Number(record.id);
      const qty = Number(record.qty);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1) return [];
      return [{ id, qty: Math.min(qty, 20) }];
    });
  } catch {
    return [];
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BasketLine[]>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* Private browsing. The basket just will not outlive the tab. */
    }
  }, [lines]);

  const add = useCallback((id: number, qty = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.id === id);
      if (!existing) return [...current, { id, qty: Math.min(qty, 20) }];
      return current.map((line) => (line.id === id ? { ...line, qty: Math.min(line.qty + qty, 20) } : line));
    });
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setLines((current) =>
      qty <= 0
        ? current.filter((line) => line.id !== id)
        : current.map((line) => (line.id === id ? { ...line, qty: Math.min(qty, 20) } : line))
    );
  }, []);

  const remove = useCallback((id: number) => setLines((current) => current.filter((line) => line.id !== id)), []);

  const clear = useCallback(() => setLines([]), []);

  const price = useCallback(
    (menu: MenuItem[]) => {
      const byId = new Map(menu.map((item) => [item.id, item]));
      const priced: PricedLine[] = [];
      let dropped = 0;

      for (const line of lines) {
        const item = byId.get(line.id);
        // A dish taken off the menu, or one priced by the market rather than
        // by the plate, cannot be ordered ahead.
        if (!item || item.is_active !== 1 || item.price_fcfa === null) {
          dropped += 1;
          continue;
        }
        priced.push({ ...line, item, lineTotal: item.price_fcfa * line.qty });
      }

      return { lines: priced, subtotal: priced.reduce((sum, line) => sum + line.lineTotal, 0), dropped };
    },
    [lines]
  );

  const value = useMemo<BasketValue>(
    () => ({
      lines,
      count: lines.reduce((sum, line) => sum + line.qty, 0),
      add,
      setQty,
      remove,
      clear,
      price,
    }),
    [lines, add, setQty, remove, clear, price]
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketValue {
  const value = useContext(BasketContext);
  if (!value) throw new Error("useBasket must be used inside BasketProvider");
  return value;
}
