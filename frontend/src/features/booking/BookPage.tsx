import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, SLOTS, MAX_PARTY, clashFromError } from "~/lib/api";
import type { BookingClash, DiningTable } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { addDays, dayLabel, isPastSlot, money, normalisePhone, toISODate, todayISO } from "~/lib/format";
import { say } from "~/lib/say";
import { Icon } from "~/ui/Icon";
import { Action, Button, LinkButton } from "~/ui/Button";
import { TextAreaField, PhoneField, Counter, Field } from "~/ui/Field";
import { Money, Code } from "~/ui/Bits";
import { Notice, SkeletonRows } from "~/ui/Feedback";
import { usePress } from "~/ui/press";
import { PaySheet, type PaymentDriver } from "~/features/pay/PaySheet";
import { FloorPlan } from "./FloorPlan";
import { useSession } from "~/state/session";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * Holding a table.
 *
 * Four steps on one route, with the step in the query string. That is the whole
 * reason it is in the URL: on a phone the back gesture is how people undo, and a
 * four-step flow that treats back as "leave the booking" loses the booking. Here
 * back means "previous step", which is what the gesture means everywhere else on
 * the device.
 *
 * The deposit is stated in words at the point of decision, not buried in a
 * confirmation, and so is the late cancellation fee. Both are set by the server
 * and read from Desk > Details.
 */

type Step = "when" | "who" | "where" | "confirm";
const ORDER: Step[] = ["when", "who", "where", "confirm"];

/** Two weeks. Further out than that and people are guessing. */
const DAYS_AHEAD = 14;

export function BookPage() {
  const { c, fill } = useCopy();
  const { depositFcfa, lateCancelFcfa } = useVenue();
  const { user } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const step = (ORDER.includes(params.get("step") as Step) ? params.get("step") : "when") as Step;

  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [party, setParty] = useState(2);
  const [table, setTable] = useState<DiningTable | null>(null);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const [held, setHeld] = useState<{ id: number; code: string | null } | null>(null);
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
    if (!table || !floor.data) return;
    const live = floor.data.tables.find((entry) => entry.id === table.id);
    if (!live || live.available === false || live.capacity < party) setTable(null);
  }, [floor.data, table, party]);

  const hold = useMutation(async () => {
    setProblem(null);
    setClash(null);
    const reservation = await api.booking.create({
      date,
      time,
      partySize: party,
      phone: normalisePhone(phone),
      note: note.trim(),
      tableId: table?.id ?? null,
    });
    invalidate(K.myBookings);
    invalidate("book.tables*");
    setHeld({ id: reservation.id, code: reservation.ccm_code });
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
        <Steps current={stepIndex} labels={[c.book.stepWhen, c.book.stepWho, c.book.stepWhere, c.book.stepConfirm]} />
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
                        setTable(null);
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
                        setTable({
                          id: entry.id,
                          label: entry.label,
                          zone: entry.zone,
                          capacity: entry.capacity,
                          pos_x: 0,
                          pos_y: 0,
                          active: 1,
                        });
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
                        setTable(null);
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
                  setTable(null);
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
              chosenId={table?.id ?? null}
              onChoose={setTable}
              labels={{
                free: c.book.tableFree,
                taken: c.book.tableTaken,
                tooSmall: c.book.tableTooSmall,
                seats: (n) => fill(c.book.seats, { n }),
              }}
            />
          )}

          {table ? (
            <Notice tone="good">
              Table {table.label}
              {table.zone ? `, ${table.zone}` : ""}. {fill(c.book.seats, { n: table.capacity })}.
            </Notice>
          ) : null}

          <div className="bar bar--tight">
            <Button tone="quiet" block icon="arrow-left" onClick={() => go("who")}>
              {c.common.back}
            </Button>
            <Button tone="primary" block iconEnd="arrow-right" disabled={!table} onClick={() => go("confirm")}>
              {c.common.next}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── 4. Confirm ───────────────────────────────────────────────────────*/}
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
              <span>{table ? `Table ${table.label}` : "Any free table"}</span>
            </div>
            <div className="row">
              <span className="grow label">{c.book.deposit}</span>
              <Money value={depositFcfa} size="fine" />
            </div>
          </div>

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
            <Button tone="quiet" block icon="arrow-left" onClick={() => go("where")}>
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
          amountFcfa={depositFcfa}
          title={c.book.deposit}
          what={`${dayLabel(date)}, ${time}${table ? `, table ${table.label}` : ""}`}
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
