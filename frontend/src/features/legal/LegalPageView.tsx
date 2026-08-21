import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { stampLabel } from "~/lib/format";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { useCopy } from "~/state/locale";

/**
 * Terms, and privacy.
 *
 * The wording is the owner's, edited in Desk > Terms and privacy, and stored in
 * both languages because the server refuses a page that only has one. Rendered
 * as plain paragraphs split on blank lines rather than as HTML: nothing in this
 * product uses `dangerouslySetInnerHTML`, and a legal page typed into a textarea
 * is exactly the sort of place a stray script tag would arrive.
 */
export function LegalPageView({ slug }: { slug: "terms" | "privacy" }) {
  const { locale, c } = useCopy();
  const { data, loading, error, reload } = useQuery(K.legal(slug), () => api.site.legalPage(slug), {
    persist: true,
    staleMs: 60 * 60 * 1000,
  });

  if (error) {
    return (
      <div className="page section">
        <ErrorState error={error} intent="load" onRetry={reload} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page section stack">
        <Skeleton height="1.75rem" width="12rem" />
        {[0, 1, 2, 3, 4].map((n) => (
          <Skeleton key={n} height="0.9rem" width={`${70 + ((n * 11) % 25)}%`} />
        ))}
      </div>
    );
  }

  const title = (locale === "fr" ? data?.title_fr : data?.title) || (slug === "terms" ? c.nav.terms : c.nav.privacy);
  const body = (locale === "fr" ? data?.body_fr : data?.body) ?? "";

  return (
    <article className="page section stack">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{title}</h1>
        {data?.updated_at ? <p className="fine faint">Last updated {stampLabel(data.updated_at)}</p> : null}
      </header>

      <div className="prose">
        {body
          .split(/\n{2,}/)
          .map((block) => block.trim())
          .filter(Boolean)
          .map((block, index) => (
            <p key={index}>{block}</p>
          ))}
      </div>
    </article>
  );
}
