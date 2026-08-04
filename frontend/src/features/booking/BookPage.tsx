import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "~/lib/api";
import type { Booking, MenuItem } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { addDays, dayLabel, longDate, money, normalisePhone, timeLabel, todayISO, toISODate } from "~/lib/format";
import { useAction, useResource } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { Notice, Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useVenue } from "~/state/venue";
import { MomoDialog } from "~/features/pay/MomoDialog";
import { BookingPass } from "~/features/mine/BookingPass";
import { basketLines, basketTotal, type Basket } from "./OrderStep";
import { DAYS_AHEAD, ReviewStep, WhenStep, WhereStep, WhoStep } from "./steps";

/**
 * Booking a table.
 *
 * This used to be a dialog. On a phone that meant a wizard inside a sheet:
 * a panel with its own scroll, inside a page with another, with the questions
 * squeezed into whatever was left between a header and a footer that were
 * themselves inside the panel. The room came out at half the width of the
 * screen and the times came out as a wall of twenty eight identical buttons.
 *
 * It is a screen now, and the flow owns it. One question per step at full
 * width, a progress bar at the top that is also the way back, and a bar at the
 * bottom that always says what has been chosen so far and what happens next.
 *
 * The step lives in the URL. That is the whole reason a wizard can be a page
 * here without the usual cost: the phone's back gesture walks back through the
 * questions the way a person expects, rather than throwing away a
 * half-finished booking, and a step can be linked to and reloaded.
 *
 * The one thing it does not do is take the payment. That stays a dialog, so
 * the booking behind it is still on screen while the handset is being watched.
 */

type Step = "when" | "who" | "where" | "review";

const ORDER: Step[] = ["when", "who", "where", "review"];

const TITLES: Record<Step, string> = {
  when: "When are you coming?",
  who: "How many of you?",
  where: "Where would you like to sit?",
  review: "Check and pay",
};

function isStep(value: string | null): value is Step {
  return value !== null && (ORDER as string[]).includes(value);
}

