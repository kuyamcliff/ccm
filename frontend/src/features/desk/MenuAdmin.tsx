import { useState } from "react";
import { api } from "~/lib/api";
import type { MenuItem } from "~/lib/api";
import { IMAGE_ACCEPT, ImageError, readImageFile } from "~/lib/imageFile";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { TextAreaField, TextField } from "~/ui/Field";
import { Money } from "~/ui/Bits";
import { Photo } from "~/ui/Photo";
import { Notice } from "~/ui/Feedback";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, TableWrap, Toolbar } from "./parts";

/**
 * The menu, as the owner keeps it.
 *
 * Prices are whole francs, and a dish can have none: leaving the price empty
 * and writing "by weight" in its place is how the goat is actually sold. The
 * ordering page treats those as counter-only rather than putting them in a
 * basket it cannot total.
 */

type Draft = Partial<MenuItem> & { image_url?: string | null };

const BLANK: Draft = {
  category: "",
  name: "",
  description: "",
  price_fcfa: null,
  price_label: null,
  image_url: null,
  position: 0,
  is_active: 1,
};

export function MenuAdmin() {
  const menu = useResource(() => api.desk.menu.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    if (!draft.name?.trim() || !draft.category?.trim()) {
      setProblem("A dish needs a name and a section.");
      return;
    }

    setBusy(true);
    try {
      const payload: Partial<MenuItem> = {
        category: draft.category.trim(),
        name: draft.name.trim(),
        description: draft.description ?? "",
        price_fcfa: draft.price_fcfa ?? null,
        price_label: draft.price_label?.trim() || null,
        position: draft.position ?? 0,
        is_active: draft.is_active ?? 1,
      };
      // Only send the image when it changed: resending the stored path is
      // harmless but resending a data URI would rewrite the file every save.
      if (draft.image_url !== undefined) payload.image_url = draft.image_url;

      if (draft.id) await api.desk.menu.update(draft.id, payload);
      else await api.desk.menu.create(payload);

      setDraft(null);
      setProblem(null);
      menu.reload();
      toast.done("Menu saved.");
    } catch (err) {
      toast.failed(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DeskPage
      title="Menu"
      lead="What the site shows and what the ordering page can total."
      actions={
        <Button tone="primary" icon="plus" onClick={() => setDraft({ ...BLANK })}>
          Add a dish
        </Button>
      }
    >
      {confirmElement}

      <Loaded resource={menu}>
        {(rows) =>
          rows.length === 0 ? (
            <Nothing>Nothing on the menu yet.</Nothing>
          ) : (
            <>
              <Toolbar>
                <p className="fine faint">
                  {rows.length} dishes, {rows.filter((item) => item.is_active).length} showing
                </p>
              </Toolbar>

              <TableWrap>
                <thead>
                  <tr>
                    <th />
                    <th>Dish</th>
                    <th>Section</th>
                    <th className="table__num">Price</th>
                    <th className="table__num">Order</th>
                    <th>Showing</th>
                    <th>Sold out</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Photo className="desk-thumb" src={item.image_url} alt="" />
                      </td>
                      <td>
                        <strong>{item.name}</strong>
                        <p className="fine faint">{item.description}</p>
                      </td>
                      <td>{item.category}</td>
                      <td className="table__num">
                        {item.price_fcfa != null ? <Money value={item.price_fcfa} /> : <span className="fine">{item.price_label ?? "By weight"}</span>}
                      </td>
                      <td className="table__num">{item.position}</td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={item.is_active === 1}
                            onChange={async (event) => {
                              try {
                                await api.desk.menu.update(item.id, { is_active: event.target.checked ? 1 : 0 });
                                menu.reload();
                              } catch (err) {
                                toast.failed(err);
                              }
                            }}
                          />
                          <span className="switch__track" aria-hidden="true" />
                          <span className="sr-only">{item.name} on the menu</span>
                        </label>
                      </td>
                      <td>
                        {/* Separate from "showing" on purpose. Taking a dish
                            off the menu hides that it exists; selling out says
                            come back tomorrow, and the kitchen flips this one
                            several times a week. */}
                        <label className="switch">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={item.sold_out === 1}
                            onChange={async (event) => {
                              try {
                                await api.desk.menu.update(item.id, { sold_out: event.target.checked ? 1 : 0 });
                                menu.reload();
                              } catch (err) {
                                toast.failed(err);
                              }
                            }}
                          />
                          <span className="switch__track" aria-hidden="true" />
                          <span className="sr-only">{item.name} sold out today</span>
                        </label>
                      </td>
                      <td>
                        <div className="table__actions">
                          <IconButton name="edit" label={`Edit ${item.name}`} size="sm" onClick={() => setDraft({ ...item })} />
                          <IconButton
                            name="trash"
                            label={`Delete ${item.name}`}
                            size="sm"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Delete ${item.name}?`,
                                body: "Orders already placed keep it. Switching it off instead hides it without losing the record.",
                                confirmLabel: "Delete",
                              });
                              if (!ok) return;
                              try {
                                await api.desk.menu.remove(item.id);
                                menu.reload();
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
            </>
          )
        }
      </Loaded>

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        busy={busy}
        title={draft?.id ? "Edit dish" : "New dish"}
        footer={
          <>
            <Button tone="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button tone="primary" busy={busy} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <>
            <TextField
              label="Name"
              value={draft.name ?? ""}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
            <TextField
              label="Section"
              hint="Dishes are grouped by this. Reuse the exact wording to keep them together."
              value={draft.category ?? ""}
              maxLength={60}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              required
            />
            <TextAreaField
              label="Description"
              value={draft.description ?? ""}
              maxLength={400}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <TextField
              label="Price in FCFA"
              type="number"
              inputMode="numeric"
              hint="Leave empty for anything sold by weight, then fill in the line below."
              value={draft.price_fcfa ?? ""}
              onChange={(e) => setDraft({ ...draft, price_fcfa: e.target.value ? Number(e.target.value) : null })}
            />
            <TextField
              label="Price in words"
              placeholder="By weight, ask at the counter"
              value={draft.price_label ?? ""}
              maxLength={40}
              onChange={(e) => setDraft({ ...draft, price_label: e.target.value })}
            />
            <TextField
              label="Position in its section"
              type="number"
              value={draft.position ?? 0}
              onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })}
            />

            <div className="field">
              <span className="field__label">Photo</span>
              <label className="dropzone">
                {draft.image_url ? <img src={draft.image_url} alt="" /> : <span className="dropzone__hint">Choose a photo</span>}
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      setDraft({ ...draft, image_url: await readImageFile(file) });
                      setProblem(null);
                    } catch (err) {
                      setProblem(err instanceof ImageError ? err.message : "That photo could not be used.");
                    }
                  }}
                />
              </label>
              {draft.image_url ? (
                <Button size="sm" tone="quiet" onClick={() => setDraft({ ...draft, image_url: null })}>
                  Remove the photo
                </Button>
              ) : null}
            </div>

            {problem ? <Notice tone="bad">{problem}</Notice> : null}
          </>
        ) : null}
      </Sheet>
    </DeskPage>
  );
}
