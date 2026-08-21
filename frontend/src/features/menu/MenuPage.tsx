import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { MenuItem } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { parseTags } from "~/lib/format";
import { itemMatches, tokens } from "~/lib/search";
import { Icon } from "~/ui/Icon";
import { Img } from "~/ui/Img";
import { Button, LinkButton } from "~/ui/Button";
import { Money, Badge } from "~/ui/Bits";
import { Sheet } from "~/ui/Sheet";
import { Counter } from "~/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "~/ui/Feedback";
import { usePress } from "~/ui/press";
import { transitionName } from "~/ui/motion";
import { useBasket } from "~/state/basket";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * The menu.
 *
 * Dense rows with a small square thumbnail, the name and its description on the
 * left, the price on the right, and one Add button. That is the whole layout,
 * repeated. A menu is a list and it should look like a list: the previous
 * version drew each dish as a bordered card, which turned twenty dishes into
 * twenty boxes and a page four screens long.
 *
 * Three things earn their keep here.
 *
 *   **The category rail sticks.** Twenty dishes on a phone is a lot of scrolling
 *   and the thing people actually want is "show me the chicken".
 *
 *   **Sold out is struck through, not hidden.** When the goat runs out the dish
 *   stays on the page with a line through it and a disabled Add. Removing it
 *   entirely makes people think they misremembered the menu; showing it says
 *   "we do this, just not tonight", which is also true and is better for coming
 *   back tomorrow. The server refuses a sold-out item at checkout regardless.
 *
 *   **Tapping a row opens a sheet, not a page.** The photograph morphs from the
 *   thumbnail into the sheet through a named view transition, so it reads as the
 *   same object getting bigger rather than as a new screen.
 */

const ALL = "__all";