export function BookPage() {
  const { user, ready } = useSession();
  const { depositFcfa } = useVenue();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [tableId, setTableId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [basket, setBasket] = useState<Basket>({});
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const [pending, setPending] = useState<{ booking: Booking; dueNow: number; hasFood: boolean } | null>(null);
  const [paid, setPaid] = useState<Booking | null>(null);

  const raw = params.get("step");
  const step: Step = isStep(raw) ? raw : "when";
  const index = ORDER.indexOf(step);

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => toISODate(addDays(new Date(), i))), []);

  /* Only ask the server about the room once a slot is chosen: without one the
     answer would be "everything is free", which is a lie by the time it shows. */
  const floor = useResource(() => (time ? api.booking.floor(date, time) : api.booking.floor()), [date, time]);
  const create = useAction(api.booking.create);

  const tables = floor.data?.tables ?? [];
  const chosenTable = tables.find((table) => table.id === tableId) ?? null;

  const foodTotal = basketTotal(basket, menu);
  const dueNow = depositFcfa + foodTotal;
  const phoneReady = normalisePhone(phone).length >= 8;

  /* Somebody who reloads on a later step, or is sent a link to one, has none
     of the answers the step depends on. Put them back at the first question
     rather than showing an empty room for a time nobody picked. */
  useEffect(() => {
    if (index > 0 && !time) setParams({}, { replace: true });
  }, [index, time, setParams]);

  function go(next: Step) {
    setProblem(null);
    setParams({ step: next });
  }

  function back() {
    setProblem(null);
    /* History, not state: this is the same movement as the phone's own back
       gesture, and going through the browser keeps the two in step. */
    navigate(-1);
  }

  async function submit() {
    setProblem(null);
    if (!time) {
      go("when");
      return;
    }

    const created = await create.run({
      date,
      time,
      partySize: party,
      phone: normalisePhone(phone),
      note,
      tableId,
      items: basketLines(basket),
    });

    if (!created) {
      const failure = create.readError();
      setProblem(failure instanceof ApiError ? failure.message : "That booking could not be made.");
      return;
    }

    setPending({ booking: created, dueNow, hasFood: basketLines(basket).length > 0 });
  }

  if (!ready) {
    return (
      <div className="page section stack">
        <Skeleton height="3rem" width="16rem" />
        <Skeleton height="18rem" radius="var(--r-lg)" />
      </div>
    );
  }

  /* Signed out: say so before opening a form they cannot submit. */
  if (!user) {
    return (
      <div className="page section">
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Book a table</h1>
        </div>
        <div className="stack stack--loose" style={{ maxWidth: "32rem" }}>
          <p className="lead">
            Booking needs an account, so your table, your code and your receipt stay in one place and you can change or
            cancel without calling anybody.
          </p>
          <div className="actions">
            <LinkButton to="/join" tone="primary" size="lg">
              Create an account
            </LinkButton>
            <LinkButton to="/signin" tone="ghost" size="lg">
              I already have one
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
  if (paid) {
    return (
      <div className="page section stack stack--loose">
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Table held</h1>
          <p className="lead">Show this at the door. It is also in Mine, so you do not need to keep this page open.</p>
        </div>
        <BookingPass booking={{ ...paid, status: "confirmed", payment_status: "paid" }} />
        <div className="actions">
          <LinkButton to="/mine" tone="primary" iconEnd="arrow-right">
            See my bookings
          </LinkButton>
          <Button
            tone="ghost"
            onClick={() => {
              setPaid(null);
              setPending(null);
              setTime(null);
              setTableId(null);
              setBasket({});
              setParams({}, { replace: true });
            }}
          >
            Book another
          </Button>
        </div>
      </div>
    );
  }

  /** What the bar at the bottom offers, which differs on the last step. */
  const forward =
    step === "review" ? (
      <Button tone="primary" size="lg" icon="wallet" busy={create.busy} onClick={submit}>
        Pay Now
      </Button>
    ) : (
      <Button
        tone="primary"
        size="lg"
        iconEnd="arrow-right"
        disabled={(step === "when" && !time) || (step === "who" && !phoneReady)}
        onClick={() => go(ORDER[index + 1]!)}
      >
        Continue
      </Button>
    );

  /** The running answer, so the bar is never just a button. */
  const recap =
    step === "when"
      ? time
        ? `${dayLabel(date)}, ${timeLabel(time)}`
        : "Pick a day and a time"
      : step === "who"
        ? phoneReady
          ? `${party === 1 ? "Just me" : `${party} people`}, ${dayLabel(date)}`
          : "We need a phone number"
        : step === "where"
          ? chosenTable
            ? `Table ${chosenTable.label}, seats ${chosenTable.capacity}`
            : "Any table"
          : `${money(dueNow)} FCFA to pay now`;

  return (
    <div className="booking">
      <header className="booking__head">
        <div className="page booking__head-in">
          <button type="button" className="booking__back" onClick={back} aria-label="Back">
            <Icon name="arrow-left" size={20} />
          </button>
          <span className="label">
            Step {index + 1} of {ORDER.length}
          </span>
          {/*
            The ticks are the progress and the way back at once. A step already
            answered can be returned to with one tap; one that has not been
            reached yet is not a target, because it would land on a question
            that depends on an answer nobody has given.
          */}
          <ol className="booking__ticks">
            {ORDER.map((name, i) => (
              <li key={name}>
                <button
                  type="button"
                  data-state={i < index ? "done" : i === index ? "now" : "todo"}
                  disabled={i > index}
                  aria-label={`Step ${i + 1}, ${TITLES[name]}`}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => go(name)}
                />
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="page booking__body">
        <h1 className="display display--xl booking__q">{TITLES[step]}</h1>

        {step === "when" ? (
          <WhenStep
            days={days}
            date={date}
            time={time}
            onDate={(next) => {
              setDate(next);
              setTime(null);
              setTableId(null);
            }}
            onTime={(next) => {
              setTime(next);
              setTableId(null);
            }}
          />
        ) : null}

        {step === "who" ? (
          <WhoStep
            party={party}
            phone={phone}
            note={note}
            onParty={(next) => {
              setParty(next);
              /* A table that no longer fits cannot stay chosen. */
              if (chosenTable && chosenTable.capacity < next) setTableId(null);
            }}
            onPhone={setPhone}
            onNote={setNote}
          />
        ) : null}

        {step === "where" && time ? (
          <WhereStep
            date={date}
            time={time}
            party={party}
            tables={tables}
            fixtures={floor.data?.fixtures ?? []}
            loading={floor.loading}
            tableId={tableId}
            onSelect={setTableId}
          />
        ) : null}

        {step === "review" && time ? (
          <ReviewStep
            date={date}
            time={time}
            party={party}
            table={chosenTable}
            basket={basket}
            menu={menu}
            depositFcfa={depositFcfa}
            foodTotal={foodTotal}
            onBasket={setBasket}
            onMenuLoaded={setMenu}
            onEdit={go}
          />
        ) : null}

        {problem ? <Notice tone="bad">{problem}</Notice> : null}
      </div>

      <div className="booking__foot">
        <div className="page row row--between">
          <span className="booking__recap">{recap}</span>
          {forward}
        </div>
      </div>

      {pending ? (
        <MomoDialog
          open
          amountFcfa={pending.dueNow}
          title={pending.hasFood ? "Pay the deposit and your order" : "Pay the deposit"}
          what={`${longDate(pending.booking.date)} at ${timeLabel(pending.booking.time)}, ${pending.booking.party_size} people`}
          driver={{
            allowDiscounts: true,
            start: (input) =>
              api.booking
                .payDeposit({
                  reservationId: pending.booking.id,
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
            setPending(null);
            toast.say("Your table is held for 30 minutes while you pay.");
            navigate("/mine");
          }}
          onPaid={() => {
            setPaid(pending.booking);
            setPending(null);
          }}
        />
      ) : null}
    </div>
  );
}
