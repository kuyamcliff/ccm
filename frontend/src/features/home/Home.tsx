import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { money, phoneLabel } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { LinkButton } from "~/ui/Button";
import { Money, Stars } from "~/ui/Bits";
import { Skeleton } from "~/ui/Feedback";
import { Reveal } from "~/ui/Reveal";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { YourStuff } from "./YourStuff";

/**
 * The home page, which is two pages wearing one route.
 *
 * A stranger needs to know what this place is and be handed the two ways in.
 * Somebody with an account decided all that long ago and came back to check
 * one thing, so they get their next table and their live order first and none
 * of the pitch. What is useful to both, what people order and where we are,
 * sits underneath.
 */

function Hero({ images }: { images: string[] }) {
  const { hours, phone, phoneHref } = useVenue();

  return (
    <section className="hero">
      {/*
        The restaurant's own photographs, crossfading, with the words on solid
        black underneath rather than floating on top of them. See the hero
        block in pages.css for why that is the only arrangement that survives
        the owner uploading whatever they photographed that day.
      */}
      <div className="hero__media">
        <div className="hero__frames" aria-hidden="true">
          {images.slice(0, 3).map((src, index) => (
            <div key={src} className={`hero__frame hero__frame--${index + 1}`}>
              <Photo src={src} alt="" eager={index === 0} />
            </div>
          ))}
        </div>

        <p className="hero__eyebrow label">
          <span className="hero__coal" aria-hidden="true" />
          Razel Street, Buea
        </p>
      </div>

      <div className="page hero__inner">
        <h1 className="display display--hero hero__title">
          Off the fire,
          <br />
          <span className="hero__hot">every day</span>
        </h1>

        <p className="hero__blurb">
          Chicken, goat and pork grilled fresh at Cam Chop Meat. Order for takeaway or book your table, straight from
          your phone.
        </p>

        <div className="hero__actions">
          <LinkButton to="/menu" tone="primary" icon="list">
            See the menu
          </LinkButton>
          <LinkButton to="/order" tone="ghost" icon="bag">
            Order now
          </LinkButton>
        </div>

        {/*
          Three facts, each short enough to hold a column on a 320px screen.
          The address is not among them: the badge on the photograph already
          says where this is, and repeating it here wraps to five lines and
          throws the row out.
        */}
        <dl className="hero__facts">
          <div>
            <dt className="label">Open</dt>
            <dd>{hours}</dd>
          </div>
          <div>
            {/* The cheapest thing on the menu, not the table deposit, which
                happens to be the same figure today and would otherwise start
                claiming food costs whatever the owner sets a table at. */}
            <dt className="label">Plates from</dt>
            <dd className="mono">2,500 FCFA</dd>
          </div>
          <div>
            <dt className="label">Call us</dt>
            <dd>{phoneHref ? <a href={phoneHref}>{phoneLabel(phone ?? "")}</a> : "At the counter"}</dd>
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
      <Reveal className="section-head">
        <hr className="heat-rule" />
        <h2 className="display display--xl">What people order</h2>
        <p className="lead">
          Everything goes on the fire when you order it, so give it a little time. The price here is the price you pay.
        </p>
      </Reveal>

      {loading ? (
        <div className="dish-grid">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} height="12rem" radius="var(--r-md)" />
          ))}
        </div>
      ) : (
        <Reveal className="dish-grid">
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
        </Reveal>
      )}

      <div className="row" style={{ marginTop: "var(--s-5)" }}>
        <LinkButton to="/menu" tone="ghost" iconEnd="arrow-right">
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
      <Reveal className="ways">
        <Link to="/order" className="way">
          <span className="way__icon">
            <Icon name="bag" size={22} />
          </span>
          <h3 className="card__title">Order takeaway</h3>
          <p className="fine">
            Pay ahead with Mobile Money, pick your collection time, then show your code at the counter. No queue.
          </p>
          <span className="way__go">
            Start an order <Icon name="arrow-right" size={16} />
          </span>
        </Link>

        <Link to="/book" className="way">
          <span className="way__icon">
            <Icon name="calendar" size={22} />
          </span>
          <h3 className="card__title">Hold a table</h3>
          <p className="fine">
            Pick a time and a table off the plan. A {money(depositFcfa)} FCFA deposit holds it and comes off your bill.
          </p>
          <span className="way__go">
            Book a table <Icon name="arrow-right" size={16} />
          </span>
        </Link>

        <Link to="/waitlist" className="way">
          <span className="way__icon">
            <Icon name="users" size={22} />
          </span>
          <h3 className="card__title">Already outside</h3>
          <p className="fine">
            Full house on a Friday. Put your name down from your phone and we will call you when a table clears.
          </p>
          <span className="way__go">
            Join the queue <Icon name="arrow-right" size={16} />
          </span>
        </Link>
      </Reveal>
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
      <Reveal className="join-strip">
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
      </Reveal>
    </section>
  );
}

function WordOfMouth() {
  const { data } = useResource(() => api.site.highlights(), []);
  const review = data?.topReview;
  if (!review) return null;

  return (
    <section className="section page">
      <Reveal as="figure" className="quote">
        <Stars value={review.rating} size={18} showValue={false} />
        <blockquote className="quote__text">{review.text}</blockquote>
        <figcaption className="quote__by">
          {review.author}
          <Link to="/reviews" className="quote__more">
            Read the rest <Icon name="arrow-right" size={15} />
          </Link>
        </figcaption>
      </Reveal>
    </section>
  );
}

function FindUs() {
  const { address, hours, phone, phoneHref, whatsappHref } = useVenue();

  return (
    <section className="section page">
      <Reveal className="section-head">
        <hr className="heat-rule" />
        <h2 className="display display--xl">Where we are</h2>
      </Reveal>

      <Reveal className="find">
        <div className="find__row">
          <Icon name="pin" size={20} />
          <div>
            <p>{address}</p>
            <p className="fine faint">Look for the grill on the corner.</p>
          </div>
        </div>

        <div className="find__row">
          <Icon name="clock" size={20} />
          <p>{hours}</p>
        </div>

        {phone && phoneHref ? (
          <div className="find__row">
            <Icon name="phone" size={20} />
            <a href={phoneHref}>{phoneLabel(phone)}</a>
          </div>
        ) : null}

        {whatsappHref ? (
          <div className="find__row">
            <Icon name="message" size={20} />
            <a href={whatsappHref} target="_blank" rel="noreferrer noopener">
              Message us on WhatsApp
            </a>
          </div>
        ) : null}
      </Reveal>

      <div className="row row--wrap" style={{ marginTop: "var(--s-5)" }}>
        <LinkButton to="/find" tone="primary" icon="pin">
          Directions and map
        </LinkButton>
        <LinkButton to="/story" tone="ghost">
          Our story
        </LinkButton>
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
