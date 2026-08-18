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
import { useLocale } from "~/state/locale";
import { YourStuff } from "./YourStuff";

function Hero({ images, lowestPrice }: { images: string[]; lowestPrice: number | null }) {
  const { hours, phone, phoneHref, address, siteConfig } = useVenue();
  const { locale, t } = useLocale();
  const orderingOpen = siteConfig.features.ordering && siteConfig.services.ordering.mode === "open" && siteConfig.business.mode !== "closed";
  const bookingOpen = siteConfig.features.booking && siteConfig.services.booking.mode === "open" && siteConfig.business.mode !== "closed";
  return <section className="hero"><div className="hero__media"><div className="hero__frames" aria-hidden="true">{images.slice(0, 3).map((src, index) => <div key={src} className={`hero__frame hero__frame--${index + 1}`}><Photo src={src} alt="" eager={index === 0} /></div>)}</div><p className="hero__eyebrow label"><span className="hero__coal" aria-hidden="true" />{address}</p></div><div className="page hero__inner"><h1 className="display display--hero hero__title">{locale === "fr" ? "Frais, grillé au feu." : "Fresh off the fire."}<br /><span className="hero__hot">{locale === "fr" ? "À Buea." : "In Buea."}</span></h1><p className="hero__blurb">{locale === "fr" ? "Poulet, porc et chèvre grillés à la commande, avec vos accompagnements préférés. Réservez ou commandez directement depuis votre téléphone." : "Chicken, pork and goat grilled fresh over the fire, with the sides you actually want. Book or order straight from your phone."}</p><div className="hero__actions"><LinkButton to="/menu" tone="primary" icon="list">{t("seeMenu")}</LinkButton>{orderingOpen ? <LinkButton to="/order" tone="ghost" icon="bag">{t("orderNow")}</LinkButton> : bookingOpen ? <LinkButton to="/book" tone="ghost" icon="calendar">{t("book")}</LinkButton> : null}</div><dl className="hero__facts"><div><dt className="label">{siteConfig.business.mode === "closed" ? t("closed") : t("openNow")}</dt><dd>{hours}</dd></div><div><dt className="label">{locale === "fr" ? "À partir de" : "Plates from"}</dt><dd className="mono">{lowestPrice !== null ? `${money(lowestPrice)} FCFA` : "—"}</dd></div><div><dt className="label">{t("call")}</dt><dd>{phoneHref ? <a href={phoneHref}>{phoneLabel(phone ?? "")}</a> : "At the counter"}</dd></div></dl></div></section>;
}

function Favourites() {
  const { data, loading } = useResource(() => api.site.highlights(), []);
  const items = data?.topItems ?? [];
  const { locale } = useLocale();
  return <section className="section page"><Reveal className="section-head"><hr className="heat-rule" /><h2 className="display display--xl">{locale === "fr" ? "Les plats préférés" : "What people order"}</h2><p className="lead">{locale === "fr" ? "Tout est grillé à la commande. Le prix affiché est le prix que vous payez." : "Everything goes on the fire when you order it, so give it a little time. The price here is the price you pay."}</p></Reveal>{loading ? <div className="dish-grid">{[0, 1, 2, 3].map((n) => <Skeleton key={n} height="12rem" radius="var(--r-md)" />)}</div> : <Reveal className="dish-grid">{items.map((item) => <article key={item.id} className="dish"><div className="dish__photo"><Photo src={item.image_url} alt={item.name} /></div><div className="dish__body"><h3 className="dish__name">{item.name}</h3><p className="fine muted dish__note">{item.description}</p><p className="dish__price">{item.price_fcfa !== null ? <Money value={item.price_fcfa} /> : <span>{item.price_label}</span>}</p></div></article>)}</Reveal>}<div className="row" style={{ marginTop: "var(--s-5)" }}><LinkButton to="/menu" tone="ghost" iconEnd="arrow-right">{locale === "fr" ? "Voir tout le menu" : "See the whole menu"}</LinkButton></div></section>;
}

