import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { DeskBooking } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { dayLabel, money, phoneLabel, timeLabel, todayISO } from "~/lib/format";
import { itemMatches, tokens } from "~/lib/search";
import { Action, Button } from "~/ui/Button";
import { TextAreaField, Segmented } from "~/ui/Field";
import { Sheet } from "~/ui/Sheet";
import { Code } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, Search, State, TableWrap, Toolbar } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Every table reservation.
 *
 * The three things staff actually do here: finish one when the guests leave,
 * cancel one with a reason, and put back a cancellation that was a mistake. Each
 * is one tap from the row.
 *
 * A cancellation always carries a reason. Not for bureaucracy: the reason is
 * what the owner reads at the end of the month when they want to know whether
 * they are losing tables to double bookings or to no-shows, and a cancellation
 * with no reason answers nothing.
 */

type Filter = "today" | "upcoming" | "all";

const STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "bad"> = {
  confirmed: "good",
  pending_payment: "warn",
  cancelled: "bad",
  completed: "neutral",
};

const STATUS_WORD: Record<string, string> = {
  confirmed: "Booked",
  pending_payment: "Unpaid",
  cancelled: "Cancelled",
  completed: "Been",
};

export function Bookings() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("today");
  const [query, setQuery] = useState("");
  const [cancelling, setCancelling] = useState<DeskBooking | null>(null);
  const [reason, setReason] = useState("");

  const bookings = useQuery(K.desk.bookings, () => api.desk.bookings.list(), { staleMs: 20_000 });

  const finish = useMutation(async (id: number) => {
    await api.desk.bookings.setStatus(id, "completed");
    invalidate("desk.bookings*");
    bookings.reload();
    toast.done("Marked as been.");
  });

  const restore = useMutation(async (id: number) => {
    await api.desk.bookings.restore(id);
    invalidate("desk.bookings*");
    bookings.reload();
    toast.done("Put back.");
  });

  const cancel = useMutation(async () => {
    if (!cancelling) return;
    await api.desk.bookings.cancel(cancelling.id, reason.trim());
    invalidate("desk.bookings*");
    bookings.reload();
    setCancelling(null);
    setReason("");
    toast.done("Cancelled.");
  });

  const shown = useMemo(() => {
    const all = bookings.data ?? [];
    const today = todayISO();
    const needles = tokens(query);

    return all
      .filter((booking) => {
        if (filter === "today" && booking.date !== today) return false;
        if (filter === "upcoming" && booking.date < today) return false;
        if (needles.length === 0) return true;
        return itemMatches(
          { haystack: `${booking.user_name} ${booking.user_email} ${booking.phone} ${booking.ccm_code ?? ""}` },
          needles
        );
      })
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [bookings.data, filter, query]);

  return (
    <DeskPage title="Bookings" hint="Finish one when they leave, or cancel it with a reason.">
      <Toolbar>
        <Segmented
          value={filter}
          onChange={setFilter}
          label="Which bookings"
          options={[
            { value: "today", label: "Today" },
            { value: "upcoming", label: "Coming up" },
            { value: "all", label: "All" },
          ]}
        />
        <Search value={query} onChange={setQuery} placeholder="Name, phone or code" />
      </Toolbar>

      <Loaded query={bookings}>
        {() =>
          shown.length === 0 ? (
            <Nothing icon="calendar">Nothing here.</Nothing>
          ) : (
            <TableWrap label="Bookings">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Guest</th>
                  <th>Covers</th>
                  <th>Table</th>
                  <th>Code</th>
                  <th>Paid</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((booking) => (
                  <tr key={booking.id}>
                    <td className="nowrap">
                      <span className="strong">{timeLabel(booking.time)}</span>
                      <span className="fine faint"> {dayLabel(booking.date)}</span>
                    </td>
                    <td>
                      <span className="dk-cell">
                        <span>{booking.user_name}</span>
                        <span className="fine faint">{booking.phone ? phoneLabel(booking.phone) : booking.user_email}</span>
                      </span>
                    </td>
                    <td>{booking.party_size}</td>
                    <td>{booking.table_label ?? "Any"}</td>
                    <td>{booking.ccm_code ? <Code value={booking.ccm_code} size="sm" /> : <span className="faint">None</span>}</td>
                    <td className="nowrap">
                      {booking.amount_fcfa ? `${money(booking.amount_fcfa)} FCFA` : <span className="faint">Not yet</span>}
                    </td>
                    <td>
                      <State tone={STATUS_TONE[booking.status] ?? "neutral"}>
                        {STATUS_WORD[booking.status] ?? booking.status}
                      </State>
                    </td>
                    <td>
                      <div className="bar bar--tight nowrap">
                        {booking.status === "cancelled" ? (
                          <Action
                            size="sm"
                            tone="ghost"
                            pending={restore.pending}
                            pendingLabel="Putting back"
                            onClick={() => void restore.run(booking.id)}
                          >
                            Put back
                          </Action>
                        ) : (
                          <>
                            {booking.status !== "completed" ? (
                              <Action
                                size="sm"
                                tone="ghost"
                                pending={finish.pending}
                                pendingLabel="Saving"
                                onClick={() => void finish.run(booking.id)}
                              >
                                Been
                              </Action>
                            ) : null}
                            <Button
                              size="sm"
                              tone="quiet"
                              onClick={() => {
                                setCancelling(booking);
                                setReason("");
                              }}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
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
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this booking"
        footer={
          <>
            <Button tone="quiet" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Action
              tone="danger"
              pending={cancel.pending}
              pendingLabel="Cancelling"
              disabled={reason.trim().length < 3}
              onClick={async () => {
                await cancel.run();
                const error = cancel.readError();
                if (error) toast.failed(error, "desk");
              }}
            >
              Cancel it
            </Action>
          </>
        }
      >
        <div className="stack">
          {cancelling ? (
            <p className="lead">
              {cancelling.user_name}, {dayLabel(cancelling.date)} at {timeLabel(cancelling.time)}.
            </p>
          ) : null}

          <TextAreaField
            label="Why"
            hint="The owner reads these to work out where tables are being lost. Say what actually happened."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={200}
          />

          <div className="bar bar--wrap bar--tight">
            {["Guest cancelled", "No show", "Double booked", "We are closed"].map((preset) => (
              <Button key={preset} size="sm" tone="ghost" onClick={() => setReason(preset)}>
                {preset}
              </Button>
            ))}
          </div>
        </div>
      </Sheet>
    </DeskPage>
  );
}
