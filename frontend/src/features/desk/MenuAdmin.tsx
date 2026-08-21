import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { MenuItem } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { money, parseTags } from "~/lib/format";
import { readImageFile } from "~/lib/imageFile";
import { itemMatches, tokens } from "~/lib/search";
import { Action, Button, IconButton } from "~/ui/Button";
import { TextField, TextAreaField, Switch } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Img } from "~/ui/Img";
import { DeskPage, Loaded, Nothing, Search, State, Toolbar } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Dishes, prices, photographs, and what is showing.
 *
 * ── Sold out tonight ───────────────────────────────────────────────────────
 *
 * The one new thing here, and it fixes a real operational problem. When the goat
 * runs out at nine, the only way to take it off the board used to be
 * deactivating the dish, which meant remembering to switch it back tomorrow.
 * Nobody remembers. So a dish now sells out **until a time**, and the server
 * clears it automatically at opening.
 *
 * Sold out and hidden are deliberately different states:
 *
 *   sold out   still on the customer menu, struck through, cannot be ordered,
 *              back by itself tomorrow. "We do this, just not tonight."
 *   hidden     off the menu entirely, until somebody puts it back. For a dish
 *              that has been discontinued.
 *
 * Either way the server refuses to sell it, so this is not the enforcement.
 */

interface Draft {
  id: number | null;
  category: string;
  name: string;
  description: string;
  price_fcfa: string;
  price_label: string;
  image_url: string | null;
  dietary_tags: string;
  is_active: boolean;
}

const BLANK: Draft = {
  id: null,
  category: "",
  name: "",
  description: "",
  price_fcfa: "",
  price_label: "",
  image_url: null,
  dietary_tags: "",
  is_active: true,
};

