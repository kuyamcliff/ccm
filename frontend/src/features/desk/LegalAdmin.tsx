import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { stampLabel } from "~/lib/format";
import { Action } from "~/ui/Button";
import { TextField, TextAreaField, Segmented } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Loaded, Section } from "./parts";
import { useToast } from "~/state/toast";

/**
 * The terms and the privacy page, in the owner's own words.
 *
 * Both languages are required by the server, and the requirement is a good one:
 * a legal page that exists in English only is a legal page that does not apply
 * to half the country. The save button stays disabled until both are filled in
 * and says why.
 */

type Slug = "terms" | "privacy";

export function LegalAdmin() {
  const toast = useToast();
  const [slug, setSlug] = useState<Slug>("terms");
  const [draft, setDraft] = useState({ title: "", title_fr: "", body: "", body_fr: "" });

  const pages = useQuery(K.desk.legal, () => api.desk.legal.list(), { staleMs: 5 * 60 * 1000 });
  const page = pages.data?.find((entry) => entry.slug === slug);

  /* Reloading the form when the tab changes, or when the pages first land. */
  useEffect(() => {
    if (!page) return;
    setDraft({
      title: page.title ?? "",
      title_fr: page.title_fr ?? "",
      body: page.body ?? "",
      body_fr: page.body_fr ?? "",
    });
  }, [page?.slug, page?.updated_at]);

  const save = useMutation(async () => {
    await api.desk.legal.save(slug, draft);
    invalidate("desk.legal*");
    invalidate(K.legal(slug));
    pages.reload();
    toast.done("Saved.");
  });

  const short = (value: string) => value.trim().length < 20;
  const incomplete = short(draft.body) || short(draft.body_fr) || !draft.title.trim() || !draft.title_fr.trim();

  return (
    <DeskPage
      title="Terms and privacy"
      hint="Your own wording. Both languages are required."
      actions={
        <Action
          size="sm"
          tone="primary"
          pending={save.pending}
          pendingLabel="Saving"
          disabled={incomplete}
          onClick={async () => {
            await save.run();
            const error = save.readError();
            if (error) toast.failed(error, "desk");
          }}
        >
          Save
        </Action>
      }
    >
      <Segmented
        value={slug}
        onChange={setSlug}
        label="Which page"
        options={[
          { value: "terms", label: "Terms" },
          { value: "privacy", label: "Privacy" },
        ]}
      />

      <Loaded query={pages}>
        {() => (
          <>
            {incomplete ? (
              <Notice tone="warn" title="Both languages are needed">
                The site will not accept a legal page in one language only. Fill in the French as well, even if it
                starts as a copy of the English.
              </Notice>
            ) : null}

            {page?.updated_at ? <p className="fine faint">Last saved {stampLabel(page.updated_at)}</p> : null}

            <Section title="English">
              <TextField
                label="Title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
              <TextAreaField
                label="The page"
                hint="Leave a blank line between paragraphs."
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                rows={14}
              />
            </Section>

            <Section title="French">
              <TextField
                label="Titre"
                value={draft.title_fr}
                onChange={(event) => setDraft({ ...draft, title_fr: event.target.value })}
              />
              <TextAreaField
                label="La page"
                value={draft.body_fr}
                onChange={(event) => setDraft({ ...draft, body_fr: event.target.value })}
                rows={14}
              />
            </Section>
          </>
        )}
      </Loaded>
    </DeskPage>
  );
}
