import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, DEPOSIT_FCFA, MAX_PARTY, SLOTS } from "~/lib/api";
import type { Booking } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { addDays, dayLabel, longDate, normalisePhone, todayISO, toISODate } from "~/lib/format";
import { useAction, useResource } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { Counter, PhoneField, TextAreaField } from "~/ui/Field";
import { Money } from "~/ui/Bits";
import { Notice, Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { FloorPlan } from "./FloorPlan";
import { MomoDialog } from "~/features/pay/MomoDialog";
import { BookingPass } from "~/features/mine/BookingPass";

/**
 * Booking a table.
 *
 * Three questions in a fixed order, one screen each on a phone: when, which
 * table, and how to reach you. The order matters — the tables shown in step two
 * are the ones actually free for the slot picked in step one, so availability
 * is never a promise that gets broken at the end.
 *
 * The booking is created before payment and sits as pending until the deposit
 * lands, which is also what the server does. A guest who abandons the payment
 * still has the booking in "Mine", where they can pay or drop it.
 */

type Step = "when" | "where" | "who";

const DAYS_AHEAD = 14;

export function BookPage() {
  const { user, ready } = useSession();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("when");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [tableId, setTableId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [paying, setPaying] = useState(false);
  const [settled, setSettled] = useState(false);

  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => toISODate(addDays(new Date(), i))),
    []
  );

  /* Only ask the server about tables once a slot is chosen: without one the
     answer would be "all of them", which is a lie by the time it is shown. */
  const tables = useResource(
    () => (time ? api.booking.tables(date, time) : api.booking.tables()),
    [date, time]
  );

  const create = useAction(api.booking.create);

  const chosenTable = tables.data?.find((table) => table.id === tableId) ?? null;

  async function submit() {
    setProblem(null);
    const digits = normalisePhone(phone);
    if (digits.length < 8) {
      setProblem("Enter a phone number we can reach you on.");
      return;
    }
    if (!time) {
      setProblem("Pick a time first.");
      setStep("when");
      return;
    }

    const created = await create.run({
      date,
      time,
      partySize: party,
      phone: digits,
      note,
      tableId,
    });

    if (!created) {
      const failure = create.readError();
      setProblem(failure instanceof ApiError ? failure.message : "That booking could not be made.");
      return;
    }

    setBooking(created);
    setPaying(true);
  }

  if (!ready) {
    return (
      <div className="page section stack">
        <Skeleton height="3rem" width="16rem" />
        <Skeleton height="18rem" radius="var(--r-lg)" />
      </div>
    );
  }

  /* Signed out: say so before they fill in a form they cannot submit. */
  if (!user) {
    return (
      <div className="page section">
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Book a table</h1>
        </div>
        <div className="card stack" style={{ maxWidth: "32rem" }}>
          <p className="lead">
            Bookings are tied to an account so you can find yours later, change it, or cancel without calling anyone.
          </p>
          <div className="row row--wrap">
            <LinkButton to="/signin" state={{ from: "/book" }} tone="primary">
              Sign in
            </LinkButton>
            <LinkButton to="/join" tone="ghost">
              Create an account
            </LinkButton>
          </div>
          <p className="fine faint">
            In a hurry? <Link to="/order">Order takeaway</Link> instead, or{" "}
            <Link to="/waitlist">join the queue</Link> if you are already outside.
          </p>
        </div>
      </div>
    );
  }

  /* Paid and done: the booking becomes a pass. */
  if (settled && booking) {
    return (
      <div className="page section stack stack--loose">
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Table held</h1>
          <p className="lead">
            Show this at the door. It is also in Mine, so you do not need to keep this page open.
          </p>
        </div>
        <BookingPass booking={{ ...booking, status: "confirmed", payment_status: "paid" }} />
        <div className="row row--wrap">
          <LinkButton to="/mine" tone="primary" iconEnd="arrow-right">
            See my bookings
          </LinkButton>
          <Button
            tone="ghost"
            onClick={() => {
              setSettled(false);
              setBooking(null);
              setStep("when");
              setTime(null);
              setTableId(null);
            }}
          >
            Book another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Book a table</h1>
      </div>

      <ol className="steps" aria-label="Booking steps">
        {(["when", "where", "who"] as Step[]).map((name, index) => (
          <li key={name} className="steps__item" data-state={step === name ? "on" : "off"}>
            <span className="steps__num mono">{index + 1}</span>
            {name === "when" ? "When" : name === "where" ? "Table" : "Details"}
          </li>
        ))}
      </ol>

      {step === "when" ? (
        <div className="stack stack--loose">
          <section className="stack">
            <h2 className="label">Which day</h2>
            <div className="chip-rail">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  className="chip"
                  aria-pressed={day === date}
                  onClick={() => {
                    setDate(day);
                    setTableId(null);
                  }}
                >
                  {dayLabel(day)}
                </button>
              ))}
            </div>
          </section>

          <section className="stack">
            <h2 className="label">What time</h2>
            <div className="slots">
              {SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className="slot mono"
                  aria-pressed={slot === time}
                  onClick={() => {
                    setTime(slot);
                    setTableId(null);
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>
          </section>

          <section className="stack">
            <h2 className="label">How many of you</h2>
            <Counter value={party} min={1} max={MAX_PARTY} onChange={setParty} label="party size" />
            {party > 12 ? (
              <Notice tone="warn">
                For a party this size, tell us on <Link to="/events">the events page</Link> instead and we will set the
                room up properly.
              </Notice>
            ) : null}
          </section>

          <Button tone="primary" size="lg" disabled={!time} onClick={() => setStep("where")} iconEnd="arrow-right">
            {time ? `${dayLabel(date)} at ${time}` : "Pick a time"}
          </Button>
        </div>
      ) : null}

      {step === "where" ? (
        <div className="stack stack--loose">
          <p className="muted">
            Free tables for {longDate(date)} at {time}. Pick one, or carry on and we will seat you where there is room.
          </p>

          {tables.loading ? (
            <Skeleton height="20rem" radius="var(--r-lg)" />
          ) : tables.data ? (
            <>
              <FloorPlan
                tables={tables.data}
                selectedId={tableId}
                onSelect={setTableId}
                partySize={party}
              />
              <p className="plan-legend fine">
                <span data-state="free" /> Free
                <span data-state="picked" /> Yours
                <span data-state="taken" /> Taken
                <span data-state="small" /> Too small for your party
              </p>
            </>
          ) : null}

          <div className="row row--wrap">
            <Button tone="ghost" icon="arrow-left" onClick={() => setStep("when")}>
              Back
            </Button>
            <Button tone="primary" onClick={() => setStep("who")} iconEnd="arrow-right">
              {chosenTable ? `Take table ${chosenTable.label}` : "Any table is fine"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "who" ? (
        <div className="stack stack--loose" style={{ maxWidth: "34rem" }}>
          <div className="summary card">
            <h2 className="card__title">{longDate(date)}</h2>
            <dl className="summary__grid">
              <div>
                <dt className="label">Time</dt>
                <dd className="mono">{time}</dd>
              </div>
              <div>
                <dt className="label">People</dt>
                <dd className="mono">{party}</dd>
              </div>
              <div>
                <dt className="label">Table</dt>
                <dd>{chosenTable ? chosenTable.label : "Any"}</dd>
              </div>
            </dl>
            <button type="button" className="summary__change" onClick={() => setStep("when")}>
              Change
            </button>
          </div>

          <PhoneField
            label="Phone number"
            hint="Only used if we need to reach you about this booking."
            value={phone}
            onChange={setPhone}
            required
          />

          <TextAreaField
            label="Anything we should know"
            hint="A birthday, a wheelchair, someone who cannot take pepper."
            placeholder="Optional"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="deposit card card--flat">
            <div className="row row--between">
              <span>Deposit to hold the table</span>
              <Money value={DEPOSIT_FCFA} />
            </div>
            <p className="fine faint">
              Paid by MTN Mobile Money and taken off your bill on the night. Cancel more than an hour ahead and it comes
              back to you.
            </p>
          </div>

          {problem ? <Notice tone="bad">{problem}</Notice> : null}

          <div className="row row--wrap">
            <Button tone="ghost" icon="arrow-left" onClick={() => setStep("where")}>
              Back
            </Button>
            <Button tone="primary" size="lg" busy={create.busy} onClick={submit}>
              Hold this table
            </Button>
          </div>
        </div>
      ) : null}

      {booking ? (
        <MomoDialog
          open={paying}
          amountFcfa={DEPOSIT_FCFA}
          title="Pay the deposit"
          what={`${longDate(booking.date)} at ${booking.time}, ${booking.party_size} people`}
          driver={{
            allowDiscounts: true,
            start: (input) =>
              api.booking
                .payDeposit({
                  reservationId: booking.id,
                  momoPhone: input.momoPhone,
                  promoCode: input.promoCode,
                  giftCardCode: input.giftCardCode,
                })
                .then((prompt) => ({
                  reference: prompt.reference,
                  amount_fcfa: prompt.amount_fcfa,
                  zero_cost: prompt.zero_cost,
                  expires_in_seconds: prompt.expires_in_seconds,
                })),
            poll: api.booking.paymentStatus,
            abandon: api.booking.abandonPayment,
          }}
          onClose={() => {
            setPaying(false);
            toast.say("Your table is held for 30 minutes while you pay.");
            navigate("/mine");
          }}
          onPaid={() => {
            setPaying(false);
            setSettled(true);
          }}
        />
      ) : null}
    </div>
  );
}
