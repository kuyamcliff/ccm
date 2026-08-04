import { Icon } from "~/ui/Icon";
import { LinkButton } from "~/ui/Button";
import { Reveal } from "~/ui/Reveal";
import { phoneLabel } from "~/lib/format";
import { useVenue } from "~/state/venue";

/**
 * Where we are, how to get here, and how to reach us.
 *
 * Written for somebody standing on a Buea road with one bar of signal. The
 * three things they need are a tap that calls, a tap that opens their own maps
 * app, and the landmark to tell a bike rider. Everything else on the page is
 * underneath those.
 *
 * The map is drawn rather than embedded. A real tile layer is a third party
 * request, a licence, and a couple of hundred kilobytes on a connection that
 * may not have them to spare, and it would still not be the thing anybody
 * navigates by. This shows the shape of the corner and hands off to the phone's
 * own maps app, which is where somebody actually finding us wants to end up.
 */

const DIRECTIONS = [
  "Make your way to Razel Street.",
  "Find the P and T school and keep it on your left.",
  "We are directly opposite it. Look for the grill and the smoke.",
];

export function FindPage() {
  const { address, hours, phone, phoneHref, whatsappHref, socials } = useVenue();
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Cam Chop Meat ${address}`)}`;

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Find us</h1>
        <p className="lead">{address}. Look for the grill on the corner.</p>
      </div>

      <div className="stack stack--loose">
        <Reveal>
          <a className="visit__map" href={mapHref} target="_blank" rel="noreferrer noopener" aria-label="Open in maps">
            <span className="visit__grid" aria-hidden="true" />
            <span className="visit__road visit__road--main" aria-hidden="true" />
            <span className="visit__road visit__road--side" aria-hidden="true" />
            <span className="visit__pin" aria-hidden="true">
              <span>
                <Icon name="flame" size={20} />
              </span>
              <span>Cam Chop Meat</span>
            </span>
            <span className="visit__open">
              <Icon name="external" size={15} />
              Open in maps
            </span>
          </a>
        </Reveal>

        <Reveal className="visit__actions" index={1}>
          {phoneHref ? (
            <a className="btn btn--primary btn--lg" href={phoneHref}>
              <Icon name="phone" size={18} />
              Call us
            </a>
          ) : null}
          {whatsappHref ? (
            <a className="btn btn--ghost btn--lg" href={whatsappHref} target="_blank" rel="noreferrer noopener">
              <Icon name="message" size={18} />
              WhatsApp
            </a>
          ) : null}
        </Reveal>

        <Reveal className="find" index={2}>
          <div className="find__row">
            <Icon name="pin" size={20} />
            <div>
              <p>{address}</p>
              <a href={mapHref} target="_blank" rel="noreferrer noopener" className="fine hot">
                Get directions
              </a>
            </div>
          </div>

          <div className="find__row">
            <Icon name="clock" size={20} />
            <div>
              <p>{hours}</p>
              <p className="fine faint">The grill runs late on Friday and Saturday.</p>
            </div>
          </div>

          {phone && phoneHref ? (
            <div className="find__row">
              <Icon name="phone" size={20} />
              <div>
                <a href={phoneHref}>{phoneLabel(phone)}</a>
                <p className="fine faint">Tap to call.</p>
              </div>
            </div>
          ) : null}

          {socials.length > 0 ? (
            <div className="find__row">
              <Icon name="sparkle" size={20} />
              <p className="row row--wrap">
                {socials.map((social) => (
                  <a key={social.label} href={social.url} target="_blank" rel="noreferrer noopener" className="hot">
                    {social.label}
                  </a>
                ))}
              </p>
            </div>
          ) : null}
        </Reveal>

        <Reveal index={3}>
          <h2 className="display display--lg" style={{ marginBottom: "var(--s-4)" }}>
            Getting here
          </h2>
          <div className="visit__directions">
            {DIRECTIONS.map((step) => (
              <p key={step} className="visit__step">
                <span>{step}</span>
              </p>
            ))}
          </div>
          <p className="fine faint" style={{ marginTop: "var(--s-4)" }}>
            Telling a bike rider "Cam Chop Meat, Razel Street, opposite P and T" is usually enough.
          </p>
        </Reveal>

        <Reveal className="join-strip" index={4}>
          <div className="stack stack--tight">
            <h2 className="display display--lg">Before you set off</h2>
            <p className="muted">
              Order ahead and your food is ready when you arrive. Book a table and it is waiting for you.
            </p>
          </div>
          <div className="row row--wrap">
            <LinkButton to="/order" tone="primary" icon="bag">
              Order takeaway
            </LinkButton>
            <LinkButton to="/book" tone="ghost" icon="calendar">
              Book a table
            </LinkButton>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
