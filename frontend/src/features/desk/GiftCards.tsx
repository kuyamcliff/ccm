import { useState } from "react";
import { api } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { Money, Meter } from "~/ui/Bits";
import { TextField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, Stat, TableWrap } from "./parts";

/**
 * Gift cards.
 *
 * A card is created here and its code is shown once, on this screen, right
 * after it is made: that is the moment somebody writes it on the card they are
 * handing over. The code stays in the table afterwards, since staff need to
 * read it back when a customer has lost theirs.
 */
export function GiftCards() {
  const cards = useResource(() => api.desk.giftCards.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [issuing, setIssuing] = useState(false);
  const [value, setValue] = useState(5000);
  const [justIssued, setJustIssued] = useState<{ code: string; value_fcfa: number } | null>(null);

  const rows = cards.data ?? [];
  const outstanding = rows.filter((card) => card.is_active === 1).reduce((sum, card) => sum + card.remaining_value_fcfa, 0);

  return (
    <DeskPage
      title="Gift cards"
      lead="Money already taken, waiting to be eaten."
      actions={
        <Button tone="primary" icon="plus" onClick={() => setIssuing(true)}>
          Issue a card
        </Button>
      }
    >
      {confirmElement}

      <div className="stat-grid">
        <Stat label="Cards" value={rows.length} icon="gift" />
        <Stat label="Still owed" value={outstanding} money icon="wallet" hint="What you would have to serve if every card came in" />
      </div>

      {justIssued ? (
        <Notice tone="good" title="Card created">
          Write this on the card now: <strong className="mono">{justIssued.code}</strong> worth{" "}
          <Money value={justIssued.value_fcfa} />.
        </Notice>
      ) : null}

      <Loaded resource={cards}>
        {(list) =>
          list.length === 0 ? (
            <Nothing>No gift cards yet.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Code</th>
                  <th className="table__num">Loaded</th>
                  <th className="table__num">Left</th>
                  <th>Spent</th>
                  <th>Made</th>
                  <th>Usable</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((card) => (
                  <tr key={card.id}>
                    <td className="mono">{card.code}</td>
                    <td className="table__num">
                      <Money value={card.initial_value_fcfa} />
                    </td>
                    <td className="table__num">
                      <Money value={card.remaining_value_fcfa} />
                    </td>
                    <td style={{ minWidth: "8rem" }}>
                      <Meter
                        value={card.initial_value_fcfa - card.remaining_value_fcfa}
                        max={card.initial_value_fcfa}
                        label={`${card.code} spent`}
                      />
                    </td>
                    <td className="fine faint">{stampLabel(card.created_at)}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={card.is_active === 1}
                          onChange={async () => {
                            try {
                              await api.desk.giftCards.toggle(card.id);
                              cards.reload();
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        />
                        <span className="switch__track" aria-hidden="true" />
                        <span className="sr-only">Card {card.code} usable</span>
                      </label>
                    </td>
                    <td>
                      <IconButton
                        name="ban"
                        label={`Void ${card.code}`}
                        size="sm"
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Void ${card.code}?`,
                            body: `It still has ${card.remaining_value_fcfa.toLocaleString("en-US")} FCFA on it. Whoever holds it will not be able to spend that.`,
                            confirmLabel: "Void it",
                          });
                          if (!ok) return;
                          try {
                            await api.desk.giftCards.deactivate(card.id);
                            cards.reload();
                            toast.done("Card voided.");
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
        open={issuing}
        onClose={() => setIssuing(false)}
        title="Issue a gift card"
        description="The code is generated for you and shown once it is made."
        footer={
          <>
            <Button tone="ghost" onClick={() => setIssuing(false)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              onClick={async () => {
                try {
                  const created = await api.desk.giftCards.issue(value);
                  setJustIssued(created);
                  setIssuing(false);
                  cards.reload();
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Create it
            </Button>
          </>
        }
      >
        <TextField
          label="Value in FCFA"
          type="number"
          min={500}
          step={500}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      </Sheet>
    </DeskPage>
  );
}
