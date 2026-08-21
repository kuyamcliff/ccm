import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MenuItem } from "~/lib/api";
import { priceBasket } from "~/lib/basketPricing";
import type { BasketLine, PricedBasket } from "~/lib/basketPricing";
import { useSession } from "~/state/session";

/**
 * The takeaway basket.
 *
 * Kept in localStorage because people build an order over several visits to
 * the menu, and losing it to an accidental back gesture is the fastest way to
 * lose the order entirely. Only the item id and quantity are stored — prices
 * and names are re-read from the menu on load, so a price change on the server
 * can never be undercut by a stale basket, and the server prices it again
 * anyway when the order is placed.
 *
 * ── Whose basket it is ──────────────────────────────────────────────────────
 *
 * It used to belong to the browser, which meant it outlived the account that
 * filled it: sign in, choose food, sign out, and the next person to open the
 * site was looking at somebody else's order. Storing the lines beside the id of
 * the account that made them is what fixes it. A basket is handed back only to
 * whoever put it there, and emptied the moment the account it belongs to signs
 * out or is replaced by another.
 *
 * A signed-out basket is stored under `null` and is deliberately kept when that
 * guest signs in. Choosing food and then signing in to pay for it is the normal
 * way to order here, and throwing the basket away at the door would punish
 * exactly that.
 */

const STORAGE_KEY = "ccm.basket.v2";

/* Superseded by v2, which records who a basket belongs to. Left behind it would
   be an orphan nobody reads and nobody clears, so it goes on first sight. */
const LEGACY_KEY = "ccm.basket.v1";

export type { BasketLine, PricedLine } from "~/lib/basketPricing";

/** What is actually written down: the lines, and whose they are. */
interface StoredBasket {
  /** The account that filled it, or null for a guest. */
  owner: number | null;
  lines: BasketLine[];
}

interface BasketValue {
  lines: BasketLine[];
  count: number;
  add: (id: number, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  /** Joins the basket to a menu, dropping anything no longer on sale. */
  price: (menu: MenuItem[]) => PricedBasket;
}

const BasketContext = createContext<BasketValue | null>(null);

function parseLines(value: unknown): BasketLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const id = Number(record.id);
    const qty = Number(record.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1) return [];
    return [{ id, qty: Math.min(qty, 20) }];
  });
}

const EMPTY: StoredBasket = { owner: null, lines: [] };

function read(): StoredBasket {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
    const record = parsed as Record<string, unknown>;
    const owner = Number(record.owner);
    return {
      owner: Number.isInteger(owner) && owner > 0 ? owner : null,
      lines: parseLines(record.lines),
    };
  } catch {
    return EMPTY;
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const stored = useRef<StoredBasket | null>(null);
  if (stored.current === null) stored.current = read();

  const { user, ready } = useSession();

  const [lines, setLines] = useState<BasketLine[]>(stored.current.lines);

  /* Who the lines in state belong to. It starts as whoever the stored basket
     says, so the check below is comparing the basket on screen against the
     account actually signed in, not against whatever the last render saw. */
  const owner = useRef<number | null>(stored.current.owner);

  /*
   * Hand the basket back to its owner, or empty it.
   *
   * Waits for `ready`, because until the first "who am I" comes back every
   * session looks signed out, and clearing on that would throw away the basket
   * of anyone who reloaded the page mid-order.
   *
   * A basket owned by nobody is a guest's and survives them signing in. One
   * owned by an account is emptied as soon as that account is not the one here
   * any more, which covers signing out, being signed out by a 401, and a second
   * person signing in on the same phone.
   *
   * The cost of waiting is that a browser reopened on somebody else's basket
   * shows it for as long as that first request takes. Taken deliberately: the
   * alternative is holding every basket back until the session answers, which
   * blanks the basket on every load for everyone to hide a few menu item names
   * for one request. It corrects itself here and the storage is emptied with
   * it, so it happens at most once.
   */
  useEffect(() => {
    if (!ready) return;
    const current = user?.id ?? null;
    if (owner.current !== null && owner.current !== current) setLines([]);
    owner.current = current;
  }, [ready, user?.id]);

  useEffect(() => {
    /* Not written until the session is known, so the pause before the first
       "who am I" cannot stamp a signed-in guest's basket as a guest's. */
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: user?.id ?? null, lines }));
    } catch {
      /* Private browsing. The basket just will not outlive the tab. */
    }
  }, [lines, ready, user?.id]);

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

  /* The arithmetic itself lives in `lib/basketPricing`, where it can be tested
     without a React tree. See the note there about `is_active`. */
  const price = useCallback((menu: MenuItem[]) => priceBasket(lines, menu), [lines]);

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
