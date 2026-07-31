import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { money } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { LinkButton } from "~/ui/Button";
import { Money, Stars } from "~/ui/Bits";
import { Skeleton } from "~/ui/Feedback";
import { useVenue } from "~/state/venue";

/**
 * The home page has one job: get a hungry person to a table or to a collection
 * order in as few taps as possible. Everything else on it is evidence that the
 * place is real — the food, what people said, where it is.
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
          Chicken,
          <br />
          pork and goat
          <br />
          <span className="hero__hot">over charcoal</span>
        </h1>

        <p className="hero__blurb">
          The grill goes on in the afternoon and runs until the meat is finished. Book a table, or send your order ahead
          and collect it hot.
        </p>

        <div className="hero__actions">
          <LinkButton to="/book" tone="primary" size="lg" icon="calendar">
            Book a table
          </LinkButton>
          <LinkButton to="/order" tone="ghost" size="lg" icon="bag">
            Order for collection
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
            <dt className="label">From</dt>
            <dd className="mono">2,500 FCFA</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Signatures() {
  const { data, loading } = useResource(() => api.site.highlights(), []);
  const items = data?.topItems ?? [];

  return (
    <section className="section page">
      <div className="section-head">
        <hr className="heat-rule" />
        <h2 className="display display--xl">On the coals</h2>
        <p className="lead">
          Everything is grilled to order, so give it a little time. Prices are what you pay at the table.
        </p>
      </div>

      {loading ? (
        <div className="dish-grid">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height="16rem" radius="var(--r-lg)" />
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
                <h3 className="card__title">{item.name}</h3>
                <p className="fine muted">{item.description}</p>
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

/** Three ways in, because the answer to "can I just show up" is genuinely
    different depending on the night. */
function Ways() {
  return (
    <section className="section page">
      <div className="ways">
        <Link to="/book" className="way card card--action">
          <span className="way__icon">
            <Icon name="calendar" size={22} />
          </span>
          <h3 className="card__title">Hold a table</h3>
          <p className="fine muted">
            Pick a time and a table. A {money(2500)} FCFA deposit through MTN Mobile Money holds it, and it comes off
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
          <h3 className="card__title">Collect it</h3>
          <p className="fine muted">
            Order and pay ahead, choose a pickup time, then show your code at the counter. Nothing to queue for.
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
  const { data } = useResource(() => api.site.highlights(), []);
  const images = (data?.topItems ?? []).flatMap((item) => (item.image_url ? [item.image_url] : []));

  return (
    <>
      <Hero images={images} />
      <Signatures />
      <Ways />
      <WordOfMouth />
      <FindUs />
    </>
  );
}
