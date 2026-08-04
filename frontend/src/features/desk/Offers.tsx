import { useState } from "react";
import { api } from "~/lib/api";
import type { Offer } from "~/lib/api";
import { longDate } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { SelectField, TextAreaField, TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, TableWrap } from "./parts";

/**
 * What is running this week.
 *
 * The icon is chosen from a fixed list rather than typed, because the public
 * page can only draw the icons it has, and a typo would silently fall back to
 * the flame with no clue why.
 */

const ICONS = ["flame", "gift", "tag", "users", "star", "clock", "calendar", "bag", "sparkle"];

type Draft = Partial<Offer>;

const BLANK: Draft = { title: "", description: "", badge: "", icon: "flame", sort_order: 0, valid_until: null };

export function Offers() {
  const offers = useResource(() => api.desk.offers.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <DeskPage
      title="Offers"
      lead="Shown on the offers page, newest first by the order you set."
      actions={
        <Button tone="primary" icon="plus" onClick={() => setDraft({ ...BLANK })}>
          New offer
        </Button>
      }
    >
      {confirmElement}

      <Loaded resource={offers}>
        {(rows) =>
          rows.length === 0 ? (
            <Nothing>No offers yet.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Badge</th>
                  <th>Until</th>
                  <th className="table__num">Order</th>
                  <th>Showing</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((offer) => (
                  <tr key={offer.id}>
                    <td>
                      <strong>{offer.title}</strong>
                      <p className="fine faint">{offer.description}</p>
                    </td>
                    <td className="fine">{offer.badge || "None"}</td>
                    <td className="fine">{offer.valid_until ? longDate(offer.valid_until) : "No end date"}</td>
                    <td className="table__num">{offer.sort_order}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={offer.is_active === 1}
                          onChange={async (event) => {
                            try {
                              await api.desk.offers.update(offer.id, { is_active: event.target.checked ? 1 : 0 });
                              offers.reload();
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        />
                        <span className="switch__track" aria-hidden="true" />
                        <span className="sr-only">{offer.title} showing</span>
                      </label>
                    </td>
                    <td>
                      <div className="table__actions">
                        <IconButton name="edit" label={`Edit ${offer.title}`} size="sm" onClick={() => setDraft({ ...offer })} />
                        <IconButton
                          name="trash"
                          label={`Delete ${offer.title}`}
                          size="sm"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Delete "${offer.title}"?`,
                              body: "Switching it off hides it without losing the wording.",
                              confirmLabel: "Delete",
                            });
                            if (!ok) return;
                            try {
                              await api.desk.offers.remove(offer.id);
                              offers.reload();
                              toast.done("Deleted.");
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit offer" : "New offer"}
        footer={
          <>
            <Button tone="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              onClick={async () => {
                if (!draft?.title?.trim()) {
                  toast.failed(new Error("An offer needs a title."));
                  return;
                }
                try {
                  const payload = {
                    title: draft.title.trim(),
                    description: draft.description ?? "",
                    badge: draft.badge ?? "",
                    icon: draft.icon ?? "flame",
                    sort_order: draft.sort_order ?? 0,
                    valid_until: draft.valid_until || null,
                  };
                  if (draft.id) await api.desk.offers.update(draft.id, payload);
                  else await api.desk.offers.create(payload);
                  setDraft(null);
                  offers.reload();
                  toast.done("Saved.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <>
            <TextField
              label="Title"
              value={draft.title ?? ""}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
            <TextAreaField
              label="What it is"
              value={draft.description ?? ""}
              maxLength={400}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <TextField
              label="Badge"
              hint="Two or three words. Sits above the title."
              placeholder="Tuesdays"
              value={draft.badge ?? ""}
              maxLength={40}
              onChange={(e) => setDraft({ ...draft, badge: e.target.value })}
            />
            <SelectField label="Icon" value={draft.icon ?? "flame"} onChange={(e) => setDraft({ ...draft, icon: e.target.value })}>
              {ICONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Last day"
              type="date"
              hint="Leave empty if it runs until you stop it."
              value={draft.valid_until ?? ""}
              onChange={(e) => setDraft({ ...draft, valid_until: e.target.value || null })}
            />
            <TextField
              label="Order on the page"
              type="number"
              value={draft.sort_order ?? 0}
              onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
            />
          </>
        ) : null}
      </Sheet>
    </DeskPage>
  );
}