export function MenuAdmin() {
  const toast = useToast();
  const { confirm, element } = useConfirm();

  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const menu = useQuery(K.desk.menu, () => api.desk.menu.list(), { staleMs: 30_000 });

  function refresh() {
    invalidate("desk.menu*");
    /* The customer menu is a different cache key and it has just changed too. */
    invalidate(K.menu);
    invalidate(K.highlights);
    menu.reload();
  }

  const toggleSoldOut = useMutation(async (item: MenuItem) => {
    await api.desk.menu.update(item.id, { sold_out: item.sold_out === 1 ? 0 : 1 });
    refresh();
  });

  const toggleActive = useMutation(async (item: MenuItem) => {
    await api.desk.menu.update(item.id, { is_active: item.is_active === 1 ? 0 : 1 });
    refresh();
  });

  const save = useMutation(async () => {
    if (!draft) return;
    const payload: Partial<MenuItem> = {
      category: draft.category.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      price_fcfa: draft.price_fcfa.trim() ? Number(draft.price_fcfa.replace(/\D/g, "")) : null,
      price_label: draft.price_label.trim() || null,
      image_url: draft.image_url,
      dietary_tags: draft.dietary_tags.trim(),
      is_active: draft.is_active ? 1 : 0,
    };
    if (draft.id === null) await api.desk.menu.create(payload);
    else await api.desk.menu.update(draft.id, payload);
    setDraft(null);
    refresh();
    toast.done("Saved.");
  });

  const remove = useMutation(async (id: number) => {
    await api.desk.menu.remove(id);
    setDraft(null);
    refresh();
    toast.done("Deleted.");
  });

  const groups = useMemo(() => {
    const all = menu.data ?? [];
    const needles = tokens(query);
    const shown = all.filter((item) =>
      needles.length === 0 ? true : itemMatches({ haystack: `${item.name} ${item.description} ${item.category}` }, needles)
    );

    const seen: string[] = [];
    for (const item of shown) if (item.category && !seen.includes(item.category)) seen.push(item.category);
    return seen.map((category) => ({ category, items: shown.filter((item) => item.category === category) }));
  }, [menu.data, query]);

  return (
    <DeskPage
      title="Menu"
      hint="Sold out puts a line through it for tonight. Hidden takes it off entirely."
      actions={
        <Button size="sm" tone="primary" icon="plus" onClick={() => setDraft({ ...BLANK })}>
          Add a dish
        </Button>
      }
    >
      <Toolbar>
        <Search value={query} onChange={setQuery} placeholder="Search dishes" />
      </Toolbar>

      <Loaded query={menu}>
        {() =>
          groups.length === 0 ? (
            <Nothing icon="list">Nothing on the menu yet.</Nothing>
          ) : (
            groups.map((group) => (
              <section key={group.category} className="dk-section">
                <h2 className="label">{group.category}</h2>
                <div className="rows rows--inset">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="row dk-dish"
                      data-off={item.is_active === 0 ? "true" : undefined}
                    >
                      <Img src={item.image_url} alt="" ratio={1} radius="var(--r-sm)" className="dk-dish__photo" />

                      <span className="grow stack stack--tight">
                        <span className="bar bar--tight">
                          <span className={item.sold_out === 1 ? "small dk-struck" : "small"}>{item.name}</span>
                          {item.sold_out === 1 ? <State tone="warn">Sold out</State> : null}
                          {item.is_active === 0 ? <State>Hidden</State> : null}
                        </span>
                        <span className="fine faint clip">
                          {item.price_fcfa != null ? `${money(item.price_fcfa)} FCFA` : item.price_label || "By weight"}
                          {item.description ? ` · ${item.description}` : ""}
                        </span>
                      </span>

                      <div className="bar bar--tight nowrap">
                        <Action
                          size="sm"
                          tone={item.sold_out === 1 ? "ghost" : "quiet"}
                          pending={toggleSoldOut.pending}
                          pendingLabel="Saving"
                          onClick={() => void toggleSoldOut.run(item)}
                        >
                          {item.sold_out === 1 ? "Back on" : "Sold out"}
                        </Action>
                        <Action
                          size="sm"
                          tone="quiet"
                          pending={toggleActive.pending}
                          pendingLabel="Saving"
                          onClick={() => void toggleActive.run(item)}
                        >
                          {item.is_active === 0 ? "Show" : "Hide"}
                        </Action>
                        <IconButton
                          name="edit"
                          label={`Edit ${item.name}`}
                          size="sm"
                          onClick={() =>
                            setDraft({
                              id: item.id,
                              category: item.category,
                              name: item.name,
                              description: item.description,
                              price_fcfa: item.price_fcfa != null ? String(item.price_fcfa) : "",
                              price_label: item.price_label ?? "",
                              image_url: item.image_url,
                              dietary_tags: item.dietary_tags,
                              is_active: item.is_active !== 0,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )
        }
      </Loaded>

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === null ? "Add a dish" : "Edit dish"}
        footer={
          <>
            {draft?.id !== null && draft ? (
              <Action
                tone="quiet"
                pending={remove.pending}
                pendingLabel="Deleting"
                onClick={async () => {
                  const sure = await confirm({
                    title: `Delete ${draft.name}?`,
                    body: "This removes it for good. To take it off for tonight only, use Sold out instead.",
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
              disabled={!draft?.name.trim() || !draft?.category.trim()}
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
            <label className="dropzone">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const dataUrl = await readImageFile(file);
                    setDraft({ ...draft, image_url: dataUrl });
                  } catch (error) {
                    toast.failed(error, "upload");
                  }
                }}
              />
              {draft.image_url ? (
                <Img src={draft.image_url} alt="" ratio={4 / 3} />
              ) : (
                <span className="dropzone__prompt fine muted">
                  Add a photograph. Real pictures of your own grill are the single biggest upgrade this site can get.
                </span>
              )}
            </label>

            <TextField
              label="Name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
            <TextField
              label="Category"
              hint="Grouped by this on the menu. Reuse an existing one to keep the list short."
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              required
            />
            <TextAreaField
              label="Description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={2}
              maxLength={300}
            />
            <TextField
              label="Price in FCFA"
              hint="Leave empty for anything sold by weight, and put the wording below instead."
              value={draft.price_fcfa}
              onChange={(event) => setDraft({ ...draft, price_fcfa: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
            />
            <TextField
              label="Price wording"
              hint='Only when there is no fixed price. For example "By weight".'
              value={draft.price_label}
              onChange={(event) => setDraft({ ...draft, price_label: event.target.value })}
            />
            <TextField
              label="Tags"
              hint="Comma separated. Shown as small labels on the dish."
              value={parseTags(draft.dietary_tags).join(", ") || draft.dietary_tags}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  dietary_tags: JSON.stringify(
                    event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                  ),
                })
              }
            />
            <Switch
              label="Showing on the menu"
              hint="Turn this off to take the dish off the site entirely."
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
