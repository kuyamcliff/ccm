import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, MAX_PARTY, SLOTS } from "~/lib/api";
import type { Booking, MenuItem } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { addDays, dayLabel, longDate, normalisePhone, todayISO, toISODate } from "~/lib/format";
import { useAction, useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Counter, PhoneField, TextAreaField } from "~/ui/Field";
import { Money } from "~/ui/Bits";
import { Notice, Skeleton } from "~/ui/Feedback";
import { Sheet } from "~/ui/Sheet";
import { useVenue } from "~/state/venue";
import { FloorPlan } from "./FloorPlan";
import { OrderStep, basketCount, basketLines, basketTotal } from "./OrderStep";
import type { Basket } from "./OrderStep";

/**
 * Booking, as one dialog rather than a page you travel through.
 *
 * Four questions in a fixed order: when, how many of you, which table, and
 * what to have ready. The order is not arbitrary — the tables offered in step
 * three are the ones actually free for the slot picked in step one and big
 * enough for the party given in step two, so availability is never a promise
 * that gets broken at the end.
 *
 * A dialog rather than a route because booking is one errand. The page behind
 * stays where it was, closing puts the guest back exactly where they started,
 * and on a phone each question gets the whole screen without four navigations
 * piling up in the back button.
 *
 * The one thing it does not do is take the payment. That is its own dialog,
 * and two of them cannot be open at once — each traps focus and draws its own
 * scrim — so this closes as the booking is created and hands the rest over.
 */

type Step = "when" | "party" | "table" | "food";

const ORDER: Step[] = ["when", "party", "table", "food"];

const TITLES: Record<Step, string> = {
  when: "When are you coming?",
  party: "How many of you?",
  table: "Where would you like to sit?",
  food: "Anything to have ready?",
};

const DAYS_AHEAD = 14;

export interface BookingReady {
  booking: Booking;
  /** Deposit plus whatever food was ordered, which is what will be charged. */
  dueNow: number;
  hasFood: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired once the booking exists and the deposit is ready to be taken. */
  onReady: (result: BookingReady) => void;
}

