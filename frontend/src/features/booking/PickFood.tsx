import { useMemo, useState } from "react";
import type { MenuItem } from "~/lib/api";
import type { BasketLine } from "~/lib/basketPricing";
import { orderable } from "~/lib/basketPricing";
import { itemMatches, tokens } from "~/lib/search";
import { Icon } from "~/ui/Icon";
import { Button } from "~/ui/Button";
import { Money } from "~/ui/Bits";
import { Counter } from "~/ui/Field";
import { EmptyState, SkeletonRows } from "~/ui/Feedback";
import { usePress } from "~/ui/press";
import { useCopy } from "~/state/locale";

/**
 * Choosing food while booking a table.
 *
 * The server has been able to take an order alongside a booking since the
 * multi-table work: `POST /api/reservations` prices an `items` array against
 * the live menu, freezes it onto the row, and the deposit payment charges the
 * food with it. Nothing in the app ever sent that array, so the whole path was
 * dead and a guest's only way to eat what they had planned was to say it out
 * loud on the night.
 *
 * Two decisions worth writing down.
 *
 *   **It is not the takeaway basket.** They look alike and they are not the
 *   same thing: a basket is an order somebody collects, this is food waiting at
 *   a table on Friday. Sharing the store would mean an abandoned booking
 *   silently filling the takeaway basket, and a takeaway basket silently
 *   becoming part of a booking's bill. The choice lives in the booking flow and
 *   dies with it.
 *
 *   **Only what can actually be ordered ahead is listed.** Sold out tonight and
 *   priced by weight are both struck through on the menu, where the point is to
 *   say "we do this, just not now". Here the point is to pick, and a row that
 *   cannot be picked is a row in the way. The server refuses both regardless.
 */

const ALL = "__all";

export function PickFood({
  menu,
  loading,
  chosen,
  onChange,
}: {
  menu: MenuItem[];
  loading: boolean;
  chosen: BasketLine[];
  onChange: (next: BasketLine[]) => void;
}) {
  const { c } = useCopy();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);

  const items = useMemo(() => menu.filter(orderable), [menu]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) if (item.category && !seen.includes(item.category)) seen.push(item.category);
    return seen;
  }, [items]);

  const shown = useMemo(() => {
    const needles = tokens(query);
    return items.filter((item) => {
      if (category !== ALL && item.category !== category) return false;
      if (needles.length === 0) return true;
      return itemMatches({ haystack: `${item.name} ${item.description} ${item.category}` }, needles);
    });
  }, [items, category, query]);

  const qtyOf = (id: number) => chosen.find((line) => line.id === id)?.qty ?? 0;

  const setQty = (id: number, qty: number) => {
    if (qty <= 0) {
      onChange(chosen.filter((line) => line.id !== id));
      return;
    }
    onChange(
      chosen.some((line) => line.id === id)
        ? chosen.map((line) => (line.id === id ? { ...line, qty } : line))
        : [...chosen, { id, qty }]
    );
  };

  if (loading && items.length === 0) return <SkeletonRows count={6} />;

  /* Nothing on the menu can be ordered ahead tonight: everything is sold out,
     or the whole list is priced at the counter. Said in one line rather than
     drawn as an empty state, because this step is optional anyway. */
  if (items.length === 0) {
    return <p className="lead muted">{c.book.preorderNone}</p>;
  }

  return (
    <div className="stack">
      <div className="menu__search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={c.menu.search}
          aria-label={c.menu.search}
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label={c.menu.clearSearch}>
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>

      {categories.length > 1 ? (
        <div className="rail rail--chips" data-scroller="">
          <div className="rail__track">
            <FoodChip label={c.menu.all} on={category === ALL} onSelect={() => setCategory(ALL)} />
            {categories.map((name) => (
              <FoodChip key={name} label={name} on={category === name} onSelect={() => setCategory(name)} />
            ))}
          </div>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          icon="search"
          title={c.menu.noMatch}
          action={
            <Button
              tone="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory(ALL);
              }}
            >
              {c.menu.clearSearch}
            </Button>
          }
        />
      ) : (
        <div className="rows">
          {shown.map((item) => {
            const qty = qtyOf(item.id);
            return (
              <div key={item.id} className="row">
                <span className="grow stack stack--tight">
                  <span className="food-pick__name">{item.name}</span>
                  <Money value={item.price_fcfa!} size="fine" />
                </span>
                {qty > 0 ? (
                  <Counter value={qty} onChange={(next) => setQty(item.id, next)} min={0} max={20} label={item.name} />
                ) : (
                  <Button
                    size="sm"
                    tone="default"
                    onClick={() => setQty(item.id, 1)}
                    aria-label={`${c.menu.add} ${item.name}`}
                  >
                    {c.menu.add}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FoodChip({ label, on, onSelect }: { label: string; on: boolean; onSelect: () => void }) {
  const press = usePress();
  return (
    <button type="button" className="chip" data-on={on ? "true" : undefined} onClick={onSelect} {...press.pressProps}>
      {label}
    </button>
  );
}
