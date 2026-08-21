import { useState } from "react";
import { api } from "~/lib/api";
import type { Offer } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { todayISO } from "~/lib/format";
import { Action, Button, IconButton } from "~/ui/Button";
import { TextField, TextAreaField, Switch } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { DeskPage, Loaded, Nothing, State } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Whatever is running this week.
 *
 * A short list, because it should be a short list: three offers at once is no
 * offer at all. The badge is the two or three words that appear on the customer
 * side in red, so it is the field that does most of the work.
 */

interface Draft {
  id: number | null;
  title: string;
  description: string;
  badge: string;
  valid_until: string;
  is_active: boolean;
}

const BLANK: Draft = { id: null, title: "", description: "", badge: "", valid_until: "", is_active: true };

export function Offers() {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);

  const offers = useQuery(K.desk.offers, () => api.desk.offers.list(), { staleMs: 60_000 });

  function refresh() {
    invalidate("desk.offers*");
    invalidate(K.offers);
    offers.reload();
  }

  const save = useMutation(async () => {
    if (!draft) return;
    const payload: Partial<Offer> = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      badge: draft.badge.trim(),
      valid_until: draft.valid_until || null,
      is_active: draft.is_active ? 1 : 0,
    };
    if (draft.id === null) await api.desk.offers.create(payload);
    else await api.desk.offers.update(draft.id, payload);
    setDraft(null);
    refresh();
    toast.done("Saved.");
  });

  const toggle = useMutation(async (offer: Offer) => {
    await api.desk.offers.update(offer.id, { is_active: offer.is_active === 1 ? 0 : 1 });
    refresh();
  });

  const remove = useMutation(async (id: number) => {
    await api.desk.offers.remove(id);
    setDraft(null);
    refresh();
    toast.done("Deleted.");
  });

  return (
    <DeskPage
      title="Offers"
      hint="Keep it to one or two. Three offers at once is no offer at all."
      actions={
        <Button size="sm" tone="primary" icon="plus" onClick={() => setDraft({ ...BLANK })}>
          New offer
        </Button>
      }
    >
      <Loaded query={offers}>
        {(list) =>
          list.length === 0 ? (
            <Nothing icon="tag">Nothing running.</Nothing>
          ) : (
            <div className="rows">
              {list.map((offer) => (
                <div key={offer.id} className="row row--top row--tall">
                  <span className="grow stack stack--tight">
                    <span className="bar bar--tight">
                      <span className="small strong">{offer.title}</span>
                      {offer.badge ? <State tone="hot">{offer.badge}</State> : null}
                      {offer.is_active === 0 ? <State>Off</State> : null}
                    </span>
                    <span className="fine faint clip-2">{offer.description}</span>
                    {offer.valid_until ? <span className="micro faint">Until {offer.valid_until}</span> : null}
                  </span>

                  <div className="bar bar--tight nowrap">
                    <Action
                      size="sm"
                      tone="quiet"
                      pending={toggle.pending}
                      pendingLabel="Saving"
                      onClick={() => void toggle.run(offer)}
                    >
                      {offer.is_active === 1 ? "Turn off" : "Turn on"}
                    </Action>
                    <IconButton
                      name="edit"
                      label={`Edit ${offer.title}`}
                      size="sm"
                      onClick={() =>
                        setDraft({
                          id: offer.id,
                          title: offer.title,
                          description: offer.description,
                          badge: offer.badge,
                          valid_until: offer.valid_until ?? "",
                          is_active: offer.is_active === 1,
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Loaded>

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === null ? "New offer" : "Edit offer"}
        footer={
          <>
            {draft && draft.id !== null ? (
              <Action
                tone="quiet"
                pending={remove.pending}
                pendingLabel="Deleting"
                onClick={async () => {
                  const sure = await confirm({
                    title: `Delete "${draft.title}"?`,
                    confirmLabel: "Delete it",
                  });
                  if (!sure) return;
                  await remove.run(draft.id!);
                }}
              >
                Delete
              </Action>
            ) : null}
            <Action
              tone="primary"
              pending={save.pending}
              pendingLabel="Saving"
              disabled={!draft?.title.trim()}
              onClick={async () => {
                await save.run();
                const error = save.readError();
                if (error) toast.failed(error, "desk");
              }}
            >
              Save
            </Action>
          </>
        }
      >
        {draft ? (
          <div className="stack">
            <TextField
              label="Title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
            />
            <TextField
              label="Badge"
              hint="Two or three words. This is the bit that shows in red."
              value={draft.badge}
              onChange={(event) => setDraft({ ...draft, badge: event.target.value })}
              maxLength={24}
            />
            <TextAreaField
              label="Description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={3}
              maxLength={300}
            />
            <TextField
              label="Runs until"
              hint="Leave empty for no end date."
              type="date"
              min={todayISO()}
              value={draft.valid_until}
              onChange={(event) => setDraft({ ...draft, valid_until: event.target.value })}
            />
            <Switch
              label="Showing on the site"
              checked={draft.is_active}
              onChange={(next) => setDraft({ ...draft, is_active: next })}
            />
          </div>
        ) : null}
      </Sheet>

      {element}
    </DeskPage>
  );
}
