import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import type { MenuItem, Review } from "~/lib/api";
import { useQuery, prefetch } from "~/lib/store";
import { K } from "~/lib/keys";
import { money, phoneLabel } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Img } from "~/ui/Img";
import { HeroFrames } from "~/ui/HeroFrames";
import { LinkButton, PressableLink } from "~/ui/Button";
import { Money, Stars, Badge } from "~/ui/Bits";
import { Skeleton } from "~/ui/Feedback";
import { Reveal } from "~/ui/Reveal";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { useCopy } from "~/state/locale";
import { YourStuff } from "./YourStuff";

/**
 * The front door.
 *
 * Composed of full-bleed photography and rows. There is not a single card on
 * this page, which is the point: the version before it stacked seven bordered,
 * tinted, rounded boxes down a phone screen and read as a template rather than
 * as a restaurant.
 *
 * Every section is switchable from Desk > Site control, so the order below is
 * the order they appear in when they are all on.
 */

interface Highlights {
  topItems: MenuItem[];
  topReview: Review | null;
}

/** One request for the whole page. Seeded by the boot payload, so on any visit
    after the first this resolves before the first frame is drawn. */
function useHighlights() {
  return useQuery<Highlights>(K.highlights, () => api.site.highlights(), {
    persist: true,
    staleMs: 5 * 60 * 1000,
  });
}

/* ── Hero ───────────────────────────────────────────────────────────────────*/

