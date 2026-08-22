import { useState } from "react";
import { api } from "~/lib/api";
import type { GiftCard } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { money, stampLabel } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Sheet } from "~/ui/Sheet";
import { Code, Meter } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, State, StatTile, Stats, TableWrap } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Issuing gift cards, and seeing what is left on one.
 *
 * A card is money the restaurant already has and owes, so the summary at the top
 * is the outstanding balance across every live card. That is a real liability and
 * it is worth being able to see it in one number.
 *
 * The ledger behind each card is what settles an argument at the counter: it
 * shows every draw-down and every refund, and it is the reason a card can be
 * trusted with a partial spend.
 */
export function GiftCards() {
  const toast = useToast();
  const [issuing, setIssuing] = useState(false);
  const [value, setValue] = useState("5000");
  const [made, setMade] = useState<{ code: string; value_fcfa: number } | null>(null);
  const [ledgerFor, setLedgerFor] = useState<GiftCard | null>(null);

  const cards = useQuery(K.desk.cards, () => api.desk.giftCards.list(), { staleMs: 60_000 });

  const issue = useMutation(async () => {
    const card = await api.desk.giftCards.issue(Number(value));
    setMade(card);
    invalidate("desk.cards*");
    cards.reload();
  });

  const toggle = useMutation(async (id: number) => {
    await api.desk.giftCards.toggle(id);
    invalidate("desk.cards*");
    cards.reload();
  });

  const list = cards.data ?? [];
  const outstanding = list
    .filter((card) => card.is_active === 1)
    .reduce((sum, card) => sum + card.remaining_value_fcfa, 0);

  return (
    <DeskPage
      title="Gift cards"
      hint="Money you already have and still owe."
      actions={
        <Button
          size="sm"
          tone="primary"
          icon="gift"
          onClick={() => {
            setMade(null);
            setIssuing(true);
          }}
        >
          Issue a card
        </Button>
      }
    >
      <Stats>
        <StatTile label="Live cards" value={list.filter((card) => card.is_active === 1).length} />
        <StatTile label="Still owed" value={`${money(outstanding)} FCFA`} note="Across every live card" />
        <StatTile label="Issued, all time" value={list.length} />
      </Stats>

      <Loaded query={cards}>
        {() =>
          list.length === 0 ? (
            <Nothing icon="gift">None issued yet.</Nothing>
          ) : (
            <TableWrap label="Gift cards">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Left</th>
                  <th>Of</th>
                  <th>Issued</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((card) => (
                  <tr key={card.id}>
                    <td>
                      <Code value={card.code} size="sm" />
                    </td>
                    <td className="dk-metercell">
                      <span className="strong nowrap">{money(card.remaining_value_fcfa)} FCFA</span>
                      <Meter
                        value={card.remaining_value_fcfa}
                        max={card.initial_value_fcfa}
                        label={`${card.code} balance`}
                        tone={card.remaining_value_fcfa > 0 ? "good" : "neutral"}
                      />
                    </td>
                    <td className="nowrap fine faint">{money(card.initial_value_fcfa)} FCFA</td>
                    <td className="nowrap fine faint">{stampLabel(card.created_at)}</td>
                    <td>
                      <State tone={card.is_active === 1 ? "good" : "neutral"}>
                        {card.is_active === 1 ? "Live" : "Stopped"}
                      </State>
                    </td>
                    <td>
                      <div className="bar bar--tight nowrap">
                        <Button size="sm" tone="quiet" onClick={() => setLedgerFor(card)}>
                          History
                        </Button>
                        <Action
                          size="sm"
                          tone="quiet"
                          pending={toggle.pendingFor(card.id)}
                          pendingLabel="Saving"
                          onClick={() => void toggle.run(card.id)}
                        >
                          {card.is_active === 1 ? "Stop" : "Restart"}
                        </Action>
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
        open={issuing}
        onClose={() => setIssuing(false)}
        title={made ? "Card issued" : "Issue a gift card"}
        footer={
          made ? (
            <Button tone="primary" block onClick={() => setIssuing(false)}>
              Done
            </Button>
          ) : (
            <Action
              tone="primary"
              block
              pending={issue.pending}
              pendingLabel="Creating"
              disabled={Number(value) < 500}
              onClick={async () => {
                await issue.run();
                const error = issue.readError();
                if (error) toast.failed(error, "desk");
              }}
            >
              Issue it
            </Action>
          )
        }
      >
        {made ? (
          <div className="stack center">
            <p className="label">Give them this code</p>
            <Code value={made.code} size="lg" />
            <p className="lead">Worth {money(made.value_fcfa)} FCFA.</p>
            <p className="fine faint">
              Write it down before you close this. It is not shown again, though you can always find it in the list.
            </p>
          </div>
        ) : (
          <div className="stack">
            <TextField
              label="Value in FCFA"
              hint="Between 500 and 1,000,000."
              value={value}
              onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
            <div className="bar bar--wrap bar--tight">
              {[2500, 5000, 10000, 25000].map((preset) => (
                <Button key={preset} size="sm" tone="ghost" onClick={() => setValue(String(preset))}>
                  {money(preset)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Ledger card={ledgerFor} onClose={() => setLedgerFor(null)} />
    </DeskPage>
  );
}

function Ledger({ card, onClose }: { card: GiftCard | null; onClose: () => void }) {
  const entries = useQuery(
    card ? `desk.cards.ledger.${card.id}` : "desk.cards.ledger.none",
    () => api.desk.giftCards.ledger(card!.id),
    { enabled: card !== null }
  );

  return (
    <Sheet open={card !== null} onClose={onClose} title={card ? `History of ${card.code}` : "History"}>
      {entries.loading ? (
        <p className="fine faint">One moment.</p>
      ) : (entries.data?.length ?? 0) === 0 ? (
        <p className="fine faint">Never used.</p>
      ) : (
        <div className="rows">
          {entries.data?.map((entry, index) => (
            <div key={`${entry.created_at}-${index}`} className="row">
              <span className="grow stack stack--tight">
                <span className="small">{entry.reason}</span>
                <span className="fine faint">{stampLabel(entry.created_at)}</span>
              </span>
              <span className={entry.amount > 0 ? "small strong" : "small"}>
                {entry.amount > 0 ? "+" : ""}
                {money(entry.amount)} FCFA
              </span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
