import { useState } from "react";
import { api, EVENT_TYPES } from "~/lib/api";
import type { EventType } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { normalisePhone, todayISO } from "~/lib/format";
import { useAction } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { PhoneField, SelectField, TextAreaField, TextField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";

/**
 * Private events.
 *
 * This is an enquiry, not a booking, and the page says so: parties this size
 * get quoted and confirmed by a person. Pretending otherwise would have people
 * turning up to a room nobody set up.
 */

const LABELS: Record<EventType, string> = {
  birthday: "Birthday",
  corporate: "Company do",
  private_dining: "Private dining",
  wedding: "Wedding",
  other: "Something else",
};

export function EventsPage() {
  const { user } = useSession();
  const { phone: venuePhone, phoneHref } = useVenue();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<EventType>("birthday");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [guests, setGuests] = useState(20);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = useAction(api.site.enquireAboutEvent);

  if (sent) {
    return (
      <div className="page section stack stack--loose" style={{ maxWidth: "32rem" }}>
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Enquiry sent</h1>
        </div>
        <p className="lead">
          We will come back to you on {email} or {phone} to talk through the food and the room. If it is soon, calling is
          faster.
        </p>
        {phoneHref ? (
          <a className="btn btn--primary" href={phoneHref}>
            Call {venuePhone}
          </a>
        ) : null}
        <LinkButton to="/" tone="ghost">
          Back to the start
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Book the place out</h1>
        <p className="lead">
          Birthdays, company nights, anything from 5 people up. Tell us what you have in mind and we will work out the
          food and the price with you.
        </p>
      </div>

      <form
        className="card stack"
        style={{ maxWidth: "38rem" }}
        onSubmit={async (event) => {
          event.preventDefault();
          setProblem(null);
          const digits = normalisePhone(phone);
          if (!date) {
            setProblem("Pick a date, even a rough one.");
            return;
          }
          if (digits.length < 8) {
            setProblem("Enter a phone number we can reach you on.");
            return;
          }
          const result = await send.run({
            name: name.trim(),
            email: email.trim(),
            phone: digits,
            event_type: type,
            date,
            time,
            guest_count: guests,
            note: note.trim() || undefined,
          });
          if (!result) {
            const failure = send.readError();
            setProblem(failure instanceof ApiError ? failure.message : "That did not send.");
            return;
          }
          setSent(true);
        }}
      >
        <div className="grid grid--two">
          <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <PhoneField label="Phone number" value={phone} onChange={setPhone} required />

        <SelectField label="What is the occasion" value={type} onChange={(e) => setType(e.target.value as EventType)}>
          {EVENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {LABELS[value]}
            </option>
          ))}
        </SelectField>

        <div className="grid grid--two">
          <TextField
            label="Date"
            type="date"
            min={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <TextField label="Start time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>

        <TextField
          label="How many people"
          type="number"
          inputMode="numeric"
          min={5}
          max={500}
          hint="Between 5 and 500. A rough number is fine."
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          required
        />

        <TextAreaField
          label="Tell us about it"
          placeholder="What you want to eat, whether you need the whole place, music, anything else."
          value={note}
          maxLength={600}
          onChange={(e) => setNote(e.target.value)}
        />

        {problem ? <Notice tone="bad">{problem}</Notice> : null}

        <Button type="submit" tone="primary" size="lg" busy={send.busy}>
          Send the enquiry
        </Button>
      </form>
    </div>
  );
}
