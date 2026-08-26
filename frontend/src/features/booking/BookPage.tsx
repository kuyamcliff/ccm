import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, SLOTS, MAX_PARTY, clashFromError } from "~/lib/api";
import type { BookingClash, DiningTable } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { addDays, dayLabel, isPastSlot, money, normalisePhone, toISODate, todayISO } from "~/lib/format";
import { priceBasket } from "~/lib/basketPricing";
import type { BasketLine } from "~/lib/basketPricing";
import { say } from "~/lib/say";
import { Icon } from "~/ui/Icon";
import { Action, Button, LinkButton } from "~/ui/Button";
import { TextAreaField, PhoneField, Counter, Field } from "~/ui/Field";
import { Money, Code } from "~/ui/Bits";
import { Notice, SkeletonRows } from "~/ui/Feedback";
import { usePress } from "~/ui/press";
import { PaySheet, type PaymentDriver } from "~/features/pay/PaySheet";
import { FloorPlan } from "./FloorPlan";
import { PickFood } from "./PickFood";
import { useSession } from "~/state/session";
import { useCopy } from "~/state/locale";
import type { Copy } from "~/copy";
import { useVenue } from "~/state/venue";

/**
 * Holding a table.
 *
 * Steps on one route, with the step in the query string. That is the whole
 * reason it is in the URL: on a phone the back gesture is how people undo, and a
 * multi-step flow that treats back as "leave the booking" loses the booking.
 * Here back means "previous step", which is what the gesture means everywhere
 * else on the device.
 *
 * The deposit is stated in words at the point of decision, not buried in a
 * confirmation, and so is the late cancellation fee. Both are set by the server
 * and read from Desk > Details.
 *
 * ── Food, chosen here ──────────────────────────────────────────────────────
 *
 * Between the table and the confirmation there is now a step for what the party
 * wants to eat. It is optional and says so, and what is picked is charged with
 * the deposit rather than at the table, which is the only reason it is worth
 * asking before somebody arrives.
 *
 * The step only exists when ordering is switched on in the console, so the
 * order of the steps is built per render rather than being a constant: a site
 * with ordering off has the four steps it always had, and a `?step=food` link
 * left over from before it was switched off falls back to the first step the
 * same way any other unknown step does, rather than drawing a screen with
 * nothing on it.
 */

type Step = "when" | "who" | "where" | "food" | "confirm";
const STEPS_WITH_FOOD: Step[] = ["when", "who", "where", "food", "confirm"];
const STEPS_WITHOUT_FOOD: Step[] = ["when", "who", "where", "confirm"];

/** What each step calls itself on the progress row. */
const STEP_LABEL: Record<Step, (c: Copy) => string> = {
  when: (c) => c.book.stepWhen,
  who: (c) => c.book.stepWho,
  where: (c) => c.book.stepWhere,
  food: (c) => c.book.stepFood,
  confirm: (c) => c.book.stepConfirm,
};

/** Two weeks. Further out than that and people are guessing. */
const DAYS_AHEAD = 14;

