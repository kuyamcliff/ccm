import { useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { timeAgo } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { useConfirm } from "~/ui/Sheet";
import { Code } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Loaded, Nothing, Search } from "../parts";

/**
 * What broke, most recent first.
 *
 * Every 500 hands the customer a short code and this is where that code can be
 * looked up. A guest saying "it said CCM-7F42" should take about four seconds to
 * turn into a stack trace, and until now it took access to the platform's log
 * viewer, which nobody has on a phone at eight in the evening.
 *
 * Held in memory on purpose, and the screen says so: writing a row on every
 * failure would put the error path behind the database, and a burst of 500s is
 * usually the database.
 */
export function DevErrors() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { confirm, element } = useConfirm();

  const errors = useQuery(K.dev.errors, () => api.desk.dev.errors(200), { staleMs: 10_000 });

  const clear = useMutation(async () => {
    await api.desk.dev.clearErrors();
    invalidate("dev.errors");
    errors.reload();
  });

  const shown = (errors.data?.errors ?? []).filter((entry) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      entry.reference.toLowerCase().includes(needle) ||
      entry.path.toLowerCase().includes(needle) ||
      entry.message.toLowerCase().includes(needle)
    );
  });

  return (
    <DeskPage
      title="Errors"
      hint="The last two hundred failures on this instance."
      actions={
        <Action
          size="sm"
          tone="quiet"
          icon="trash"
          pending={clear.pending}
          pendingLabel="Clearing"
          onClick={async () => {
            const sure = await confirm({
              title: "Clear the error log?",
              body: "Useful before reproducing something. They are gone once cleared.",
              confirmLabel: "Clear them",
            });
            if (!sure) return;
            await clear.run();
          }}
        >
          Clear
        </Action>
      }
    >
      <Notice tone="info">
        Held in memory on this instance. A restart empties it, and another instance has its own. This answers "what just
        went wrong", not "what went wrong last week".
      </Notice>

      <Search value={query} onChange={setQuery} placeholder="Reference, path or message" />

      <Loaded query={errors}>
        {() =>
          shown.length === 0 ? (
            <Nothing>Nothing has failed. Good.</Nothing>
          ) : (
            <div className="rows">
              {shown.map((entry) => (
                <div key={entry.reference} className="row row--top row--tall">
                  <div className="grow stack stack--tight">
                    <div className="bar bar--tight bar--wrap">
                      <Code value={entry.reference} size="sm" />
                      <span className="fine faint">
                        {entry.method} {entry.path}
                      </span>
                      <span className="fine faint push">{timeAgo(entry.at)}</span>
                    </div>

                    <p className="fine">{entry.message}</p>

                    {entry.stack ? (
                      <>
                        <Button
                          size="sm"
                          tone="quiet"
                          onClick={() => setOpen(open === entry.reference ? null : entry.reference)}
                        >
                          {open === entry.reference ? "Hide the stack" : "Show the stack"}
                        </Button>
                        {open === entry.reference ? <pre className="dk-stack">{entry.stack}</pre> : null}
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Loaded>

      {element}
    </DeskPage>
  );
}
