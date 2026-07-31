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

/**
 * Terms and privacy, in the owner's own words.
 *
 * Plain text with one convention, stated on the screen so nobody has to guess:
 * a line beginning "## " becomes a heading, and a blank line starts a new
 * paragraph. Nothing else is interpreted, which is what keeps the public page
 * from being able to render markup somebody pasted in.
 */
export function LegalAdmin() {
  const pages = useResource(() => api.desk.legal.list(), []);
  const toast = useToast();
  const [slug, setSlug] = useState<"terms" | "privacy">("terms");
  const [draft, setDraft] = useState<LegalPage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const page = pages.data?.find((entry) => entry.slug === slug);
    if (page) setDraft({ ...page });
  }, [pages.data, slug]);

  return (
    <DeskPage title="Terms and privacy">
      <div className="tabs" role="tablist" aria-label="Which page">
        <button type="button" role="tab" className="tab" aria-selected={slug === "terms"} onClick={() => setSlug("terms")}>
          Terms of use
        </button>
        <button type="button" role="tab" className="tab" aria-selected={slug === "privacy"} onClick={() => setSlug("privacy")}>
          Privacy policy
        </button>
      </div>

      <Loaded resource={pages} skeletonHeight="16rem">
        {() =>
          draft ? (
            <form
              className="card stack"
              style={{ maxWidth: "44rem", marginTop: "var(--s-5)" }}
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                try {
                  await api.desk.legal.save(slug, { title: draft.title, body: draft.body });
                  pages.reload();
                  toast.done("Saved and live.");
                } catch (err) {
                  toast.failed(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Notice tone="info">
                Start a line with two hashes and a space to make it a heading. Leave a blank line between paragraphs.
              </Notice>

              <TextField
                label="Page title"
                value={draft.title}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />

              <TextAreaField
                label="The text"
                value={draft.body}
                rows={18}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />

              <div className="row row--between">
                <Button type="submit" tone="primary" busy={busy}>
                  Save
                </Button>
                <span className="fine faint">Last changed {stampLabel(draft.updated_at)}</span>
              </div>
            </form>
          ) : null
        }
      </Loaded>
    </DeskPage>
  );
}
