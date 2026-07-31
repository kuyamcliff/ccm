import { useState } from "react";
import { api } from "~/lib/api";
import { longDate } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { Money } from "~/ui/Bits";
import { SelectField, TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, TableWrap } from "./parts";

/**
 * Discount codes.
 *
 * A code that has been used cannot be edited, only switched off: changing the
 * value under a code somebody already redeemed would rewrite what they were
 * charged. So this screen creates and retires, and never edits in place.
 */
export function Promos() {
  const codes = useResource(() => api.desk.promos.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    code: "",
    type: "percent" as "percent" | "flat",
    value: 10,
    description: "",
    min_spend_fcfa: 0,
    max_uses: "",
    expires_at: "",
  });

  return (
    <DeskPage
      title="Promo codes"
      lead="Used at checkout and when paying a table deposit."
      actions={
        <Button tone="primary" icon="plus" onClick={() => setAdding(true)}>
          New code
        </Button>
      }
    >
      {confirmElement}

      <Loaded resource={codes}>
        {(rows) =>
          rows.length === 0 ? (
            <Nothing>No codes yet.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Takes off</th>
                  <th>Minimum spend</th>
                  <th className="table__num">Used</th>
                  <th>Expires</th>
                  <th>Live</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((code) => (
                  <tr key={code.id}>
                    <td>
                      <strong className="mono">{code.code}</strong>
                      <p className="fine faint">{code.description}</p>
                    </td>
                    <td>{code.type === "percent" ? `${code.value}%` : <Money value={code.value} />}</td>
                    <td>{code.min_spend_fcfa > 0 ? <Money value={code.min_spend_fcfa} /> : "None"}</td>
                    <td className="table__num">
                      {code.uses_count}
                      {code.max_uses ? <span className="faint"> of {code.max_uses}</span> : null}
                    </td>
                    <td className="fine">{code.expires_at ? longDate(code.expires_at) : "Never"}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={code.is_active === 1}
                          onChange={async (event) => {
                            try {
                              await api.desk.promos.setActive(code.id, event.target.checked);
                              codes.reload();
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        />
                        <span className="switch__track" aria-hidden="true" />
                        <span className="sr-only">{code.code} usable</span>
                      </label>
                    </td>
                    <td>
                      <IconButton
                        name="trash"
                        label={`Delete ${code.code}`}
                        size="sm"
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Delete ${code.code}?`,
                            body:
                              code.uses_count > 0
                                ? `It has been used ${code.uses_count} times. Switching it off keeps the record; deleting loses it.`
                                : "It has never been used.",
                            confirmLabel: "Delete",
                          });
                          if (!ok) return;
                          try {
                            await api.desk.promos.remove(code.id);
                            codes.reload();
                            toast.done("Deleted.");
                          } catch (err) {
                            toast.failed(err);
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="New promo code"
        footer={
          <>
            <Button tone="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              onClick={async () => {
                if (draft.code.trim().length < 3) {
                  toast.failed(new Error("A code needs at least three characters."));
                  return;
                }
                try {
                  await api.desk.promos.create({
                    code: draft.code.trim().toUpperCase(),
                    type: draft.type,
                    value: draft.value,
                    description: draft.description,
                    min_spend_fcfa: draft.min_spend_fcfa,
                    max_uses: draft.max_uses ? Number(draft.max_uses) : null,
                    expires_at: draft.expires_at || null,
                  });
                  setAdding(false);
                  codes.reload();
                  toast.done("Code created.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <TextField
          label="The code"
          hint="Written in capitals wherever it appears."
          value={draft.code}
          maxLength={30}
          autoCapitalize="characters"
          onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          required
        />
        <SelectField
          label="Kind"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as "percent" | "flat" })}
        >
          <option value="percent">A percentage off</option>
          <option value="flat">A fixed amount off</option>
        </SelectField>
        <TextField
          label={draft.type === "percent" ? "Percent off" : "FCFA off"}
          type="number"
          min={1}
          value={draft.value}
          onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
        />
        <TextField
          label="What it is for"
          placeholder="Opening week"
          value={draft.description}
          maxLength={200}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        <TextField
          label="Minimum spend in FCFA"
          type="number"
          min={0}
          value={draft.min_spend_fcfa}
          onChange={(e) => setDraft({ ...draft, min_spend_fcfa: Number(e.target.value) })}
        />
        <TextField
          label="How many times it can be used"
          type="number"
          min={1}
          placeholder="Leave empty for no limit"
          value={draft.max_uses}
          onChange={(e) => setDraft({ ...draft, max_uses: e.target.value })}
        />
        <TextField
          label="Last day"
          type="date"
          value={draft.expires_at}
          onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })}
        />
      </Sheet>
    </DeskPage>
  );
}
