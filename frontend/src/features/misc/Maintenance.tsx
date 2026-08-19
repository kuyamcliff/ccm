import { Icon } from "~/ui/Icon";
import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * What a customer sees while the owner is working on the site.
 *
 * Deliberately not an error page. Nothing has gone wrong, and a customer who
 * reads this as a fault stops coming back — so it says who is doing what and,
 * more usefully, gives them the phone number, because the restaurant is open
 * even when its website is not.
 *
 * Staff never reach this: the API lets them through and the app follows suit,
 * so the owner can keep working on the site they have closed.
 */
export function Maintenance() {
  const { siteConfig, phone, phoneHref, address } = useVenue();
  const { locale } = useLocale();
  const message = siteConfig.maintenance.message[locale] || siteConfig.maintenance.message.en;

  return (
    <main className="maintenance">
      <section className="maintenance__inner">
        <span className="maintenance__mark" aria-hidden="true">
          <Icon name="settings" size={30} />
        </span>
        <p className="label maintenance__eyebrow">
          {locale === "fr" ? "De retour bientôt" : "Back shortly"}
        </p>
        <h1 className="display display--xl maintenance__title">
          {locale === "fr" ? "Nous travaillons dessus." : "We're working on it."}
        </h1>
        <p className="lead">{message}</p>

        {/* The point of the page. The restaurant is open; only its website is
            not, and a customer who wanted a table should still get one. */}
        <div className="maintenance__reach">
          {phoneHref ? (
            <a href={phoneHref} className="btn btn--primary btn--lg">
              <Icon name="phone" size={18} />
              {locale === "fr" ? "Appelez-nous" : "Call us"}
              {phone ? <span className="mono">{phone}</span> : null}
            </a>
          ) : null}
        </div>
        {/* No link anywhere else: every other page is this page while the site
            is closed, and sending somebody in a circle is worse than a dead
            end. The address is here in full instead. */}
        <p className="maintenance__where">
          <Icon name="pin" size={16} />
          {address}
        </p>
      </section>
    </main>
  );
}
