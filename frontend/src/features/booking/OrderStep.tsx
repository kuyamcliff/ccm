import { useEffect, useMemo } from "react";
import { api } from "~/lib/api";
import type { MenuItem } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { Icon } from "~/ui/Icon";
import { Money } from "~/ui/Bits";
import { ErrorState, Skeleton } from "~/ui/Feedback";

/**
 * Choosing food while booking a table.
 *
 * This is not the takeaway basket and deliberately does not behave like one:
 * nothing here is being bought to carry away, it is being asked for in advance
 * so the grill can start before the party sits down. So it stays on the booking
 * screen, it keeps its own count, and it never touches the takeaway basket in
 * localStorage — a half-finished booking must not put dishes in somebody's
 * takeaway order.
 *
 * Anything priced by weight is left out. Its price is settled at the counter
 * once it is weighed, which cannot be paid for ahead.
 */

export type Basket = Record<number, number>;

export function basketLines(basket: Basket): { id: number; qty: number }[] {
  return Object.entries(basket)
    .map(([id, qty]) => ({ id: Number(id), qty }))
    .filter((line) => line.qty > 0);
}

export function basketTotal(basket: Basket, menu: MenuItem[] | null): number {
  if (!menu) return 0;
  const prices = new Map(menu.map((item) => [item.id, item.price_fcfa ?? 0]));
  return basketLines(basket).reduce((sum, line) => sum + (prices.get(line.id) ?? 0) * line.qty, 0);
}

export function basketCount(basket: Basket): number {
  return basketLines(basket).reduce((sum, line) => sum + line.qty, 0);
}

interface Props {
  basket: Basket;
  onChange: (next: Basket) => void;
  /** Handed up so the step above can price the summary without refetching. */
  onMenuLoaded: (menu: MenuItem[]) => void;
}

export function OrderStep({ basket, onChange, onMenuLoaded }: Props) {
  const menu = useResource(() => api.site.menu(), []);

  const orderable = useMemo(() => (menu.data ?? []).filter((item) => item.price_fcfa != null), [menu.data]);

  /* Handing the menu up is a state change in the step above, so it happens
     after this render rather than inside it. Doing it in the useMemo below
     drew React's "cannot update a component while rendering a different
     component" warning, which is a warning about a real hazard: an update
     queued mid-render is not guaranteed to be kept. */
  useEffect(() => {
    if (orderable.length > 0) onMenuLoaded(orderable);
  }, [orderable, onMenuLoaded]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of orderable) {
      const bucket = map.get(item.category);
      if (bucket) bucket.push(item);
      else map.set(item.category, [item]);
    }
    return [...map.entries()];
  }, [orderable]);

  function setQty(id: number, qty: number) {
    const next = { ...basket };
    if (qty <= 0) delete next[id];
    else next[id] = Math.min(20, qty);
    onChange(next);
  }

  if (menu.loading) {
    return (
      <div className="stack">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} height="4rem" radius="var(--r-md)" />
        ))}
      </div>
    );
  }

  if (menu.error) return <ErrorState error={menu.error} onRetry={menu.reload} />;

  return (
    <div className="stack stack--loose">
      {grouped.map(([category, items]) => (
        <section key={category} className="stack">
          <h2 className="label">{category}</h2>
          <div className="pick-list">
            {items.map((item) => {
              const qty = basket[item.id] ?? 0;
              return (
                <div key={item.id} className="pick" data-chosen={qty > 0}>
                  <div className="pick__body">
                    <p className="pick__name">{item.name}</p>
                    <p className="pick__price mono">
                      <Money value={item.price_fcfa ?? 0} />
                    </p>
                  </div>

                  {qty > 0 ? (
                    <div className="pick__stepper">
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        aria-label={`One fewer ${item.name}`}
                        onClick={() => setQty(item.id, qty - 1)}
                      >
                        <Icon name="minus" size={16} />
                      </button>
                      <span className="pick__qty mono" aria-live="polite">
                        {qty}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        aria-label={`One more ${item.name}`}
                        onClick={() => setQty(item.id, qty + 1)}
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn--sm" onClick={() => setQty(item.id, 1)}>
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {grouped.length === 0 ? (
        <p className="muted">Nothing is priced for ordering ahead right now. You can order at the table.</p>
      ) : null}
    </div>
  );
}
