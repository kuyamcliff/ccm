import { api } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { ErrorState, Skeleton } from "~/ui/Feedback";

/**
 * Terms and privacy, both written and edited by the owner from the console.
 *
 * The body is plain text with one convention: a line starting "## " is a
 * heading. Rendering it by hand rather than pulling in a markdown parser keeps
 * a dependency out of the bundle for two pages, and means nothing the owner
 * types can inject markup.
 */

function render(body: string) {
  return body.split(/\n{2,}/).map((block, index) => {
    const text = block.trim();
    if (!text) return null;
    if (text.startsWith("## ")) {
      return (
        <h2 key={index} className="display display--md legal__head">
          {text.slice(3)}
        </h2>
      );
    }
    return (
      <p key={index} className="legal__para">
        {text}
      </p>
    );
  });
}

export function LegalPageView({ slug }: { slug: "terms" | "privacy" }) {
  const page = useResource(() => api.site.legalPage(slug), [slug]);

  return (
    <div className="page page--narrow section">
      {page.loading ? (
        <div className="stack">
          <Skeleton height="3rem" width="60%" />
          <Skeleton height="14rem" />
        </div>
      ) : page.error ? (
        <ErrorState error={page.error} onRetry={page.reload} />
      ) : page.data ? (
        <article className="legal">
          <div className="section-head">
            <hr className="heat-rule" />
            <h1 className="display display--xl">{page.data.title}</h1>
            <p className="fine faint">Last changed {stampLabel(page.data.updated_at)}</p>
          </div>
          {render(page.data.body)}
        </article>
      ) : null}
    </div>
  );
}
