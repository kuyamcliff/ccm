import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { phoneLabel, stampLabel } from "~/lib/format";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Loaded, Nothing, State, StatTile, Stats, TableWrap } from "./parts";

/**
 * What the restaurant has actually said to people, and whether it arrived.
 *
 * ── Why this screen exists ─────────────────────────────────────────────────
 *
 * The site now sends reminders 24 hours and 3 hours before a booking, plus the
 * order-ready and queue messages it always sent. All of that happens somewhere
 * nobody can see, to phones nobody in the restaurant is holding. When a guest
 * says "you never told me", this is the screen that answers.
 *
 * ── "Logged" is not "sent" ─────────────────────────────────────────────────
 *
 * With no messaging credentials configured, `notify()` writes the message down
 * and does not send it. That is the right behaviour for a development
 * environment and a silent disaster in a real one, so it gets its own status
 * word here and a notice at the top rather than being quietly counted as a
 * success.
 */

const TEMPLATE_WORD: Record<string, string> = {
  booking_confirmed: "Booking confirmed",
  booking_reminder_24h: "Reminder, day before",
  booking_reminder_3h: "Reminder, three hours",
  booking_cancelled: "Booking cancelled",
  payment_failed: "Payment failed",
  takeaway_ready: "Order ready",
  waitlist_ready: "Table ready",
};

const STATUS: Record<string, { tone: "good" | "warn" | "bad" | "neutral"; word: string }> = {
  sent: { tone: "good", word: "Sent" },
  logged: { tone: "warn", word: "Written down only" },
  failed: { tone: "bad", word: "Failed" },
  skipped: { tone: "neutral", word: "Skipped" },
};

export function Reminders() {
  const notifications = useQuery(K.desk.notifications, () => api.desk.notifications(), { staleMs: 60_000 });

  return (
    <DeskPage title="Reminders" hint="Every message the site has sent, and whether it got there.">
      <Loaded query={notifications}>
        {(data) => {
          const list = data.notifications;
          const sent = list.filter((entry) => entry.status === "sent").length;
          const logged = list.filter((entry) => entry.status === "logged").length;
          const failed = list.filter((entry) => entry.status === "failed").length;

          return (
            <>
              {!data.delivery_enabled ? (
                <Notice tone="warn" title="Nothing is actually being sent">
                  No WhatsApp or SMS credentials are configured in this environment, so messages are written down here
                  and go no further. Reminders will not reach anybody until that is set up.
                </Notice>
              ) : null}

              <Stats>
                <StatTile label="Sent" value={sent} />
                <StatTile label="Written down only" value={logged} note={logged > 0 ? "Never left the server" : undefined} />
                <StatTile label="Failed" value={failed} />
              </Stats>

              {list.length === 0 ? (
                <Nothing icon="bell">Nothing sent yet.</Nothing>
              ) : (
                <TableWrap label="Messages">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>What</th>
                      <th>To</th>
                      <th>How</th>
                      <th>State</th>
                      <th>The message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((entry) => {
                      const status = STATUS[entry.status] ?? STATUS.skipped!;
                      return (
                        <tr key={entry.id}>
                          <td className="nowrap fine faint">{stampLabel(entry.sent_at ?? entry.created_at ?? null)}</td>
                          <td className="nowrap">{TEMPLATE_WORD[entry.template] ?? entry.template}</td>
                          <td className="nowrap fine">{phoneLabel(entry.recipient)}</td>
                          <td className="fine faint">{entry.channel}</td>
                          <td>
                            <State tone={status.tone}>{status.word}</State>
                            {entry.error ? <span className="fine faint"> {entry.error}</span> : null}
                          </td>
                          <td className="dk-wrapcell fine">{entry.body}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )}
            </>
          );
        }}
      </Loaded>
    </DeskPage>
  );
}
