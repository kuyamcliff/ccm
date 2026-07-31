import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { MenuItem } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { parseTags } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { Button, LinkButton } from "~/ui/Button";
import { Money } from "~/ui/Bits";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { useBasket } from "~/state/basket";
import { useToast } from "~/state/toast";

/**
 * The menu, and the place most orders start.
 *
 * Categories come from the data rather than a hard-coded list, so the owner
 * can add "Weekend special" from the console and it appears here without a
 * deploy.
 */

function Dish({ item }: { item: MenuItem }) {
  const { add, lines } = useBasket();
  const toast = useToast();
  const inBasket = lines.find((line) => line.id === item.id)?.qty ?? 0;
  const tags = parseTags(item.dietary_tags);
  const orderable = item.price_fcfa !== null;

  return (
    <article className="row-item">
      {item.image_url ? <Photo className="row-item__photo" src={item.image_url} alt="" /> : null}

      <div className="row-item__body">
        <h3 className="row-item__name">{item.name}</h3>
        {item.description ? <p className="fine muted">{item.description}</p> : null}
        {tags.length > 0 ? (
          <p className="row-item__tags">
            {tags.map((tag) => (
              <span key={tag} className="badge badge--plain">
                {tag}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <div className="row-item__end">
        <p className="row-item__price">
          {item.price_fcfa !== null ? <Money value={item.price_fcfa} /> : <span className="fine">{item.price_label}</span>}
        </p>
        {orderable ? (
          <Button
            size="sm"
            tone={inBasket > 0 ? "ghost" : "default"}
            icon="plus"
            onClick={() => {
              add(item.id);
              toast.done(`${item.name} added`);
            }}
          >
            {inBasket > 0 ? `In basket, ${inBasket}` : "Add"}
          </Button>
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
  const { count } = useBasket();

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of data ?? []) {
      const bucket = map.get(item.category);
      if (bucket) bucket.push(item);
      else map.set(item.category, [item]);
    }

    /* The API sorts by category name, which puts Drinks above the grill. Order
       the sections by the oldest dish in each instead: that is the order the
       owner built the menu in, and the food they opened with comes first. */
    return [...map.entries()].sort(
      ([, a], [, b]) => Math.min(...a.map((i) => i.id)) - Math.min(...b.map((i) => i.id))
    );
  }, [data]);

  const categories = grouped.map(([name]) => name);
  const shown = active ? grouped.filter(([name]) => name === active) : grouped;

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">The menu</h1>
        <p className="lead">
          Grilled to order over charcoal. Anything priced by weight is settled at the counter when it is weighed.
        </p>
      </div>

      {loading ? (
        <div className="stack">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} height="5.5rem" radius="var(--r-md)" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
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

      {/* Once there is something in the basket, the way to finish it follows
          the visitor down the page rather than waiting at the bottom. */}
      {count > 0 ? (
        <div className="basket-bar">
          <div className="page row row--between">
            <span className="row" style={{ gap: "var(--s-2)" }}>
              <Icon name="basket" size={18} />
              <strong>{count}</strong> <span className="muted">in your basket</span>
            </span>
            <LinkButton to="/order" tone="primary" iconEnd="arrow-right">
              Check out
            </LinkButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