export function BookPage() {
  const { c, fill } = useCopy();
  const { depositFcfa, lateCancelFcfa, siteConfig } = useVenue();
  const { user } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const ordering = siteConfig.features.ordering;
  const ORDER = ordering ? STEPS_WITH_FOOD : STEPS_WITHOUT_FOOD;

  const step = (ORDER.includes(params.get("step") as Step) ? params.get("step") : "when") as Step;

  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [party, setParty] = useState(2);
  /*
   * The tables this party is taking, in the order they were tapped.
   *
   * A list rather than one table, because a party of ten does not fit on a
   * four-top and the room is mostly four-tops. The first is the lead table and
   * is the one the server records on the booking itself.
   */
  const [chosen, setChosen] = useState<DiningTable[]>([]);

  /** Adds a table, or takes it back out if it was already picked. */
  const toggleTable = (table: DiningTable) =>
    setChosen((current) =>
      current.some((entry) => entry.id === table.id)
        ? current.filter((entry) => entry.id !== table.id)
        : [...current, table]
    );
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  /*
   * Food and drink to be waiting on the table, as ids and quantities only.
   *
   * Deliberately not the takeaway basket: that one belongs to an order somebody
   * collects and outlives this page in localStorage, and joining the two would
   * mean an abandoned booking quietly filling somebody's basket. This dies with
   * the flow, which is what it should do.
   */
  const [food, setFood] = useState<BasketLine[]>([]);

  const [held, setHeld] = useState<{ id: number; code: string | null; itemsTotal: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [clash, setClash] = useState<BookingClash | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const go = (next: Step) => setParams({ step: next }, { replace: false });

  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, offset) => toISODate(addDays(new Date(), offset))),
    []
  );

  /* Only fetched once a day and a time are chosen, because the availability of a
     table is meaningless without both. */
  const floor = useQuery(
    K.tables(date, time),
    () => api.booking.floor(date, time),
    { enabled: Boolean(date && time), staleMs: 20_000 }
  );

  /* A table that was free when it was chosen and is not any more must not stay
     selected while the person fills in their phone number. */
  useEffect(() => {
    if (chosen.length === 0 || !floor.data) return;
    const tables = floor.data.tables;
    /* Only the ones that went, rather than clearing the lot. Losing one table
       of three to somebody quicker should not undo the other two. */
    const stillFree = chosen.filter((entry) => {
      const live = tables.find((candidate) => candidate.id === entry.id);
      return live !== undefined && live.available !== false;
    });
    if (stillFree.length !== chosen.length) setChosen(stillFree);
  }, [floor.data, chosen]);

  /* Seats across everything picked. What decides whether the party fits, and
     the only place multi-table booking says anything out loud. */
  const seatsChosen = chosen.reduce((sum, entry) => sum + entry.capacity, 0);

  /* The same cache entry the menu page fills, so a guest who looked at the menu
     before booking pays nothing for this step and it draws immediately. */
  const menu = useQuery(K.menu, () => api.site.menu(), {
    enabled: ordering,
    persist: true,
    staleMs: 2 * 60 * 1000,
  });

  /* Priced here only to show the guest what they are about to be charged. The
     server prices the same basket again against the live menu when the booking
     is made, and that figure is the one that is taken. Anything withdrawn from
     the menu since it was tapped drops out here and is counted in `dropped`. */
  const picked = useMemo(() => priceBasket(food, menu.data ?? []), [food, menu.data]);
  const foodCount = picked.lines.reduce((sum, line) => sum + line.qty, 0);

  const hold = useMutation(async () => {
    setProblem(null);
    setClash(null);
    const reservation = await api.booking.create({
      date,
      time,
      partySize: party,
      phone: normalisePhone(phone),
      note: note.trim(),
      tableIds: chosen.map((entry) => entry.id),
      /* Only what is still on the menu, and ids and quantities only. Prices
         come from the server: a total sent from here is a total the guest
         could have written themselves. */
      items: picked.lines.map((line) => ({ id: line.id, qty: line.qty })),
    });
    invalidate(K.myBookings);
    invalidate("book.tables*");
    /* The server's own figure for the food, not the one worked out above, so
       the amount in the payment sheet is the amount that will be charged even
       if a price moved between choosing and confirming. */
    setHeld({
      id: reservation.id,
      code: reservation.ccm_code,
      itemsTotal: reservation.items_total_fcfa ?? 0,
    });
    setPaying(true);
  });

  const driver: PaymentDriver = {
    allowDiscounts: true,
    start: ({ momoPhone, wallet, promoCode, giftCardCode, usePoints, idempotencyKey }) =>
      api.booking
        .payDeposit({ reservationId: held!.id, momoPhone, wallet, promoCode, giftCardCode, usePoints, idempotencyKey })
        .then((prompt) => ({
          reference: prompt.reference,
          amount_fcfa: prompt.amount_fcfa,
          zero_cost: prompt.zero_cost,
          expires_in_seconds: prompt.expires_in_seconds,
          payment_url: prompt.payment_url,
        })),
    poll: (reference) => api.booking.paymentStatus(reference),
    abandon: (reference) => api.booking.abandonPayment(reference),
  };

  /* ── Held, waiting on the deposit ─────────────────────────────────────────*/
  if (held && !paying) {
    return (
      <div className="page section stack">
        <header className="stack stack--tight">
          <h1 className="display display--xl">{fill(c.book.held, { when: `${dayLabel(date)} at ${time}` })}</h1>
        </header>

        <div className="carry">
          <p className="label">{c.mine.pass}</p>
          {held.code ? <Code value={held.code} size="lg" /> : null}
          <p className="fine muted">{c.mine.passHint}</p>
        </div>

        <div className="bar bar--wrap">
          <LinkButton to="/mine" tone="primary" size="sm" icon="ticket">
            {c.nav.mine}
          </LinkButton>
          <LinkButton to="/menu" tone="ghost" size="sm">
            {c.nav.menu}
          </LinkButton>
        </div>
      </div>
    );
  }

  const stepIndex = ORDER.indexOf(step);

  return (
    <div className="page section stack book">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.book.title}</h1>
        <Steps current={stepIndex} labels={ORDER.map((entry) => STEP_LABEL[entry](c))} />
      </header>

      {clash ? (
        <Notice tone="warn" title={c.book.clash}>
          <div className="stack stack--tight">
            <p>{c.book.clashBody}</p>
            {clash.alternatives?.times.length ? (
              <div className="stack stack--tight">
                <span className="label">{c.book.otherTimes}</span>
                <div className="bar bar--wrap bar--tight">
                  {clash.alternatives.times.map((slot) => (
                    <Chip
                      key={slot}
                      label={slot}
                      onSelect={() => {
                        setTime(slot);
                        setChosen([]);
                        setClash(null);
                        go("where");
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {clash.alternatives?.tables.length ? (
              <div className="stack stack--tight">
                <span className="label">{c.book.otherTables}</span>
                <div className="bar bar--wrap bar--tight">
                  {clash.alternatives.tables.map((entry) => (
                    <Chip
                      key={entry.id}
                      label={`${entry.label} (${entry.capacity})`}
                      onSelect={() => {
                        setChosen([
                          {
                            id: entry.id,
                            label: entry.label,
                            zone: entry.zone,
                            capacity: entry.capacity,
                            pos_x: 0,
                            pos_y: 0,
                            active: 1,
                          },
                        ]);
                        setClash(null);
                        go("confirm");
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Notice>
      ) : null}

      {/* ── 1. When ──────────────────────────────────────────────────────────*/}
      {step === "when" ? (
        <div className="stack">
          <Field label={c.book.date}>
            {() => (
              <div className="rail rail--chips" data-scroller="">
                <div className="rail__track">
                  {days.map((day) => (
                    <Chip key={day} label={dayLabel(day)} on={day === date} onSelect={() => setDate(day)} />
                  ))}
                </div>
              </div>
            )}
          </Field>

          <Field label={c.book.time}>
            {() => (
              <div className="slots">
                {SLOTS.map((slot) => {
                  const past = isPastSlot(date, slot);
                  return (
                    <Chip
                      key={slot}
                      label={slot}
                      on={slot === time}
                      disabled={past}
                      onSelect={() => {
                        setTime(slot);
                        setChosen([]);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </Field>

          <Button tone="primary" block iconEnd="arrow-right" disabled={!time} onClick={() => go("who")}>
            {c.common.next}
          </Button>
        </div>
      ) : null}

      {/* ── 2. How many ──────────────────────────────────────────────────────*/}
      {step === "who" ? (
        <div className="stack">
          <Field label={c.book.party} hint="More than eight? Have a look at booking the place out instead.">
            {() => (
              <Counter
                value={party}
                onChange={(next) => {
                  setParty(next);
                  setChosen([]);
                }}
                min={1}
                max={MAX_PARTY}
                label={c.book.party}
              />
            )}
          </Field>

          <div className="bar bar--tight">
            <Button tone="quiet" block icon="arrow-left" onClick={() => go("when")}>
              {c.common.back}
            </Button>
            <Button tone="primary" block iconEnd="arrow-right" onClick={() => go("where")}>
              {c.common.next}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── 3. Which table ───────────────────────────────────────────────────*/}
      {step === "where" ? (
        <div className="stack">
          <p className="lead">{c.book.pickTable}</p>

          {floor.loading ? (
            <SkeletonRows count={3} />
          ) : (
            <FloorPlan
              tables={floor.data?.tables ?? []}
              fixtures={floor.data?.fixtures ?? []}
              party={party}
              chosenIds={chosen.map((entry) => entry.id)}
              onChoose={toggleTable}
              labels={{
                free: c.book.tableFree,
                taken: c.book.tableTaken,
                tooSmall: c.book.tableTooSmall,
                inUse: c.book.tableInUse,
                yours: c.book.tableYours,
                seats: (n) => fill(c.book.seats, { n }),
              }}
            />
          )}

          {/*
            * What is picked, and whether it seats the party.
            *
            * No instruction anywhere saying "you can choose more than one".
            * Tapping a second table just works, and the moment somebody does,
            * this line adds up the seats and starts counting. A sentence
            * telling people about a feature is a sentence admitting the
            * feature is not obvious.
            */}
          {chosen.length > 0 ? (
            <Notice tone={seatsChosen >= party ? "good" : "warn"}>
              <div className="stack stack--tight">
                <span>
                  {chosen.map((entry) => `Table ${entry.label}`).join(" + ")}.{" "}
                  {fill(c.book.seats, { n: seatsChosen })}.
                </span>
                {seatsChosen < party ? (
                  <span className="fine">{fill(c.book.seatsShort, { n: party - seatsChosen })}</span>
                ) : null}
              </div>
            </Notice>
          ) : null}

          <div className="bar bar--tight">
            <Button tone="quiet" block icon="arrow-left" onClick={() => go("who")}>
              {c.common.back}
            </Button>
            <Button
              tone="primary"
              block
              iconEnd="arrow-right"
              disabled={chosen.length === 0 || seatsChosen < party}
              onClick={() => go(ordering ? "food" : "confirm")}
            >
              {c.common.next}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── 4. What they want to eat ─────────────────────────────────────────*/}
      {step === "food" ? (
        <div className="stack">
          <div className="stack stack--tight">
            <p className="lead">{c.book.preorder}</p>
            <p className="fine muted">{c.book.preorderBody}</p>
          </div>

          {menu.error ? (
            /* The step is optional, so a menu that will not load is a reason to
               move on rather than a reason to stop: the table can still be
               held, and the food can still be ordered at it. */
            <Notice tone="info">{c.book.preorderNone}</Notice>
          ) : (
            <PickFood menu={menu.data ?? []} loading={menu.loading} chosen={food} onChange={setFood} />
          )}

          {foodCount > 0 ? (
            <div className="rows">
              <div className="row">
                <span className="grow label">{fill(c.book.preorderChosen, { n: foodCount })}</span>
                <Money value={picked.subtotal} size="fine" />
              </div>
            </div>
          ) : null}

          <div className="bar bar--tight">
            <Button tone="quiet" block icon="arrow-left" onClick={() => go("where")}>
              {c.common.back}
            </Button>
            <Button tone="primary" block iconEnd="arrow-right" onClick={() => go("confirm")}>
              {/* One button, and what it says depends on whether anything was
                  picked. A separate Skip next to Next is two ways to do the
                  same thing, and on a phone the second one is just a way to
                  press the wrong one. */}
              {foodCount > 0 ? c.common.next : c.book.preorderSkip}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── 5. Confirm ───────────────────────────────────────────────────────*/}
      {step === "confirm" ? (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            await hold.run();
            const error = hold.readError();
            if (!error) return;
            const detected = clashFromError(error);
            if (detected) {
              setClash(detected);
              return;
            }
            setProblem(say(error, "book"));
          }}
        >
          <div className="rows">
            <div className="row">
              <span className="grow label">{c.book.stepWhen}</span>
              <span>
                {dayLabel(date)}, {time}
              </span>
            </div>
            <div className="row">
              <span className="grow label">{c.book.stepWho}</span>
              <span>{party === 1 ? c.book.partyOne : fill(c.book.partyMany, { n: party })}</span>
            </div>
            <div className="row">
              <span className="grow label">{c.book.stepWhere}</span>
              <span>
                {chosen.length > 0 ? chosen.map((entry) => `Table ${entry.label}`).join(" + ") : "Any free table"}
              </span>
            </div>
            <div className="row">
              <span className="grow label">{c.book.deposit}</span>
              <Money value={depositFcfa} size="fine" />
            </div>
          </div>

          {/* What they picked, itemised, and what the two figures come to. A
              summary that showed one "Food and drinks" total would be asking
              somebody to take on trust the thing they are about to pay for. */}
          {picked.lines.length > 0 ? (
            <div className="stack stack--tight">
              <span className="label">{c.book.stepFood}</span>
              <div className="rows rows--inset">
                {picked.lines.map((line) => (
                  <div key={line.id} className="row">
                    <span className="grow fine">
                      {line.qty} {line.item.name}
                    </span>
                    <Money value={line.lineTotal} size="fine" />
                  </div>
                ))}
                <div className="row">
                  <span className="grow label">{c.book.toPay}</span>
                  <Money value={depositFcfa + picked.subtotal} size="fine" />
                </div>
              </div>
              <p className="fine muted">{c.book.preorderNote}</p>
            </div>
          ) : null}

          {/* Something was picked and has since come off the menu. Said plainly
              here rather than left to be discovered as a smaller bill. */}
          {picked.dropped > 0 ? <Notice tone="warn">{c.book.preorderGone}</Notice> : null}

          <PhoneField label={c.book.phone} hint={c.book.phoneHint} value={phone} onChange={setPhone} required />

          <TextAreaField
            label={c.book.note}
            placeholder={c.book.notePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={300}
          />

          {/* The two facts about money, in words, before anybody commits. */}
          <div className="stack stack--tight">
            <p className="fine muted">{fill(c.book.depositBody, { amount: money(depositFcfa) })}</p>
            <p className="fine faint">{fill(c.book.lateFee, { amount: money(lateCancelFcfa) })}</p>
          </div>

          {problem ? <Notice tone="bad">{problem}</Notice> : null}

          {!user ? (
            <Notice tone="info">
              You need an account to hold a table.{" "}
              <LinkButton to="/signin" tone="quiet" size="sm">
                {c.nav.signIn}
              </LinkButton>
            </Notice>
          ) : null}

          <div className="bar bar--tight">
            <Button tone="quiet" block icon="arrow-left" onClick={() => go(ordering ? "food" : "where")}>
              {c.common.back}
            </Button>
            <Action
              type="submit"
              tone="primary"
              block
              pending={hold.pending}
              pendingLabel={c.pending.holding}
              disabled={!user || normalisePhone(phone).length !== 9}
            >
              {c.book.holdIt}
            </Action>
          </div>
        </form>
      ) : null}

      {held && paying ? (
        <PaySheet
          open
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            invalidate(K.myBookings);
            navigate("/mine", { replace: true });
          }}
          /* The deposit and the food together, because that is one charge on
             one prompt: the server adds the same two figures when it works out
             what to ask the wallet for. */
          amountFcfa={depositFcfa + held.itemsTotal}
          title={held.itemsTotal > 0 ? c.book.toPay : c.book.deposit}
          what={`${dayLabel(date)}, ${time}${
            chosen.length > 0 ? `, ${chosen.map((entry) => `table ${entry.label}`).join(" and ")}` : ""
          }${held.itemsTotal > 0 ? `, ${fill(c.book.preorderChosen, { n: foodCount })}` : ""}`}
          driver={driver}
        />
      ) : null}
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────────*/

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="steps" aria-label="Progress">
      {labels.map((label, index) => (
        <li key={label} className="steps__item" data-state={index < current ? "done" : index === current ? "now" : undefined}>
          <span className="steps__dot" aria-hidden="true">
            {index < current ? <Icon name="check" size={11} /> : index + 1}
          </span>
          <span className="steps__label micro">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Chip({
  label,
  on,
  disabled,
  onSelect,
}: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const press = usePress({ disabled });
  return (
    <button
      type="button"
      className="chip"
      data-on={on ? "true" : undefined}
      disabled={disabled}
      onClick={onSelect}
      {...press.pressProps}
    >
      {label}
    </button>
  );
}
