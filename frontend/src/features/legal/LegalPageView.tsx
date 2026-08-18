import { api } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { useLocale } from "~/state/locale";
import { ErrorState, Skeleton } from "~/ui/Feedback";

function render(body: string) {
  return body.split(/\n{2,}/).map((block, index) => {
    const text = block.trim();
    if (!text) return null;
    if (text.startsWith("## ")) return <h2 key={index} className="display display--md legal__head">{text.slice(3)}</h2>;
    return <p key={index} className="legal__para">{text}</p>;
  });
}

export function LegalPageView({ slug }: { slug: "terms" | "privacy" }) {
  const page = useResource(() => api.site.legalPage(slug), [slug]);
  const { locale } = useLocale();
  return <div className="page page--narrow section">
    {page.loading ? <div className="stack"><Skeleton height="3rem" width="60%" /><Skeleton height="14rem" /></div> : page.error ? <ErrorState error={page.error} onRetry={page.reload} /> : page.data ? (() => {
      const title = locale === "fr" ? page.data.title_fr : page.data.title;
      const body = locale === "fr" ? page.data.body_fr : page.data.body;
      return <article className="legal"><div className="section-head"><hr className="heat-rule" /><h1 className="display display--xl">{title}</h1><p className="fine faint">{locale === "fr" ? "Dernière mise à jour" : "Last changed"} {stampLabel(page.data.updated_at)}</p></div>{render(body)}</article>;
    })() : null}
  </div>;
}
