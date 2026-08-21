import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { Badge } from "~/ui/Bits";
import { LinkButton } from "~/ui/Button";
import { EmptyState, ErrorState, SkeletonRows } from "~/ui/Feedback";
import { Reveal } from "~/ui/Reveal";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * What is running this week.
 *
 * A list of rows. Each offer is a badge, a title, a line of description and a
 * date it runs until, which is four things and does not need a card around it.
 */
export function OffersPage() {
  const { locale, c } = useCopy();
  const { siteConfig } = useVenue();
  const { data, loading, error, reload } = useQuery(K.offers, () => api.site.offers(), { persist: true });

  const offers = (data ?? []).filter((offer) => offer.is_active === 1);

  return (
    <div className="page section stack">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.offers.title}</h1>
        <p className="lead">{c.offers.lead}</p>
      </header>

      {error ? (
        <ErrorState error={error} intent="load" onRetry={reload} />
      ) : loading ? (
        <SkeletonRows count={3} />
      ) : offers.length === 0 ? (
        <EmptyState
          icon="tag"
          title={c.offers.none}
          body={c.offers.noneBody}
          action={
            <LinkButton to="/menu" tone="ghost" size="sm">
              {c.nav.menu}
            </LinkButton>
          }
        />
      ) : (
        <Reveal className="rows">
          {offers.map((offer) => (
            <article key={offer.id} className="row row--top row--tall">
              <div className="grow stack stack--tight">
                <div className="bar bar--tight">
                  {offer.badge ? <Badge tone="hot">{offer.badge}</Badge> : null}
                  {offer.valid_until ? (
                    <span className="fine faint">
                      {c.offers.until}{" "}
                      {new Date(offer.valid_until).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ) : null}
                </div>
                <h2 className="title">{offer.title}</h2>
                <p className="fine muted">{offer.description}</p>
              </div>
            </article>
          ))}
        </Reveal>
      )}

      {siteConfig.features.ordering || siteConfig.features.booking ? (
        <div className="bar bar--wrap">
          {siteConfig.features.ordering ? (
            <LinkButton to="/order" tone="primary" size="sm" icon="bag">
              {c.home.orderNow}
            </LinkButton>
          ) : null}
          {siteConfig.features.booking ? (
            <LinkButton to="/book" tone="ghost" size="sm" icon="calendar">
              {c.home.holdTable}
            </LinkButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