export function MenuPage() {
  const { c } = useCopy();
  const { siteConfig } = useVenue();
  const basket = useBasket();

  const { data, loading, error, reload } = useQuery(K.menu, () => api.site.menu(), {
    persist: true,
    staleMs: 2 * 60 * 1000,
  });

  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<MenuItem | null>(null);

  const items = useMemo(() => data ?? [], [data]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) if (item.category && !seen.includes(item.category)) seen.push(item.category);
    return seen;
  }, [items]);

  const shown = useMemo(() => {
    /* Tokenised once for the whole list rather than per row. The matcher is
       prefix-based and typo-tolerant, so "chiken" still finds the chicken. */
    const needles = tokens(query);
    return items.filter((item) => {
      if (category !== ALL && item.category !== category) return false;
      if (needles.length === 0) return true;
      return itemMatches({ haystack: `${item.name} ${item.description} ${item.category}` }, needles);
    });
  }, [items, category, query]);

  /* Grouped only when nothing is filtering, so a search result is one flat list
     rather than a set of headings with one row under each. */
  const groups = useMemo(() => {
    if (category !== ALL || query.trim()) return [{ name: null as string | null, items: shown }];
    return categories.map((name) => ({ name, items: shown.filter((item) => item.category === name) }));
  }, [shown, categories, category, query]);

  if (error) {
    return (
      <div className="page section">
        <ErrorState error={error} intent="load" onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="menu">
      <header className="page section--tight menu__head">
        <h1 className="display display--xl">{c.menu.title}</h1>
      </header>

      {/* Search and the category rail travel together and stick to the top, so
          both are one thumb-reach away wherever you are in the list. */}
      <div className="menu__filters">
        <div className="page">
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
        </div>

        {categories.length > 1 ? (
          <div className="rail rail--chips rail--bleed" data-scroller="">
            <div className="rail__track">
              <CategoryChip label={c.menu.all} on={category === ALL} onSelect={() => setCategory(ALL)} />
              {categories.map((name) => (
                <CategoryChip
                  key={name}
                  label={name}
                  on={category === name}
                  onSelect={() => setCategory(name)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="page section--tight">
        {loading ? (
          <SkeletonRows count={7} />
        ) : shown.length === 0 ? (
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
          groups.map((group) => (
            <section key={group.name ?? "all"} className="menu__group">
              {group.name ? <h2 className="label menu__groupname">{group.name}</h2> : null}
              <div className="rows rows--inset menu__rows">
                {group.items.map((item) => (
                  <DishRow key={item.id} item={item} onOpen={() => setOpen(item)} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* The bar that appears once there is something in the basket. Pinned
          above the tab bar, where the thumb already is. */}
      {siteConfig.features.ordering && basket.count > 0 ? (
        <div className="menu__cart">
          <LinkButton to="/order" tone="primary" block iconEnd="arrow-right">
            {c.menu.viewBasket}
            <span className="menu__cartcount">{basket.count}</span>
          </LinkButton>
        </div>
      ) : null}

      <DishSheet item={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function CategoryChip({ label, on, onSelect }: { label: string; on: boolean; onSelect: () => void }) {
  const press = usePress();
  return (
    <button type="button" className="chip" data-on={on ? "true" : undefined} onClick={onSelect} {...press.pressProps}>
      {label}
    </button>
  );
}

/* ── One dish ───────────────────────────────────────────────────────────────*/

function DishRow({ item, onOpen }: { item: MenuItem; onOpen: () => void }) {
  const { c } = useCopy();
  const { siteConfig } = useVenue();
  const basket = useBasket();
  const press = usePress();

  const soldOut = item.sold_out === 1;
  const inBasket = basket.lines.find((line) => line.id === item.id)?.qty ?? 0;
  const canOrder = siteConfig.features.ordering && !soldOut && item.price_fcfa != null;

  return (
    <div className="row dish-row" data-sold-out={soldOut ? "true" : undefined}>
      <button
        type="button"
        className="dish-row__open"
        onClick={onOpen}
        aria-label={item.name}
        {...press.pressProps}
      >
        <Img
          src={item.image_url}
          alt=""
          ratio={1}
          radius="var(--r-sm)"
          className="dish-row__photo"
          /* The thumbnail and the sheet's photograph share this name, so the
             browser morphs one into the other instead of cross-fading the page
             over it. */
          style={transitionName("dish", item.id)}
        />
        <span className="dish-row__text">
          <span className="dish-row__name">
            {item.name}
            {soldOut ? <Badge tone="neutral">{c.menu.soldOutToday}</Badge> : null}
          </span>
          {item.description ? <span className="fine muted clip-2">{item.description}</span> : null}
          <span className="dish-row__price">
            {item.price_fcfa != null ? (
              <Money value={item.price_fcfa} size="fine" />
            ) : (
              <span className="fine">{item.price_label || c.menu.byWeight}</span>
            )}
          </span>
        </span>
      </button>

      {canOrder ? (
        inBasket > 0 ? (
          <Counter
            value={inBasket}
            onChange={(next) => basket.setQty(item.id, next)}
            min={0}
            max={20}
            label={item.name}
          />
        ) : (
          /* Neutral until the dish is in the order, and only then red. Red is an
             instruction, and "add this" is a suggestion. */
          <Button size="sm" tone="default" onClick={() => basket.add(item.id)} aria-label={`${c.menu.add} ${item.name}`}>
            {c.menu.add}
          </Button>
        )
      ) : null}
    </div>
  );
}

/* ── The detail sheet ───────────────────────────────────────────────────────*/

function DishSheet({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
  const { c } = useCopy();
  const { siteConfig } = useVenue();
  const basket = useBasket();

  if (!item) return null;

  const soldOut = item.sold_out === 1;
  const tags = parseTags(item.dietary_tags);
  const inBasket = basket.lines.find((line) => line.id === item.id)?.qty ?? 0;
  const canOrder = siteConfig.features.ordering && !soldOut && item.price_fcfa != null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      hideTitle
      footer={
        canOrder ? (
          <Button
            tone="primary"
            block
            onClick={() => {
              basket.add(item.id);
              onClose();
            }}
          >
            {inBasket > 0 ? c.menu.added : c.menu.add}
          </Button>
        ) : soldOut ? (
          <Button tone="default" block disabled>
            {c.menu.soldOutToday}
          </Button>
        ) : null
      }
    >
      <div className="stack">
        <Img
          src={item.image_url}
          alt={item.name}
          ratio={16 / 10}
          priority
          style={transitionName("dish", item.id)}
        />

        <div className="stack stack--tight">
          <div className="bar bar--between bar--top">
            <h2 className="display display--lg">{item.name}</h2>
            {item.price_fcfa != null ? (
              <Money value={item.price_fcfa} />
            ) : (
              <span className="fine muted">{item.price_label || c.menu.byWeight}</span>
            )}
          </div>

          {soldOut ? (
            <p className="fine hot">
              {c.menu.soldOutToday}. {c.menu.soldOutNote}
            </p>
          ) : null}

          {item.description ? <p className="lead">{item.description}</p> : null}

          {tags.length > 0 ? (
            <div className="bar bar--wrap bar--tight">
              {tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
