import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { money } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { LinkButton } from "~/ui/Button";
import { Money, Stars } from "~/ui/Bits";
import { Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { YourStuff } from "./YourStuff";

/**
 * The home page, which is two pages wearing one route.
 *
 * A stranger needs to know what this place is and be given the two ways in.
 * Somebody with an account has already decided all that and came back to check
 * one thing, so they get their next table and their live order first, and none
 * of the pitch. The parts that are useful to both — what people order, what
 * people said, where we are — are shared underneath.
 */

function Hero({ images }: { images: string[] }) {
  const { address, hours } = useVenue();

  return (
    <section className="hero">
      <div className="hero__frames" aria-hidden="true">
        {images.slice(0, 3).map((src, index) => (
          <div key={src} className={`hero__frame hero__frame--${index + 1}`}>
            <Photo src={src} alt="" eager={index === 0} />
          </div>
        ))}
      </div>

      <div className="page hero__inner">
        <p className="hero__eyebrow label">
          <span className="hero__coal" aria-hidden="true" />
          Clerks Quarters, Buea
        </p>

        <h1 className="display display--hero hero__title">
          The best meat
          <br />
          <span className="hero__hot">in Buea</span>
        </h1>

        <p className="hero__blurb">
          Beef, chicken and more, cooked fresh every day at Cam Chop Meat. Order a takeaway meal or book a table, both
          from your phone.
        </p>

        <div className="hero__actions">
          <LinkButton to="/book" tone="primary" size="lg" icon="calendar">
            Book a table
          </LinkButton>
          <LinkButton to="/order" tone="ghost" size="lg" icon="bag">
            Order takeaway
          </LinkButton>
        </div>

        <dl className="hero__facts">
          <div>
            <dt className="label">Open</dt>
            <dd>{hours}</dd>
          </div>
          <div>
            <dt className="label">Find us</dt>
            <dd>{address}</dd>
          </div>
          <div>
            {/* What the cheapest thing on the menu costs — not the deposit,
                which happens to be the same figure today and would otherwise
                start claiming food costs whatever the owner sets a table at. */}
            <dt className="label">From</dt>
            <dd className="mono">2,500 FCFA</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Favourites() {
  const { data, loading } = useResource(() => api.site.highlights(), []);
  const items = data?.topItems ?? [];

  return (
    <section className="section page">
      <div className="section-head">
        <hr className="heat-rule" />
        <h2 className="display display--xl">What people order</h2>
        <p className="lead">
          Everything is cooked fresh when you order it, so give it a little time. The price here is the price you pay.
        </p>
      </div>

      {loading ? (
        <div className="dish-grid">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} height="12rem" radius="var(--r-lg)" />
          ))}
        </div>
      ) : (
        <div className="dish-grid">
          {items.map((item) => (
            <article key={item.id} className="dish">
              <div className="dish__photo">
                <Photo src={item.image_url} alt={item.name} />
              </div>
              <div className="dish__body">
                <h3 className="dish__name">{item.name}</h3>
                <p className="fine muted dish__note">{item.description}</p>
                <p className="dish__price">
                  {item.price_fcfa !== null ? <Money value={item.price_fcfa} /> : <span>{item.price_label}</span>}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: "var(--s-5)" }}>
        <LinkButton to="/menu" iconEnd="arrow-right">
          See the whole menu
        </LinkButton>
      </div>
    </section>
  );
}

/** Three ways in, because the answer to "can I just show up" genuinely
    depends on the night. */
function Ways() {
  const { depositFcfa } = useVenue();

  return (
    <section className="section page">
      <div className="ways">
        <Link to="/book" className="way card card--action">
          <span className="way__icon">
            <Icon name="calendar" size={22} />
          </span>
          <h3 className="card__title">Hold a table</h3>
          <p className="fine muted">
            Pick a time and a table. A {money(depositFcfa)} FCFA deposit through MTN Mobile Money holds it, and it comes off
            your bill.
          </p>
          <span className="way__go">
            Book <Icon name="arrow-right" size={16} />
          </span>
        </Link>

        <Link to="/order" className="way card card--action">
          <span className="way__icon">
            <Icon name="bag" size={22} />
          </span>
          <h3 className="card__title">Takeaway</h3>
          <p className="fine muted">
            Order and pay ahead, choose your pickup time, then show your code at the counter. Nothing to queue for.
          </p>
          <span className="way__go">
            Order <Icon name="arrow-right" size={16} />
          </span>
        </Link>

        <Link to="/waitlist" className="way card card--action">
          <span className="way__icon">
            <Icon name="users" size={22} />
          </span>
          <h3 className="card__title">Already here</h3>
          <p className="fine muted">
            Full house on a Friday. Put your name down from your phone and we will call you when a table clears.
          </p>
          <span className="way__go">
            Join the queue <Icon name="arrow-right" size={16} />
          </span>
        </Link>
      </div>
    </section>
  );
}

/**
 * The reason to make an account, shown only to somebody who has not.
 *
 * It says what the account is for rather than asking them to join a club:
 * without one they cannot book a table or find an order later.
 */
function WhyAnAccount() {
  return (
    <section className="section page">
      <div className="join-strip">
        <div className="stack stack--tight">
          <h2 className="display display--lg">Eating with us often?</h2>
          <p className="muted">
            An account is what lets you book a table, keep your codes and receipts in one place, and change or cancel
            without calling anybody. It takes a minute.
          </p>
        </div>
        <div className="row row--wrap">
          <LinkButton to="/join" tone="primary">
            Create an account
          </LinkButton>
          <LinkButton to="/signin" tone="ghost">
            I already have one
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

function WordOfMouth() {
  const { data } = useResource(() => api.site.highlights(), []);
  const review = data?.topReview;
  if (!review) return null;

  return (
    <section className="section page">
      <figure className="quote">
        <Stars value={review.rating} size={18} showValue={false} />
        <blockquote className="quote__text">{review.text}</blockquote>
        <figcaption className="quote__by">
          {review.author}
          <Link to="/reviews" className="quote__more">
            Read the rest <Icon name="arrow-right" size={15} />
          </Link>
        </figcaption>
      </figure>
    </section>
  );
}

function FindUs() {
  const { address, hours, phone, phoneHref, socials } = useVenue();
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Cam Chop Meat ${address}`)}`;

  return (
    <section className="section page">
      <div className="section-head">
        <hr className="heat-rule" />
        <h2 className="display display--xl">Where we are</h2>
      </div>

      <div className="find">
        <div className="find__row">
          <Icon name="pin" size={20} />
          <div>
            <p>{address}</p>
            <a href={mapHref} target="_blank" rel="noreferrer noopener" className="fine hot">
              Open in Maps
            </a>
          </div>
        </div>

        <div className="find__row">
          <Icon name="clock" size={20} />
          <p>{hours}</p>
        </div>

        {phone && phoneHref ? (
          <div className="find__row">
            <Icon name="phone" size={20} />
            <a href={phoneHref}>{phone}</a>
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
      </div>
    </section>
  );
}

export function Home() {
  const { user, ready } = useSession();
  const { data } = useResource(() => api.site.highlights(), []);
  const images = (data?.topItems ?? []).flatMap((item) => (item.image_url ? [item.image_url] : []));

  /* Until the session has been read, show the hero. It is the honest default:
     a returning customer sees it for a moment, where the reverse would flash
     somebody else's name at a stranger. */
  const signedIn = ready && user !== null;

  return (
    <>
      {signedIn ? <YourStuff name={user.name} /> : <Hero images={images} />}
      <Favourites />
      <Ways />
      {signedIn ? null : <WhyAnAccount />}
      <WordOfMouth />
      <FindUs />
    </>
  );
}
