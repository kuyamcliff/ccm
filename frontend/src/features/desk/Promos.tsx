import { useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { money, todayISO } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { TextField, Segmented } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Code } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, State, TableWrap } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Discount codes.
 *
 * The two numbers that matter on each row are how many times it has been used
 * and how many are left, because that is what tells the owner whether a code
 * they put on a poster is doing anything.
 *
 * Codes are never deleted while they have uses on them: retiring one keeps the
 * record of what it cost, and a deleted code makes an old order impossible to
 * explain.
 */

interface Draft {
  code: string;
  type: "percent" | "flat";
  value: string;
  description: string;
  min_spend_fcfa: string;
  max_uses: string;
  expires_at: string;
}

const BLANK: Draft = {
  code: "",
  type: "percent",
  value: "10",
  description: "",
  min_spend_fcfa: "",
  max_uses: "",
  expires_at: "",
};

export function Promos() {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);

  const promos = useQuery(K.desk.promos, () => api.desk.promos.list(), { staleMs: 60_000 });

  const create = useMutation(async () => {
    if (!draft) return;
    await api.desk.promos.create({
      code: draft.code.trim().toUpperCase(),
      type: draft.type,
      value: Number(draft.value) || 0,
      description: draft.description.trim(),
      min_spend_fcfa: draft.min_spend_fcfa ? Number(draft.min_spend_fcfa) : 0,
      max_uses: draft.max_uses ? Number(draft.max_uses) : null,
      expires_at: draft.expires_at || null,
    });
    setDraft(null);
    invalidate("desk.promos*");
    promos.reload();
    toast.done("Code created.");
  });

  const setActive = useMutation(async (input: { id: number; active: boolean }) => {
    await api.desk.promos.setActive(input.id, input.active);
    invalidate("desk.promos*");
    promos.reload();
  });

  const remove = useMutation(async (id: number) => {
    await api.desk.promos.remove(id);
    invalidate("desk.promos*");
    promos.reload();
    toast.done("Deleted.");
  });

  return (
    <DeskPage
      title="Promo codes"
      hint="Retire a code rather than deleting it once it has been used."
      actions={
        <Button size="sm" tone="primary" icon="plus" onClick={() => setDraft({ ...BLANK })}>
          New code
        </Button>
      }
    >
      <Loaded query={promos}>
        {(list) =>
          list.length === 0 ? (
            <Nothing icon="tag">No codes yet.</Nothing>
          ) : (
            <TableWrap label="Promo codes">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Takes off</th>
                  <th>Used</th>
                  <th>Minimum</th>
                  <th>Expires</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((promo) => (
                  <tr key={promo.id}>
                    <td>
                      <span className="dk-cell">
                        <Code value={promo.code} size="sm" />
                        {promo.description ? <span className="fine faint">{promo.description}</span> : null}
                      </span>
                    </td>
                    <td className="nowrap strong">
                      {promo.type === "percent" ? `${promo.value}%` : `${money(promo.value)} FCFA`}
                    </td>
                    <td className="nowrap">
                      {promo.uses_count}
                      {promo.max_uses ? <span className="fine faint"> of {promo.max_uses}</span> : null}
                    </td>
                    <td className="nowrap fine">
                      {promo.min_spend_fcfa > 0 ? `${money(promo.min_spend_fcfa)} FCFA` : "None"}
                    </td>
                    <td className="nowrap fine">{promo.expires_at ?? "Never"}</td>
                    <td>
                      <State tone={promo.is_active === 1 ? "good" : "neutral"}>
                        {promo.is_active === 1 ? "Live" : "Retired"}
                      </State>
                    </td>
                    <td>
                      <div className="bar bar--tight nowrap">
                        <Action
                          size="sm"
                          tone="quiet"
                          pending={setActive.pending}
                          pendingLabel="Saving"
                          onClick={() => void setActive.run({ id: promo.id, active: promo.is_active === 0 })}
                        >
                          {promo.is_active === 1 ? "Retire" : "Bring back"}
                        </Action>
                        {promo.uses_count === 0 ? (
                          <Button
                            size="sm"
                            tone="quiet"
                            onClick={async () => {
                              const sure = await confirm({
                                title: `Delete ${promo.code}?`,
                                body: "It has never been used, so nothing depends on it.",
                                confirmLabel: "Delete it",
                              });
                              if (!sure) return;
                              await remove.run(promo.id);
                            }}
                          >
                            Delete
                          </Button>
                        ) : null}
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
        title="New promo code"
        footer={
          <Action
            tone="primary"
            block
            pending={create.pending}
            pendingLabel="Saving"
            disabled={!draft?.code.trim() || !draft?.value}
            onClick={async () => {
              await create.run();
              const error = create.readError();
              if (error) toast.failed(error, "desk");
            }}
          >
            Create it
          </Action>
        }
      >
        {draft ? (
          <div className="stack">
            <TextField
              label="The code"
              hint="What people type. Capitals, no spaces."
              value={draft.code}
              onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase().replace(/\s/g, "") })}
              autoCapitalize="characters"
              required
            />

            <Segmented
              value={draft.type}
              onChange={(type) => setDraft({ ...draft, type })}
              label="What kind"
              options={[
                { value: "percent", label: "Percentage" },
                { value: "flat", label: "Fixed amount" },
              ]}
            />

            <TextField
              label={draft.type === "percent" ? "Percent off" : "FCFA off"}
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              required
            />

            <TextField
              label="What it is for"
              hint="Only you see this. It is how you remember which poster it went on."
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />

            <TextField
              label="Minimum spend"
              hint="Leave empty for no minimum."
              value={draft.min_spend_fcfa}
              onChange={(event) => setDraft({ ...draft, min_spend_fcfa: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
            />

            <TextField
              label="How many times it can be used"
              hint="Leave empty for unlimited. A code with no limit on social media is a code somebody screenshots."
              value={draft.max_uses}
              onChange={(event) => setDraft({ ...draft, max_uses: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
            />

            <TextField
              label="Expires"
              type="date"
              min={todayISO()}
              value={draft.expires_at}
              onChange={(event) => setDraft({ ...draft, expires_at: event.target.value })}
            />
          </div>
        ) : null}
      </Sheet>

      {element}
    </DeskPage>
  );
}
