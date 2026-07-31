import { useState } from "react";
import { api } from "~/lib/api";
import { dayLabel, stampLabel, timeLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Money as Amount } from "~/ui/Bits";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, Stat, State, TableWrap, Toolbar } from "./parts";

/**
 * Money in.
 *
 * Two views of the same events: payments, which is every attempt including the
 * ones that failed, and receipts, which is only what settled. The failed
 * attempts matter — a customer saying "it took my money" is usually a pending
 * prompt that never got a PIN, and this is where that gets checked.
 *
 * Marking a payment settled by hand is possible and deliberately awkward: it
 * moves money in the books without moving any, so it asks first.
 */
export function MoneyDesk() {
  const payments = useResource(() => api.desk.money.payments(), []);
  const receipts = useResource(() => api.desk.money.receipts(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const [tab, setTab] = useState<"payments" | "receipts">("payments");

  const rows = payments.data ?? [];
  const settled = rows.filter((payment) => payment.status === "completed");
  const taken = settled.reduce((sum, payment) => sum + payment.amount_fcfa, 0);
  const pending = rows.filter((payment) => payment.status === "pending").length;
  const failed = rows.filter((payment) => payment.status === "failed").length;

  async function mark(id: number, status: "completed" | "failed") {
    const ok = await confirm({
      title: status === "completed" ? "Mark this as paid?" : "Mark this as failed?",
      body:
        status === "completed"
          ? "Only do this when you have seen the money arrive in the mobile money account. It confirms the booking."
          : "The customer will be able to try paying again.",
      confirmLabel: status === "completed" ? "Mark paid" : "Mark failed",
      destructive: status === "failed",
    });
    if (!ok) return;

    try {
      await api.desk.money.setPaymentStatus(id, status);
      payments.reload();
      receipts.reload();
      toast.done("Payment updated.");
    } catch (err) {
      toast.failed(err);
    }
  }

  return (
    <DeskPage title="Payments">
      {confirmElement}

      <div className="stat-grid">
        <Stat label="Taken" value={taken} money icon="wallet" hint={`${settled.length} payments`} />
        <Stat label="Waiting on a PIN" value={pending} icon="clock" />
        <Stat label="Failed" value={failed} icon="alert" />
      </div>

      <div className="tabs" role="tablist" aria-label="Money views">
        <button type="button" role="tab" className="tab" aria-selected={tab === "payments"} onClick={() => setTab("payments")}>
          Every attempt
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "receipts"} onClick={() => setTab("receipts")}>
          Receipts
        </button>
      </div>

      {tab === "payments" ? (
        <>
          <Toolbar>
            <Button tone="ghost" icon="refresh" onClick={payments.reload}>
              Refresh
            </Button>
          </Toolbar>

          <Loaded resource={payments}>
            {(list) =>
              list.length === 0 ? (
                <Nothing>No payments yet.</Nothing>
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>For</th>
                      <th className="table__num">Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Reference</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((payment) => (
                      <tr key={payment.id}>
                        <td>{payment.user_name}</td>
                        <td className="fine">
                          {payment.res_date ? (
                            <>
                              {dayLabel(payment.res_date)} {timeLabel(payment.res_time)}
                            </>
                          ) : (
                            payment.type
                          )}
                        </td>
                        <td className="table__num">
                          <Amount value={payment.amount_fcfa} />
                        </td>
                        <td className="fine">{payment.method ?? "mtn_momo"}</td>
                        <td>
                          <State value={payment.status} />
                        </td>
                        <td className="mono fine">{payment.reference}</td>
                        <td>
                          {payment.status === "pending" ? (
                            <div className="table__actions">
                              <Button size="sm" tone="ghost" onClick={() => mark(payment.id, "completed")}>
                                Paid
                              </Button>
                              <Button size="sm" tone="danger" onClick={() => mark(payment.id, "failed")}>
                                Failed
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )
            }
          </Loaded>
        </>
      ) : (
        <Loaded resource={receipts}>
          {(list) =>
            list.length === 0 ? (
              <Nothing>Nothing settled yet.</Nothing>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Booking</th>
                    <th>Code</th>
                    <th className="table__num">Paid</th>
                    <th>Reference</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((receipt) => (
                    <tr key={receipt.id}>
                      <td>
                        {receipt.user_name}
                        <span className="fine faint"> {receipt.user_email}</span>
                      </td>
                      <td className="fine">
                        {dayLabel(receipt.date)} {timeLabel(receipt.time)}
                      </td>
                      <td className="mono fine">{receipt.ccm_code}</td>
                      <td className="table__num">
                        {receipt.amount_fcfa ? <Amount value={receipt.amount_fcfa} /> : "—"}
                      </td>
                      <td className="mono fine">{receipt.pay_reference}</td>
                      <td className="fine faint">{stampLabel(receipt.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )
          }
        </Loaded>
      )}
    </DeskPage>
  );
}
