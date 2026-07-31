import { api } from "~/lib/api";
import { longDate } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { LinkButton } from "~/ui/Button";
import { Icon, type IconName } from "~/ui/Icon";
import { EmptyState, ErrorState, SkeletonCards } from "~/ui/Feedback";

/**
 * Whatever is running this week.
 *
 * The icon on each offer is a name the owner picks in the console. Anything
 * unrecognised falls back to the flame rather than rendering nothing.
 */

const ICONS: Record<string, IconName> = {
  flame: "flame",
  gift: "gift",
  tag: "tag",
  users: "users",
  star: "star",
  clock: "clock",
  calendar: "calendar",
  bag: "bag",
  sparkle: "sparkle",
};

export function OffersPage() {
  const offers = useResource(() => api.site.offers(), []);
  const rows = offers.data ?? [];

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">What is on</h1>
      </div>

      {offers.loading ? (
        <SkeletonCards count={2} height="8rem" />
      ) : offers.error ? (
        <ErrorState error={offers.error} onRetry={offers.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="flame"
          title="Nothing running right now"
          action={
            <LinkButton to="/menu" tone="primary">
              See the menu
            </LinkButton>
          }
        >
          The usual prices are the usual prices. Check back on a match day.
        </EmptyState>
      ) : (
        <div className="offer-grid">
          {rows.map((offer) => (
            <article key={offer.id} className="offer card">
              <span className="offer__icon">
                <Icon name={ICONS[offer.icon] ?? "flame"} size={24} />
              </span>
              {offer.badge ? <span className="badge badge--hot">{offer.badge}</span> : null}
              <h2 className="card__title">{offer.title}</h2>
              <p className="fine muted">{offer.description}</p>
              {offer.valid_until ? <p className="fine faint">Until {longDate(offer.valid_until)}</p> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