export function BookingSheet({ open, onClose, onReady }: Props) {
  const { depositFcfa } = useVenue();

  const [step, setStep] = useState<Step>("when");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [tableId, setTableId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [basket, setBasket] = useState<Basket>({});
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => toISODate(addDays(new Date(), i))),
    []
  );

  /* Only ask the server about the room once a slot is chosen: without one the
     answer would be "everything is free", which is a lie by the time it shows. */
  const floor = useResource(
    () => (time ? api.booking.floor(date, time) : api.booking.floor()),
    [date, time]
  );

  const create = useAction(api.booking.create);

  const tables = floor.data?.tables ?? [];
  const chosenTable = tables.find((table) => table.id === tableId) ?? null;

  const foodTotal = basketTotal(basket, menu);
  const chosenCount = basketCount(basket);
  const dueNow = depositFcfa + foodTotal;

  const index = ORDER.indexOf(step);
  const phoneReady = normalisePhone(phone).length >= 8;

  function back() {
    setProblem(null);
    if (index === 0) {
      onClose();
      return;
    }
    setStep(ORDER[index - 1]!);
  }

  async function submit() {
    setProblem(null);
    if (!time) {
      setProblem("Pick a time first.");
      setStep("when");
      return;
    }
    if (!phoneReady) {
      setProblem("Enter a phone number we can reach you on.");
      setStep("party");
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

    onReady({ booking: created, dueNow, hasFood: chosenCount > 0 });
  }

  /** The action on the right of the footer, which differs on the last step. */
  const forward =
    step === "food" ? (
      <Button tone="primary" busy={create.busy} onClick={submit}>
        Pay {new Intl.NumberFormat("en-US").format(dueNow)} FCFA
      </Button>
    ) : (
      <Button
        tone="primary"
        iconEnd="arrow-right"
        disabled={(step === "when" && !time) || (step === "party" && !phoneReady)}
        onClick={() => setStep(ORDER[index + 1]!)}
      >
        {step === "table" && chosenTable ? `Table ${chosenTable.label}` : "Next"}
      </Button>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      busy={create.busy}
      title={TITLES[step]}
      description={`Step ${index + 1} of ${ORDER.length}`}
      footer={
        <>
          <Button tone="ghost" icon="arrow-left" onClick={back} disabled={create.busy}>
            {index === 0 ? "Cancel" : "Back"}
          </Button>
          {forward}
        </>
      }
    >
      {/* Progress as a bar rather than four chips: in a dialog this narrow the
          chips wrapped onto two lines and took the room the question needs. */}
      <div className="meter book-progress" role="presentation">
        <div className="meter__fill" style={{ width: `${((index + 1) / ORDER.length) * 100}%` }} />
      </div>

      {/* ── 1. When ── */}
      {step === "when" ? (
        <div className="stack">
          <section className="stack stack--tight">
            <h3 className="label">Which day</h3>
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

          <section className="stack stack--tight">
            <h3 className="label">What time</h3>
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
        </div>
      ) : null}

      {/* ── 2. How many ── */}
      {step === "party" ? (
        <div className="stack">
          <Counter value={party} min={1} max={MAX_PARTY} onChange={setParty} label="party size" />
          {party > 12 ? (
            <Notice tone="warn">
              For a party this size, tell us on <Link to="/events">the events page</Link> instead and we will set the
              room up properly.
            </Notice>
          ) : null}

          <PhoneField
            label="Phone number"
            hint="We text your booking code here, and use it if we need to reach you."
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
        </div>
      ) : null}

      {/* ── 3. Table ── */}
      {step === "table" ? (
        <div className="stack">
          <p className="fine muted">
            Free for {longDate(date)} at {time}, for {party}. Pick one, or carry on and we will seat you where there is
            room.
          </p>

          {floor.loading ? (
            <Skeleton height="14rem" radius="var(--r-lg)" />
          ) : floor.data ? (
            <>
              <FloorPlan
                tables={tables}
                fixtures={floor.data.fixtures}
                selectedId={tableId}
                onSelect={setTableId}
                partySize={party}
              />
              <p className="plan-legend fine">
                <span data-state="free" /> Free
                <span data-state="picked" /> Yours
                <span data-state="taken" /> Taken
                <span data-state="small" /> Too small
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── 4. Food ── */}
      {step === "food" ? (
        <div className="stack">
          <p className="fine muted">
            Order now and it starts cooking before you sit down, or skip this and order at the table. Either way it is
            cooked fresh.
          </p>

          <OrderStep basket={basket} onChange={setBasket} onMenuLoaded={setMenu} />

          <div className="deposit card card--flat stack stack--tight">
            <div className="row row--between">
              <span className="fine">{longDate(date)} at {time}</span>
              <span className="fine muted">
                {party} {party === 1 ? "person" : "people"} · {chosenTable ? `table ${chosenTable.label}` : "any table"}
              </span>
            </div>
            <div className="row row--between">
              <span>Deposit</span>
              <Money value={depositFcfa} />
            </div>
            {chosenCount > 0 ? (
              <div className="row row--between">
                <span>
                  Food and drinks, {chosenCount} {chosenCount === 1 ? "item" : "items"}
                </span>
                <Money value={foodTotal} />
              </div>
            ) : null}
            <div className="row row--between total-row">
              <strong>To pay now</strong>
              <strong>
                <Money value={dueNow} />
              </strong>
            </div>
            <p className="fine faint">
              The deposit comes off your bill. Cancel more than an hour ahead and it comes back to you.
            </p>
          </div>
        </div>
      ) : null}

      {problem ? <Notice tone="bad">{problem}</Notice> : null}
    </Sheet>
  );
}
