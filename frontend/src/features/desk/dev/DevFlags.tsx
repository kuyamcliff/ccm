import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { Action, LinkButton } from "~/ui/Button";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Loaded } from "../parts";
import { useVenue } from "~/state/venue";
import { useToast } from "~/state/toast";

/**
 * The site config blob, as raw JSON.
 *
 * ── When to use this instead of Site control ───────────────────────────────
 *
 * Almost never, and the notice at the top says so. Site control is safer because
 * it can only produce shapes the parser understands.
 *
 * This is for the two cases Site control cannot reach: a blob that is already
 * malformed, and a key the console has no switch for yet. Both are developer
 * problems, which is why this lives here.
 *
 * ── The one guard ──────────────────────────────────────────────────────────
 *
 * The server refuses anything that is not a valid JSON object, and so does this
 * screen before it will let you press Save. That is the single mistake that
 * would take the customer site down, because every page parses this on load.
 */
export function DevFlags() {
  const toast = useToast();
  const { refresh } = useVenue();

  const flags = useQuery(K.dev.flags, () => api.desk.dev.flags(), { staleMs: 30_000 });
  const [raw, setRaw] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!flags.data || loaded) return;
    /* Pretty-printed, because the stored value is minified and nobody can edit
       four thousand characters on one line. */
    try {
      setRaw(JSON.stringify(JSON.parse(flags.data.raw || "{}"), null, 2));
    } catch {
      setRaw(flags.data.raw);
    }
    setLoaded(true);
  }, [flags.data, loaded]);

  const save = useMutation(async () => {
    await api.desk.dev.saveFlags(raw);
    invalidate("dev.flags");
    invalidate(K.settings);
    flags.reload();
    refresh();
    toast.done("Saved. Every page reads this.");
  });

  /* Checked here as well as on the server, so Save is disabled rather than
     failing after the fact. */
  let parseError: string | null = null;
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parseError = "It has to be a JSON object.";
  } catch (error) {
    parseError = error instanceof Error ? error.message : "That is not valid JSON.";
  }

  return (
    <DeskPage
      title="Flags"
      hint="The site config blob, raw."
      actions={
        <Action
          size="sm"
          tone="primary"
          pending={save.pending}
          pendingLabel="Saving"
          disabled={parseError !== null}
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
      <Notice tone="warn" title="Use Site control instead, normally">
        <div className="stack stack--tight">
          <p>
            Site control can only produce shapes the parser understands. This can produce anything, and every customer
            page reads it on load.
          </p>
          <LinkButton to="/desk/site-control" tone="ghost" size="sm" iconEnd="arrow-right">
            Site control
          </LinkButton>
        </div>
      </Notice>

      <Loaded query={flags}>
        {(data) => (
          <>
            {!data.valid ? (
              <Notice tone="bad" title="What is stored is not valid JSON">
                The site is running on defaults until this is fixed. That is exactly what this screen is for.
              </Notice>
            ) : null}

            {parseError ? <Notice tone="bad">{parseError}</Notice> : null}

            <textarea
              className="dk-json"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              spellCheck={false}
              rows={28}
              aria-label="Site config JSON"
            />
          </>
        )}
      </Loaded>
    </DeskPage>
  );
}
