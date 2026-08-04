import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import type { Booking } from "~/lib/api";
import { longDate, money } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Button, LinkButton } from "~/ui/Button";
import { Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useVenue } from "~/state/venue";
import { BookingSheet } from "./BookingSheet";
import type { BookingReady } from "./BookingSheet";
import { MomoDialog } from "~/features/pay/MomoDialog";
import { BookingPass } from "~/features/mine/BookingPass";

/**
 * The booking route.
 *
 * The questions themselves live in a dialog — booking is one errand, and on a
 * phone each question wants the whole screen without four navigations piling
 * up in the back button. This page is what sits behind it: what a table costs
 * and how holding one works, so closing the dialog lands somebody somewhere
 * that makes sense rather than on a blank screen.
 *
 * It stays a real route so /book can be linked to, shared, and reached from
 * the tab bar. The dialog opens on arrival.
 */

export function BookPage() {
  const { user, ready } = useSession();
  const { depositFcfa } = useVenue();
  const toast = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState<BookingReady | null>(null);
  const [paid, setPaid] = useState<Booking | null>(null);

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
        <div className="card stack" style={{ maxWidth: "32rem" }}>
          <p className="muted">
            Booking needs an account, so your table, your code and your receipt stay in one place and you can change or
            cancel without calling anybody.
          </p>
          <div className="row row--wrap">
            <LinkButton to="/join" tone="primary">
              Create an account
            </LinkButton>
            <LinkButton to="/signin" tone="ghost">
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
          <p className="lead">
            Show this at the door. It is also in Mine, so you do not need to keep this page open.
          </p>
        </div>
        <BookingPass booking={{ ...paid, status: "confirmed", payment_status: "paid" }} />
        <div className="row row--wrap">
          <LinkButton to="/mine" tone="primary" iconEnd="arrow-right">
            See my bookings
          </LinkButton>
          <Button
            tone="ghost"
            onClick={() => {
              setPaid(null);
              setPending(null);
              setOpen(true);
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
        <p className="lead">
          Four questions and a {money(depositFcfa)} FCFA deposit, which comes off your bill on the night.
        </p>
      </div>

      <div className="book-intro">
        <ol className="book-how">
          <li>
            <Icon name="calendar" size={18} />
            <span>Pick a day and a time</span>
          </li>
          <li>
            <Icon name="users" size={18} />
            <span>Tell us how many of you</span>
          </li>
          <li>
            <Icon name="grid" size={18} />
            <span>Choose your table off the plan</span>
          </li>
          <li>
            <Icon name="basket" size={18} />
            <span>Order food ahead, if you want it waiting</span>
          </li>
        </ol>

        <Button tone="primary" size="lg" icon="calendar" onClick={() => setOpen(true)}>
          Book now
        </Button>

        <p className="fine faint">
          Cancel more than an hour ahead and the deposit comes back to you. Closer than that we keep it, because the
          table sat empty.
        </p>
      </div>

      <BookingSheet
        open={open && pending === null}
        onClose={() => setOpen(false)}
        onReady={(result) => {
          /* Two dialogs cannot be open together — each traps focus and draws
             its own scrim — so the wizard closes as payment takes over. */
          setOpen(false);
          setPending(result);
        }}
      />

      {pending ? (
        <MomoDialog
          open
          amountFcfa={pending.dueNow}
          title={pending.hasFood ? "Pay the deposit and your order" : "Pay the deposit"}
          what={`${longDate(pending.booking.date)} at ${pending.booking.time}, ${pending.booking.party_size} people`}
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
