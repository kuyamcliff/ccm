import { Link } from "react-router-dom";
import { api, MAX_PARTY, SLOTS } from "~/lib/api";
import type { DiningTable, MenuItem } from "~/lib/api";
import { isPastSlot, longDate, money, relativeDay, shortDate, timeLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Counter, PhoneField, SelectField, TextAreaField } from "~/ui/Field";
import { Money } from "~/ui/Bits";
import { Icon } from "~/ui/Icon";
import { Notice, Skeleton } from "~/ui/Feedback";
import { FloorPlan } from "./FloorPlan";
import { OrderStep, basketCount } from "./OrderStep";
import type { Basket } from "./OrderStep";

/**
 * The four questions, one screen each.
 *
 * Each step is a plain section of a page rather than a panel inside a dialog,
 * which is what lets the questions be asked at full size: a day rail you can
 * flick, times in blocks of the evening rather than a wall of twenty eight,
 * and a room you can see all of.
 */

export const DAYS_AHEAD = 14;

/* ── 1. When ───────────────────────────────────────────────────────────── */

export function WhenStep({
  days,
  date,
  time,
  onDate,
  onTime,
}: {
  days: string[];
  date: string;
  time: string | null;
  onDate: (next: string) => void;
  onTime: (next: string) => void;
}) {
  /* Only the times still to come on the chosen day. Offering half past six at
     seven is how somebody turns up to a booking that was never possible. */
  const open = SLOTS.filter((slot) => !isPastSlot(date, slot));

  return (
    <div className="stack stack--loose">
      <section className="stack stack--tight">
        <h2 className="label">Which day</h2>
        <div className="chip-rail">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              className="chip chip--day"
              aria-pressed={day === date}
              onClick={() => onDate(day)}
            >
              {/* "Thu 6 Aug" over "6 Aug" said the date twice. The word people
                  use goes on top, the date underneath it. */}
              <span>{relativeDay(day) ?? shortDate(day).split(" ")[0]}</span>
              <span className="chip__sub">{shortDate(day).split(" ").slice(1).join(" ")}</span>
            </button>
          ))}
        </div>
      </section>

      {open.length === 0 ? (
        <Notice tone="warn">
          Tonight is finished. Pick tomorrow, or <Link to="/waitlist">join the queue</Link> if you are already outside.
        </Notice>
      ) : (
        /* The same control the takeaway checkout uses. A grid of twenty eight
           buttons was tried here and is not what the owner wants: one compact
           row that opens the phone's own picker is less to read and less to
           scroll past. */
        <SelectField
          label="What time"
          value={time ?? open[0]}
          onChange={(e) => onTime(e.target.value)}
        >
          {open.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </SelectField>
      )}
    </div>
  );
}

/* ── 2. Who ────────────────────────────────────────────────────────────── */

export function WhoStep({
  party,
  phone,
  note,
  onParty,
  onPhone,
  onNote,
}: {
  party: number;
  phone: string;
  note: string;
  onParty: (next: number) => void;
  onPhone: (next: string) => void;
  onNote: (next: string) => void;
}) {
  return (
    <div className="stack stack--loose">
      <section className="party">
        <Counter value={party} min={1} max={MAX_PARTY} onChange={onParty} label="party size" />
        <p className="party__word">{party === 1 ? "Just me" : `${party} people`}</p>
        {/* The three sizes that cover most tables, one tap each. The stepper
            is still there for everything else. */}
        <div className="row row--wrap" style={{ justifyContent: "center" }}>
          {[2, 4, 6].map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={party === n} onClick={() => onParty(n)}>
              {n} people
            </button>
          ))}
        </div>
      </section>

      {party > 12 ? (
        <Notice tone="warn">
          For a party this size, tell us on <Link to="/events">the events page</Link> instead and we will set the room
          up properly.
        </Notice>
      ) : null}

      <PhoneField
        label="Phone number"
        hint="We text your booking code here, and use it if we need to reach you."
        value={phone}
        onChange={onPhone}
        required
      />

      <TextAreaField
        label="Anything we should know"
        hint="A birthday, a wheelchair, someone who cannot take pepper."
        placeholder="Optional"
        maxLength={300}
        value={note}
        onChange={(e) => onNote(e.target.value)}
      />
    </div>
  );
}

/* ── 3. Where ──────────────────────────────────────────────────────────── */