function Ways() {
  const { depositFcfa, siteConfig } = useVenue();
  const { locale } = useLocale();
  const items = [
    siteConfig.features.ordering ? { to: "/order", icon: "bag" as const, title: locale === "fr" ? "Commander à emporter" : "Order takeaway", body: locale === "fr" ? `Payez avec MTN ou Orange Money, choisissez l'heure et présentez votre code au comptoir.` : `Pay with MTN or Orange Money, choose your pickup time, then show your code at the counter.`, action: locale === "fr" ? "Commander" : "Start an order" } : null,
    siteConfig.features.booking ? { to: "/book", icon: "calendar" as const, title: locale === "fr" ? "Réserver une table" : "Hold a table", body: locale === "fr" ? `Choisissez l'heure et la table. Un acompte de ${money(depositFcfa)} FCFA bloque la réservation et sera déduit de l'addition.` : `Pick a time and a table. A ${money(depositFcfa)} FCFA deposit holds it and comes off your bill.`, action: locale === "fr" ? "Réserver" : "Book a table" } : null,
    siteConfig.features.waitlist ? { to: "/waitlist", icon: "users" as const, title: locale === "fr" ? "Déjà sur place ?" : "Already outside", body: locale === "fr" ? "La salle est pleine ? Rejoignez la file depuis votre téléphone et nous vous préviendrons." : "Full house? Join the queue from your phone and we'll let you know when a table clears.", action: locale === "fr" ? "Rejoindre la file" : "Join the queue" } : null,
  ].filter(Boolean) as { to: string; icon: "bag" | "calendar" | "users"; title: string; body: string; action: string }[];
  if (items.length === 0) return null;
  return <section className="section page"><Reveal className="ways">{items.map((item) => <Link key={item.to} to={item.to} className="way"><span className="way__icon"><Icon name={item.icon} size={22} /></span><h3 className="card__title">{item.title}</h3><p className="fine">{item.body}</p><span className="way__go">{item.action} <Icon name="arrow-right" size={16} /></span></Link>)}</Reveal></section>;
}

function WhyAnAccount() {
  const { locale } = useLocale();
  return <section className="section page"><Reveal className="join-strip"><div className="stack stack--tight"><h2 className="display display--lg">{locale === "fr" ? "Vous revenez souvent ?" : "Eating with us often?"}</h2><p className="muted">{locale === "fr" ? "Un compte garde vos réservations, codes et reçus au même endroit. Vous pouvez aussi modifier ou annuler plus facilement." : "An account keeps your bookings, codes and receipts in one place, and makes it easier to change or cancel without calling."}</p></div><div className="row row--wrap"><LinkButton to="/join" tone="primary">{locale === "fr" ? "Créer un compte" : "Create an account"}</LinkButton><LinkButton to="/signin" tone="ghost">{locale === "fr" ? "J'ai déjà un compte" : "I already have one"}</LinkButton></div></Reveal></section>;
}

function WordOfMouth() {
  const { data } = useResource(() => api.site.highlights(), []);
  const review = data?.topReview; const { locale } = useLocale();
  if (!review) return null;
  return <section className="section page"><Reveal as="figure" className="quote"><Stars value={review.rating} size={18} showValue={false} /><blockquote className="quote__text">{review.text}</blockquote><figcaption className="quote__by">{review.author}<Link to="/reviews" className="quote__more">{locale === "fr" ? "Lire les avis" : "Read the rest"} <Icon name="arrow-right" size={15} /></Link></figcaption></Reveal></section>;
}

function FindUs() {
  const { address, hours, phone, phoneHref, whatsappHref } = useVenue(); const { locale, t } = useLocale();
  return <section className="section page"><Reveal className="section-head"><hr className="heat-rule" /><h2 className="display display--xl">{locale === "fr" ? "Où nous trouver" : "Where we are"}</h2></Reveal><Reveal className="find"><div className="find__row"><Icon name="pin" size={20} /><div><p>{address}</p><p className="fine faint">{locale === "fr" ? "Cherchez le grill au coin de la rue." : "Look for the grill on the corner."}</p></div></div><div className="find__row"><Icon name="clock" size={20} /><p>{hours}</p></div>{phone && phoneHref ? <div className="find__row"><Icon name="phone" size={20} /><a href={phoneHref}>{phoneLabel(phone)}</a></div> : null}{whatsappHref ? <div className="find__row"><Icon name="message" size={20} /><a href={whatsappHref} target="_blank" rel="noreferrer noopener">WhatsApp</a></div> : null}</Reveal><div className="row row--wrap" style={{ marginTop: "var(--s-5)" }}><LinkButton to="/find" tone="primary" icon="pin">{t("directions")}</LinkButton><LinkButton to="/story" tone="ghost">{t("story")}</LinkButton></div></section>;
}

export function Home() {
  const { user, ready } = useSession(); const { data } = useResource(() => api.site.highlights(), []); const { siteConfig } = useVenue();
  const images = (data?.topItems ?? []).flatMap((item) => (item.image_url ? [item.image_url] : []));
  const prices = (data?.topItems ?? []).map((item) => item.price_fcfa).filter((v): v is number => typeof v === "number" && v > 0);
  const lowestPrice = prices.length ? Math.min(...prices) : null; const signedIn = ready && user !== null;
  return <>{siteConfig.homepage.hero ? (signedIn ? <YourStuff name={user.name} /> : <Hero images={images} lowestPrice={lowestPrice} />) : null}{siteConfig.homepage.featured ? <Favourites /> : null}{siteConfig.homepage.ways ? <Ways /> : null}{siteConfig.homepage.accountCta && siteConfig.features.customerAccounts && !signedIn ? <WhyAnAccount /> : null}{siteConfig.homepage.reviews && siteConfig.features.reviews ? <WordOfMouth /> : null}{siteConfig.homepage.location ? <FindUs /> : null}</>;
}