function Hero({ images, lowestPrice }: { images: string[]; lowestPrice: number | null }) {
  const { hours, phone, phoneHref, siteConfig, address } = useVenue();
  const { c } = useCopy();

  const closed = siteConfig.business.mode === "closed";
  const orderingOpen =
    siteConfig.features.ordering && siteConfig.services.ordering.mode === "open" && !closed;
  const bookingOpen = siteConfig.features.booking && siteConfig.services.booking.mode === "open" && !closed;

  /*
   * No photographs yet.
   *
   * Every picture on this site is one the owner uploaded against a dish, and on
   * a fresh install there are none. Reserving the full photograph area anyway
   * left a third of the first screen as an empty black box, which reads as a
   * page that failed to load rather than a restaurant that has not sent its
   * photos in. So the media collapses entirely and the words move up.
   */
  const bare = images.length === 0;

  return (
    <section className="hero" data-bare={bare ? "true" : undefined}>
      {bare ? null : (
        <div className="hero__media">
          <HeroFrames images={images} />
          <div className="hero__scrim" aria-hidden="true" />
        </div>
      )}

      <div className="page hero__inner">
        <p className="hero__where label">
          <span className="hero__coal" aria-hidden="true" />
          {address}
        </p>

        {/*
          The line the restaurant asked for, and the only place on the site where
          type is allowed to be this big. It is two lines on a phone by design:
          "The best meat" then "in Buea." breaks where somebody reading it aloud
          would breathe.
        */}
        <h1 className="display display--hero hero__title">
          {c.home.heroLead}
          <br />
          <span className="hero__hot">{c.home.heroTail}</span>
        </h1>

        <p className="hero__blurb">{c.home.heroBlurb}</p>

        <div className="hero__actions">
          <LinkButton
            to="/menu"
            tone="primary"
            icon="list"
            onPrefetch={() => prefetch(K.menu, () => api.site.menu(), { persist: true })}
          >
            {c.home.seeMenu}
          </LinkButton>
          {orderingOpen ? (
            <LinkButton to="/order" tone="ghost" icon="bag">
              {c.home.orderNow}
            </LinkButton>
          ) : bookingOpen ? (
            <LinkButton to="/book" tone="ghost" icon="calendar">
              {c.home.holdTable}
            </LinkButton>
          ) : null}
        </div>

        {/* Three facts, as a row of label-over-value rather than three boxes.
            Whether they are open is the question most people arrive with. */}
        <dl className="hero__facts">
          <div>
            <dt className="label">
              {closed ? c.common.closedNow : siteConfig.business.mode === "busy" ? c.common.busyNow : c.common.openNow}
            </dt>
            <dd>{hours}</dd>
          </div>
          <div>
            <dt className="label">{c.home.platesFrom}</dt>
            <dd>{lowestPrice !== null ? `${money(lowestPrice)} FCFA` : c.common.loading}</dd>
          </div>
          <div>
            <dt className="label">{c.home.callUs}</dt>
            <dd>{phoneHref && phone ? <a href={phoneHref}>{phoneLabel(phone)}</a> : c.home.atTheCounter}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/* ── The heading above a section ────────────────────────────────────────────*/

function SectionHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <Reveal className="section-head">
      <hr className="heat-rule" />
      <h2 className="display display--xl">{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
    </Reveal>
  );
}

/* ── What people order ──────────────────────────────────────────────────────*/

function Favourites() {
  const { data, loading } = useHighlights();
  const { c } = useCopy();
  const items = data?.topItems ?? [];

  return (
    <section className="section page">
      <SectionHead title={c.home.favouritesTitle} lead={c.home.favouritesLead} />

      {loading ? (
        <div className="dishes">
          {[0, 1, 2].map((n) => (
            <div key={n} className="stack stack--tight">
              <Skeleton height="0" className="dish__shim" radius="var(--r-md)" />
              <Skeleton height="0.9rem" width="70%" />
              <Skeleton height="0.75rem" width="40%" />
            </div>
          ))}
        </div>
      ) : (
        <Reveal className="dishes">
          {items.map((item) => (
            <Link key={item.id} to="/menu" className="dish" viewTransition>
              <Img
                src={item.image_url}
                alt={item.name}
                ratio={4 / 3}
                /* Named so the browser can morph this thumbnail into the same
                   dish's photograph on the menu rather than cross-fading the
                   whole page over it. */
                className="dish__photo"
              />
              <div className="dish__body">
                <h3 className="head clip">{item.name}</h3>
                {item.description ? <p className="fine muted clip-2">{item.description}</p> : null}
                <p className="dish__price">
                  {item.price_fcfa != null ? <Money value={item.price_fcfa} size="fine" /> : <span className="fine">{item.price_label}</span>}
                </p>
              </div>
            </Link>
          ))}
        </Reveal>
      )}

      <div className="bar" style={{ marginTop: "var(--s-5)" }}>
        <LinkButton
          to="/menu"
          tone="ghost"
          size="sm"
          iconEnd="arrow-right"
          onPrefetch={() => prefetch(K.menu, () => api.site.menu(), { persist: true })}
        >
          {c.home.seeWholeMenu}
        </LinkButton>
      </div>
    </section>
  );
}

/* ── This week's offer ──────────────────────────────────────────────────────*/

function OfferStrip() {
  const { locale, c } = useCopy();
  const { data, loading } = useQuery(K.offers, () => api.site.offers(), { persist: true });

  const offer = data?.find((item) => item.is_active === 1) ?? data?.[0] ?? null;
  if (loading) return null;
  if (!offer) return null;

  return (
    <section className="section page">
      <SectionHead title={c.home.offerTitle} lead={c.home.offerLead} />
      <Reveal>
        <PressableLink to="/offers" className="offer">
          <div className="offer__body">
            {offer.badge ? <Badge tone="hot">{offer.badge}</Badge> : null}
            <h3 className="display display--lg">{offer.title}</h3>
            <p className="fine muted">{offer.description}</p>
          </div>
          <div className="offer__go">
            {offer.valid_until ? (
              <span className="fine faint">
                {c.offers.until}{" "}
                {new Date(offer.valid_until).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            ) : null}
            <Icon name="arrow-right" size={17} />
          </div>
        </PressableLink>
      </Reveal>
    </section>
  );
}

/* ── Three ways in ──────────────────────────────────────────────────────────*/

function Ways() {
  const { depositFcfa, siteConfig } = useVenue();
  const { c, fill } = useCopy();

  const ways = [
    siteConfig.features.ordering
      ? {
          to: "/order",
          icon: "bag" as const,
          title: c.home.wayOrderTitle,
          body: c.home.wayOrderBody,
          action: c.home.wayOrderAction,
        }
      : null,
    siteConfig.features.booking
      ? {
          to: "/book",
          icon: "calendar" as const,
          title: c.home.wayBookTitle,
          body: c.home.wayBookBody + " " + fill(c.book.depositBody, { amount: money(depositFcfa) }),
          action: c.home.wayBookAction,
        }
      : null,
    siteConfig.features.waitlist
      ? {
          to: "/waitlist",
          icon: "users" as const,
          title: c.home.wayQueueTitle,
          body: c.home.wayQueueBody,
          action: c.home.wayQueueAction,
        }
      : null,
  ].filter((way) => way !== null);

  if (ways.length === 0) return null;

  return (
    <section className="section page">
      <SectionHead title={c.home.waysTitle} />
      {/* Rows with a hairline between them, not three cards. Each one is the
          full width of the screen, which is also the full width of a thumb. */}
      <Reveal className="rows ways">
        {ways.map((way) => (
          <PressableLink key={way.to} to={way.to} className="way">
            <span className="way__icon" aria-hidden="true">
              <Icon name={way.icon} size={19} />
            </span>
            <span className="way__text">
              <span className="head">{way.title}</span>
              <span className="fine muted">{way.body}</span>
              <span className="way__go fine">
                {way.action} <Icon name="arrow-right" size={14} />
              </span>
            </span>
          </PressableLink>
        ))}
      </Reveal>
    </section>
  );
}

/* ── A look around ──────────────────────────────────────────────────────────*/

function GalleryStrip() {
  const { c } = useCopy();
  const { data, loading } = useQuery(K.gallery, () => api.site.gallery(), { persist: true });

  const photos = (data ?? []).filter((photo) => photo.is_approved === 1).slice(0, 6);
  if (loading || photos.length === 0) return null;

  return (
    <section className="section">
      <div className="page">
        <SectionHead title={c.home.galleryTitle} lead={c.home.galleryLead} />
      </div>

      {/*
        A rail that scrolls sideways rather than a grid that wraps. Six small
        photographs in a row you can flick through takes a fifth of the vertical
        space of six in a grid, and browsing pictures sideways is what a phone is
        for. It scrolls inside itself, so the page never moves horizontally.
      */}
      <div className="rail" data-scroller="">
        <div className="rail__track">
          {photos.map((photo) => (
            <Link key={photo.id} to="/gallery" className="rail__item" viewTransition>
              <Img src={photo.image_url} alt={photo.caption || c.gallery.title} ratio={1} />
            </Link>
          ))}
        </div>
      </div>

      <div className="page bar" style={{ marginTop: "var(--s-4)" }}>
        <LinkButton to="/gallery" tone="ghost" size="sm" iconEnd="arrow-right">
          {c.home.seeGallery}
        </LinkButton>
      </div>
    </section>
  );
}

/* ── Why an account ─────────────────────────────────────────────────────────*/

function WhyAnAccount() {
  const { c } = useCopy();
  return (
    <section className="section page">
      <Reveal className="join">
        <div className="stack stack--tight">
          <h2 className="display display--lg">{c.home.accountTitle}</h2>
          <p className="lead">{c.home.accountBody}</p>
        </div>
        <div className="bar bar--wrap">
          <LinkButton to="/join" tone="primary" size="sm">
            {c.home.accountCreate}
          </LinkButton>
          <LinkButton to="/signin" tone="ghost" size="sm">
            {c.home.accountHave}
          </LinkButton>
        </div>
      </Reveal>
    </section>
  );
}

/* ── One review ─────────────────────────────────────────────────────────────*/

function WordOfMouth() {
  const { data } = useHighlights();
  const { c } = useCopy();
  const review = data?.topReview;
  if (!review) return null;

  return (
    <section className="section page">
      <Reveal as="figure" className="quote">
        <Stars value={review.rating} size={16} showValue={false} />
        <blockquote className="quote__text">{review.text}</blockquote>
        <figcaption className="quote__by fine">
          {review.author}
          <Link to="/reviews" className="quote__more" viewTransition>
            {c.home.reviewsMore} <Icon name="arrow-right" size={14} />
          </Link>
        </figcaption>
      </Reveal>
    </section>
  );
}

/* ── Where we are ───────────────────────────────────────────────────────────*/

function FindUs() {
  const { address, hours, phone, phoneHref, whatsappHref } = useVenue();
  const { c } = useCopy();

  return (
    <section className="section page">
      <SectionHead title={c.home.findTitle} />
      <Reveal className="rows">
        <div className="row row--top">
          <Icon name="pin" size={18} className="row__lead" />
          <div className="grow">
            <p>{address}</p>
            <p className="fine faint">{c.home.findHint}</p>
          </div>
        </div>
        <div className="row">
          <Icon name="clock" size={18} className="row__lead" />
          <p className="grow">{hours}</p>
        </div>
        {phone && phoneHref ? (
          <div className="row">
            <Icon name="phone" size={18} className="row__lead" />
            <a className="grow" href={phoneHref}>
              {phoneLabel(phone)}
            </a>
          </div>
        ) : null}
        {whatsappHref ? (
          <div className="row">
            <Icon name="message" size={18} className="row__lead" />
            <a className="grow" href={whatsappHref} target="_blank" rel="noreferrer noopener">
              WhatsApp
            </a>
          </div>
        ) : null}
      </Reveal>

      <div className="bar bar--wrap" style={{ marginTop: "var(--s-5)" }}>
        <LinkButton to="/find" tone="primary" size="sm" icon="pin">
          {c.home.directions}
        </LinkButton>
        <LinkButton to="/story" tone="ghost" size="sm">
          {c.home.ourStory}
        </LinkButton>
      </div>
    </section>
  );
}

/* ── The page ───────────────────────────────────────────────────────────────*/

export function Home() {
  const { user, ready } = useSession();
  const { siteConfig } = useVenue();
  const { data } = useHighlights();

  const items = data?.topItems ?? [];
  const images = items.flatMap((item) => (item.image_url ? [item.image_url] : []));
  const prices = items.map((item) => item.price_fcfa).filter((value): value is number => typeof value === "number" && value > 0);
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;

  const signedIn = ready && user !== null;
  const home = siteConfig.homepage;

  return (
    <>
      {home.hero ? (
        signedIn ? (
          <YourStuff name={user.name} />
        ) : (
          <Hero images={images} lowestPrice={lowestPrice} />
        )
      ) : null}

      {home.featured ? <Favourites /> : null}
      {home.offer && siteConfig.features.offers ? <OfferStrip /> : null}
      {home.ways ? <Ways /> : null}
      {home.gallery && siteConfig.features.gallery ? <GalleryStrip /> : null}
      {home.accountCta && siteConfig.features.customerAccounts && !signedIn ? <WhyAnAccount /> : null}
      {home.reviews && siteConfig.features.reviews ? <WordOfMouth /> : null}
      {home.location ? <FindUs /> : null}
    </>
  );
}
