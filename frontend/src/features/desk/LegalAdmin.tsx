import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import type { LegalPage } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextAreaField, TextField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded } from "./parts";

export function LegalAdmin() {
  const pages = useResource(() => api.desk.legal.list(), []);
  const toast = useToast();
  const [slug, setSlug] = useState<"terms" | "privacy">("terms");
  const [draft, setDraft] = useState<LegalPage | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const page = pages.data?.find((entry) => entry.slug === slug); if (page) setDraft({ ...page }); }, [pages.data, slug]);
  return <DeskPage title="Terms and privacy" lead="Keep the English and French versions together. Publish both or neither.">
    <div className="tabs" role="tablist" aria-label="Which page">
      <button type="button" role="tab" className="tab" aria-selected={slug === "terms"} onClick={() => setSlug("terms")}>Terms of use</button>
      <button type="button" role="tab" className="tab" aria-selected={slug === "privacy"} onClick={() => setSlug("privacy")}>Privacy policy</button>
    </div>
    <Loaded resource={pages} skeletonHeight="16rem">
      {() => draft ? <form className="card stack" style={{ maxWidth: "50rem", marginTop: "var(--s-5)" }} onSubmit={async (event) => {
        event.preventDefault(); setBusy(true);
        try { await api.desk.legal.save(slug, { title: draft.title, title_fr: draft.title_fr, body: draft.body, body_fr: draft.body_fr }); pages.reload(); toast.done("English and French versions saved and live."); }
        catch (err) { toast.failed(err); }
        finally { setBusy(false); }
      }}>
        <Notice tone="info">Start a line with <code>## </code> to make a heading. Leave a blank line between paragraphs. Both languages are published together.</Notice>
        <div className="site-control__grid">
          <section className="stack site-control__section site-control__section--half"><h2 className="display display--md">English</h2><TextField label="Page title" value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /><TextAreaField label="The text" value={draft.body} rows={18} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></section>
          <section className="stack site-control__section site-control__section--half"><h2 className="display display--md">Français</h2><TextField label="Titre" value={draft.title_fr} maxLength={120} onChange={(e) => setDraft({ ...draft, title_fr: e.target.value })} /><TextAreaField label="Le texte" value={draft.body_fr} rows={18} onChange={(e) => setDraft({ ...draft, body_fr: e.target.value })} /></section>
        </div>
        <div className="row row--between"><Button type="submit" tone="primary" busy={busy}>Publish both versions</Button><span className="fine faint">Last changed {stampLabel(draft.updated_at)}</span></div>
      </form> : null}
    </Loaded>
  </DeskPage>;
}
