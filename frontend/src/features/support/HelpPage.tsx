import { Link } from "react-router-dom";
import { Icon } from "~/ui/Icon";
import { useVenue } from "~/state/venue";
import { Conversation } from "./Conversation";

/**
 * Help, with the chat as the main event.
 *
 * The answers beside it are the four things people actually write in about, so
 * most visitors get what they came for without waiting for a reply.
 */

const ANSWERS = [
  {
    q: "Can I change or cancel a booking?",
    a: (
      <>
        Yes, from <Link to="/mine">Mine</Link>. Cancel more than an hour before and the deposit comes back. Inside the
        hour we keep 1,500 FCFA, because the table sat empty.
      </>
    ),
  },
  {
    q: "My mobile money prompt never arrived",
    a: (
      <>
        It expires after about 90 seconds. Open the booking or order in <Link to="/mine">Mine</Link> and press pay
        again. Nothing is taken until you enter your PIN, so a failed attempt has not charged you.
      </>
    ),
  },
  {
    q: "How long does an order take?",
    a: "Everything is grilled from raw, so give it half an hour from the time you pick. On a busy Friday, longer.",
  },
  {
    q: "Do you deliver?",
    a: "Not ourselves. Order for collection and send someone, or use a bike rider you trust.",
  },
];

export function HelpPage() {
  const { phone, phoneHref, whatsappHref, address, hours } = useVenue();

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Help</h1>
        <p className="lead">Write to us here. If it is urgent and we are open, calling gets you an answer faster.</p>
      </div>

      <div className="help-layout">
        <div className="card">
          <Conversation active />
        </div>

        <aside className="stack stack--loose">
          <section className="card stack">
            <h2 className="card__title">Reach us</h2>
            {phoneHref ? (
              <a className="row" href={phoneHref}>
                <Icon name="phone" size={18} /> {phone}
              </a>
            ) : null}
            {whatsappHref ? (
              <a className="row" href={whatsappHref} target="_blank" rel="noreferrer noopener">
                <Icon name="message" size={18} /> WhatsApp
              </a>
            ) : null}
            <p className="row">
              <Icon name="pin" size={18} /> {address}
            </p>
            <p className="row">
              <Icon name="clock" size={18} /> {hours}
            </p>
          </section>

          <section className="stack">
            <h2 className="card__title">Asked often</h2>
            {ANSWERS.map((entry) => (
              <details key={entry.q} className="qa">
                <summary>
                  {entry.q}
                  <Icon name="chevron-down" size={18} />
                </summary>
                <p className="fine muted">{entry.a}</p>
              </details>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
