import { useMemo, useRef, useState } from "react";
import { api } from "~/lib/api";
import type { MenuItem } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { parseTags } from "~/lib/format";
import { buildVocabulary, itemMatches, suggestQuery, tokens } from "~/lib/search";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { Button, LinkButton } from "~/ui/Button";
import { Money } from "~/ui/Bits";
import { EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { useBasket } from "~/state/basket";

/**
 * The menu, and where most orders start.
 *
 * Categories come from the data rather than a hard-coded list, so the owner can
 * add "Weekend special" from the console and it appears here without a deploy.
 */

function Dish({ item }: { item: MenuItem }) {
  const { add, lines } = useBasket();
  const inBasket = lines.find((line) => line.id === item.id)?.qty ?? 0;
  const tags = parseTags(item.dietary_tags);
  const soldOut = item.sold_out === 1;
  const orderable = item.price_fcfa != null && !soldOut;

  return (
    <article className="row-item" data-sold-out={soldOut || undefined}>
      {/* Always drawn, even with nothing to draw. A menu where half the rows
          start at the text edge and half start four rems in reads as broken;
          the fallback is a deliberate shape, so a row without a photograph
          still lines up with the rows above and below it. */}
      <Photo className="row-item__photo" src={item.image_url} alt="" />

      <div className="row-item__body">
        <h3 className="row-item__name">{item.name}</h3>
        {item.description ? <p className="fine">{item.description}</p> : null}
        {tags.length > 0 || soldOut ? (
          <p className="row-item__tags">
            {/* Said in words, not by grey-ing the button out. A control that
                simply stops working leaves the guest wondering whether the
                fault is theirs; "sold out today" also tells them it is worth
                coming back tomorrow. */}
            {soldOut ? <span className="badge badge--warn">Sold out today</span> : null}
            {tags.map((tag) => (
              <span key={tag} className="badge badge--plain">
                {tag}
              </span>
            ))}
          </p>
        ) : null}
        {/* The price belongs with the name, not across the row from it. Put it
            on the right and a long dish name is squeezed into two words by a
            column it is not competing with. */}
        <p className="row-item__price">
          {item.price_fcfa != null ? <Money value={item.price_fcfa} /> : <span className="fine">{item.price_label}</span>}
        </p>
      </div>

      <div className="row-item__end">
        {orderable ? (
          /*
            One button that changes what it says, rather than a stepper on
            every row: on a phone, plus and minus controls beside twenty dishes
            is a wall of targets, and the count belongs in the bar at the
            bottom where the order actually is.

            It is quiet until the dish is chosen and red after. Twenty red
            buttons down a menu is twenty instructions, and red stops meaning
            anything; one red button per dish you have actually picked means
            "this is in your order" at a glance while scrolling back up.
          */
          <Button
            tone={inBasket > 0 ? "primary" : "default"}
            size="sm"
            icon={inBasket > 0 ? "check" : "plus"}
            /* No toast. The button changes, the basket count jumps in two
               places and the bar at the bottom updates, all in the same frame.
               A message on top of that is a fourth confirmation of something
               nobody doubted, and three of them stack up over the bar the
               customer is trying to press. */
            onClick={() => add(item.id)}
          >
            {inBasket > 0 ? `${inBasket} added` : "Add"}
          </Button>
        ) : soldOut ? (
          <span className="fine faint">Back tomorrow</span>
        ) : (
          <span className="fine faint">Ask at the counter</span>
        )}
      </div>
    </article>
  );
}

export function MenuPage() {
  const { data, loading, error, reload } = useResource(() => api.site.menu(), []);
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { count } = useBasket();

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of data ?? []) {
      const bucket = map.get(item.category);
      if (bucket) bucket.push(item);
      else map.set(item.category, [item]);
    }

    /* The API sorts by category name, which puts Drinks above the food. Order
       the sections by the oldest dish in each instead: that is the order the
       owner built the menu in, and the food they opened with comes first. */
    return [...map.entries()].sort(
      ([, a], [, b]) => Math.min(...a.map((i) => i.id)) - Math.min(...b.map((i) => i.id))
    );
  }, [data]);

  const categories = grouped.map(([name]) => name);

  /* Everything worth matching a dish on, in one string: its name, what it says
     about itself, and the section it sits under, so "grills" finds the grills
     and "pepper" finds the dish whose description mentions it. */
  const searchable = useMemo(
    () =>
      (data ?? []).map((item) => ({
        item,
        haystack: `${item.name} ${item.description} ${item.category}`,
      })),
    [data]
  );

  const vocabulary = useMemo(() => buildVocabulary(searchable), [searchable]);

  const needles = tokens(query);
  const searching = needles.length > 0;
  const matching = useMemo(() => {
    if (!searching) return null;
    return new Set(searchable.filter((entry) => itemMatches(entry, needles)).map((entry) => entry.item.id));
    // `needles` is derived from `query`, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchable, query, searching]);

  const shown = grouped
    .filter(([name]) => !active || name === active)
    .map(([name, items]) => [name, matching ? items.filter((item) => matching.has(item.id)) : items] as [string, MenuItem[]])
    .filter(([, items]) => items.length > 0);

  const totalShown = shown.reduce((sum, [, items]) => sum + items.length, 0);

  /* Only worth working out when there is nothing to show: a guest who can see
     their dish does not need to be asked whether they meant a different one. */
  const suggestion = useMemo(
    () => (searching && shown.length === 0 ? suggestQuery(query, vocabulary) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, vocabulary, searching, shown.length]
  );

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--lg">Our menu</h1>
      </div>

      {loading ? (
        <div className="stack">
          {[0, 1, 2, 3, 4].map((n) => (
            <Skeleton key={n} height="5.5rem" radius="var(--r-md)" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="menu-search">
            <Icon name="search" size={18} className="menu-search__icon" />
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="menu-search__input"
              placeholder="Search the menu"
              aria-label="Search the menu"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button type="button" className="menu-search__clear" aria-label="Clear search" onClick={clearSearch}>
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </div>

          {categories.length > 1 ? (
            <div className="chip-rail sticky-rail">
              <button type="button" className="chip" aria-pressed={active === null} onClick={() => setActive(null)}>
                Everything
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="chip"
                  aria-pressed={active === category}
                  onClick={() => setActive(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          ) : null}

          {shown.length === 0 ? (
            <EmptyState icon={searching ? "search" : "info"} title={searching ? "Nothing matches that" : "The menu is empty"}>
              {searching ? (
                <>
                  Nothing on {active ? `the ${active} list` : "the menu"} matches “{query}”.{" "}
                  {suggestion ? (
                    <>
                      Did you mean{" "}
                      <button type="button" className="menu-search__reset" onClick={() => setQuery(suggestion)}>
                        {suggestion}
                      </button>
                      ?
                    </>
                  ) : (
                    <>
                      <button type="button" className="menu-search__reset" onClick={clearSearch}>
                        Clear the search
                      </button>
                      .
                    </>
                  )}
                </>
              ) : (
                "Check back soon."
              )}
            </EmptyState>
          ) : (
            <>
              {searching ? (
                <p className="fine faint menu-search__count">
                  {totalShown === 1 ? "1 dish matches" : `${totalShown} dishes match`} “{query}”
                </p>
              ) : null}
              <div className="stack stack--loose" style={{ marginTop: "var(--s-5)" }}>
                {shown.map(([category, items]) => (
                  <section key={category}>
                    <h2 className="display display--lg menu-heading">{category}</h2>
                    <div className="row-list">
                      {items.map((item) => (
                        <Dish key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Once there is something in the basket, the way to finish it follows
          the visitor down the page rather than waiting at the bottom. */}
      {count > 0 ? (
        <div className="basket-bar">
          <div className="page row row--between">
            <span className="row" style={{ gap: "var(--s-2)" }}>
              <Icon name="basket" size={18} />
              <strong>{count}</strong> <span className="muted fine">in your basket</span>
            </span>
            <LinkButton to="/order" tone="primary" iconEnd="arrow-right">
              Go to basket
            </LinkButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
