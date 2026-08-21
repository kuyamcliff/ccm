import { useState } from "react";
import { api, EVENT_TYPES } from "~/lib/api";
import type { EventType } from "~/lib/api";
import { useMutation } from "~/lib/store";
import { normalisePhone, todayISO } from "~/lib/format";
import { Action, LinkButton } from "~/ui/Button";
import { TextField, TextAreaField, SelectField, PhoneField, Counter, Field } from "~/ui/Field";
import { EmptyState } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useCopy } from "~/state/locale";

/**
 * Booking the place out.
 *
 * An enquiry, not a booking: a birthday for forty people is a conversation, and
 * pretending a form can settle it would set an expectation the restaurant then
 * has to walk back. So the form collects enough to have that conversation and
 * says plainly that somebody will come back to them.
 *
 * The enquiry lands in Desk > Events.
 */
export function EventsPage() {
  const { c } = useCopy();
  const { user } = useSession();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<EventType>("birthday");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [guests, setGuests] = useState(20);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const send = useMutation(async () => {
    await api.site.enquireAboutEvent({
      name: name.trim(),
      email: email.trim(),
      phone: normalisePhone(phone),
      event_type: type,
      date,
      time,
      guest_count: guests,
      note: note.trim() || undefined,
    });
    setSent(true);
    toast.done(c.events.sent);
  });

  if (sent) {
    return (
      <div className="page section">
        <EmptyState
          icon="check-circle"
          title={c.events.sent}
          body="Somebody will be in touch to talk it through and confirm what we can do."
          action={
            <LinkButton to="/menu" tone="ghost" size="sm">
              {c.nav.menu}
            </LinkButton>
          }
        />
      </div>
    );
  }

  const ready = name.trim().length > 1 && email.trim().includes("@") && normalisePhone(phone).length === 9 && date;

  return (
    <div className="page section stack">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.events.title}</h1>
        <p className="lead">{c.events.lead}</p>
      </header>

      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          await send.run();
          const error = send.readError();
          if (error) toast.failed(error, "enquire");
        }}
      >
        <SelectField label={c.events.type} value={type} onChange={(event) => setType(event.target.value as EventType)}>
          {EVENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {c.events.types[value]}
            </option>
          ))}
        </SelectField>

        <div className="pair">
          <TextField
            label={c.events.when}
            type="date"
            value={date}
            min={todayISO()}
            onChange={(event) => setDate(event.target.value)}
            required
          />
          <TextField
            label={c.book.time}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </div>

        <Field label={c.events.guests}>
          {() => <Counter value={guests} onChange={setGuests} min={2} max={200} label={c.events.guests} />}
        </Field>

        <TextField
          label={c.auth.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />

        <TextField
          label={c.auth.email}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />

        <PhoneField label={c.queue.phone} value={phone} onChange={setPhone} required />

        <TextAreaField
          label={c.events.note}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What is the occasion, and is there anything you need from us?"
          rows={4}
        />

        <Action
          type="submit"
          tone="primary"
          block
          pending={send.pending}
          pendingLabel={c.pending.sending}
          disabled={!ready}
        >
          {c.events.send}
        </Action>
      </form>
    </div>
  );
}