export function WhereStep({
  date,
  time,
  party,
  tables,
  fixtures,
  loading,
  tableId,
  onSelect,
}: {
  date: string;
  time: string;
  party: number;
  tables: DiningTable[];
  fixtures: { id: number; kind: string; label: string; pos_x: number; pos_y: number; width: number; height: number }[];
  loading: boolean;
  tableId: number | null;
  onSelect: (id: number | null) => void;
}) {
  if (loading) {
    return (
      <div className="stack">
        <Skeleton height="16rem" radius="var(--r-lg)" />
        <Skeleton height="4rem" radius="var(--r-md)" />
        <Skeleton height="4rem" radius="var(--r-md)" />
      </div>
    );
  }

  return (
    <div className="stack stack--loose">
      <p className="fine muted">
        Free for {longDate(date)} at {timeLabel(time)}, for {party}.
      </p>

      {/*
        The plan and nothing else. There was a list of tables under it as a
        second way to choose; the owner wants the room shown as a room. Every
        table on the plan is still a real button with a full accessible name
        ("Table T4, seats 4, free"), so a screen reader walks the same set.
      */}
      <div>
        <FloorPlan
          tables={tables}
          fixtures={fixtures as never}
          selectedId={tableId}
          onSelect={onSelect}
          partySize={party}
        />
        <p className="plan-legend fine">
          <span data-state="free" /> Free
          <span data-state="picked" /> Yours
          <span data-state="taken" /> Taken
          <span data-state="small" /> Too small
        </p>
      </div>

    </div>
  );
}

/* ── 4. Review ─────────────────────────────────────────────────────────── */

export function ReviewStep({
  date,
  time,
  party,
  table,
  basket,
  menu,
  depositFcfa,
  foodTotal,
  onBasket,
  onMenuLoaded,
  onEdit,
}: {
  date: string;
  time: string;
  party: number;
  table: DiningTable | null;
  basket: Basket;
  menu: MenuItem[] | null;
  depositFcfa: number;
  foodTotal: number;
  onBasket: (next: Basket) => void;
  onMenuLoaded: (menu: MenuItem[]) => void;
  onEdit: (step: "when" | "who" | "where") => void;
}) {
  const chosen = basketCount(basket);
  const settings = useResource(() => api.site.settings(), []);
  const lateFee = settings.data?.late_cancel_fee_fcfa;

  return (
    <div className="stack stack--loose">
      <section className="recap">
        <div className="recap-row">
          <span className="label">When</span>
          <p>
            {longDate(date)}
            <br />
            {timeLabel(time)}
          </p>
          <button type="button" className="recap-row__edit" onClick={() => onEdit("when")}>
            Change
          </button>
        </div>

        <div className="recap-row">
          <span className="label">Party</span>
          <p>{party === 1 ? "Just me" : `${party} people`}</p>
          <button type="button" className="recap-row__edit" onClick={() => onEdit("who")}>
            Change
          </button>
        </div>

        <div className="recap-row">
          <span className="label">Table</span>
          <p>{table ? `Table ${table.label}, seats ${table.capacity}` : "Any table, seated on the night"}</p>
          <button type="button" className="recap-row__edit" onClick={() => onEdit("where")}>
            Change
          </button>
        </div>
      </section>

      {/*
        Ordering ahead is genuinely optional, so it is closed by default and
        says what it is for. Open by default it read as a fifth step, and
        people were scrolling a menu to reach the button that pays for a table.
      */}
      <details className="addons">
        <summary>
          <span>
            <span className="addons__title">Have food ready when you sit down</span>
            <span className="fine muted">
              {chosen > 0 ? `${chosen} chosen, ${money(foodTotal)} FCFA` : "Optional. You can also order at the table."}
            </span>
          </span>
          <Icon name="chevron-down" size={20} />
        </summary>
        <div className="addons__body">
          <OrderStep basket={basket} onChange={onBasket} onMenuLoaded={onMenuLoaded} />
        </div>
      </details>

      <section className="stack stack--tight">
        <div className="row row--between">
          <span className="muted">Table deposit</span>
          <Money value={depositFcfa} />
        </div>
        {chosen > 0 ? (
          <div className="row row--between">
            <span className="muted">
              Food and drinks, {chosen} {chosen === 1 ? "item" : "items"}
            </span>
            <Money value={foodTotal} />
          </div>
        ) : null}
        <div className="row row--between total-row">
          <strong>To pay now</strong>
          <strong className="checkout__total">
            <Money value={depositFcfa + foodTotal} />
          </strong>
        </div>
        <p className="fine faint">
          The deposit comes off your bill on the night. Cancel more than an hour ahead and it comes back to you
          {lateFee ? `, closer than that we keep ${money(Number(lateFee))} FCFA` : ""}.
        </p>
        {menu === null && chosen > 0 ? <Notice tone="warn">Prices are being checked with the kitchen.</Notice> : null}
      </section>
    </div>
  );
}
