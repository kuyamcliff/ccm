import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { money } from "~/lib/format";
import { itemMatches, tokens } from "~/lib/search";
import { Action } from "~/ui/Button";
import { Segmented } from "~/ui/Field";
import { useConfirm } from "~/ui/Sheet";
import { Code } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, Search, State, StatTile, Stats, TableWrap, Toolbar } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Every mobile money attempt, including the ones that failed.
 *
 * The failures are the point. A payment that never completed is a guest sitting
 * somewhere thinking they have a table, and the only way anybody finds out is by
 * looking here. So failed is a tab of its own rather than a row colour buried in
 * a list of six hundred.
 *
 * Marking one completed by hand exists for the case the wallet settled but the
 * webhook never arrived. It asks first, and it is audited, because it is the one
 * button in the console that says money arrived without any money arriving.
 */

type Tab = "all" | "pending" | "failed";

export function Money() {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const payments = useQuery(K.desk.payments, () => api.desk.money.payments(), { staleMs: 30_000 });

  const setStatus = useMutation(async (input: { id: number; status: "completed" | "failed" }) => {
    await api.desk.money.setPaymentStatus(input.id, input.status);
    invalidate("desk.payments*");
    payments.reload();
    toast.done("Saved.");
  });

  const all = payments.data ?? [];

  const totals = useMemo(
    () => ({
      taken: all.filter((p) => p.status === "completed").reduce((sum, p) => sum + p.amount_fcfa, 0),
      pending: all.filter((p) => p.status === "pending").length,
      failed: all.filter((p) => p.status === "failed").length,
    }),
    [all]
  );

  const shown = useMemo(() => {
    const needles = tokens(query);
    return all
      .filter((payment) => {
        if (tab !== "all" && payment.status !== tab) return false;
        if (needles.length === 0) return true;
        return itemMatches({ haystack: `${payment.user_name} ${payment.reference} ${payment.method ?? ""}` }, needles);
      })
      .slice(0, 300);
  }, [all, tab, query]);

  return (
    <DeskPage title="Payments" hint="Every attempt, including the ones that did not go through.">
      <Stats>
        <StatTile label="Taken" value={`${money(totals.taken)} FCFA`} />
        <StatTile label="Still pending" value={totals.pending} />
        <StatTile label="Failed" value={totals.failed} note="Somebody may think they have a table" />
      </Stats>

      <Toolbar>
        <Segmented
          value={tab}
          onChange={setTab}
          label="Which payments"
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: totals.pending > 0 ? `Pending (${totals.pending})` : "Pending" },
            { value: "failed", label: totals.failed > 0 ? `Failed (${totals.failed})` : "Failed" },
          ]}
        />
        <Search value={query} onChange={setQuery} placeholder="Name or reference" />
      </Toolbar>

      <Loaded query={payments}>
        {() =>
          shown.length === 0 ? (
            <Nothing icon="wallet">Nothing here.</Nothing>
          ) : (
            <TableWrap label="Payments">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>For</th>
                  <th>Amount</th>
                  <th>How</th>
                  <th>Reference</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.user_name}</td>
                    <td className="nowrap fine faint">
                      {payment.res_date} {payment.res_time}
                    </td>
                    <td className="nowrap strong">{money(payment.amount_fcfa)} FCFA</td>
                    <td className="fine">{payment.method ?? "Unknown"}</td>
                    <td>
                      <Code value={payment.reference} size="sm" />
                    </td>
                    <td>
                      <State
                        tone={
                          payment.status === "completed" ? "good" : payment.status === "failed" ? "bad" : "warn"
                        }
                      >
                        {payment.status === "completed" ? "Paid" : payment.status === "failed" ? "Failed" : "Pending"}
                      </State>
                    </td>
                    <td>
                      {payment.status !== "completed" ? (
                        <Action
                          size="sm"
                          tone="ghost"
                          pending={setStatus.pendingFor(payment.id)}
                          pendingLabel="Saving"
                          onClick={async () => {
                            const sure = await confirm({
                              title: "Mark this as paid?",
                              body: "Only when the money really did arrive and the wallet failed to tell us. This is written to the audit log.",
                              confirmLabel: "It was paid",
                              tone: "primary",
                            });
                            if (!sure) return;
                            await setStatus.run({ id: payment.id, status: "completed" });
                          }}
                        >
                          Mark paid
                        </Action>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>

      {element}
    </DeskPage>
  );
}

/* The routes file imports this name. */
export { Money as MoneyDesk };
