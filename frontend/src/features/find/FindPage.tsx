import { Icon } from "~/ui/Icon";
import { AnchorButton, LinkButton } from "~/ui/Button";
import { phoneLabel } from "~/lib/format";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * Where the place is and how to reach it.
 *
 * Every fact here comes from Desk > Details. Nothing about this restaurant is
 * hardcoded, on purpose: a wrong phone number is one nobody can reach, and the
 * owner should be able to fix it without a deploy.
 *
 * No embedded map. An iframe from Google is a third-party script, a cookie
 * banner's worth of tracking, and several hundred kilobytes on a connection that
 * cannot spare them, to show a picture of a road. The Directions button opens
 * the map app the phone already has, which is what somebody standing on Molyko
 * Street actually wants.
 */
export function FindPage() {
  const { c } = useCopy();
  const { address, hours, phone, phoneHref, whatsappHref, socials, siteConfig } = useVenue();

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className="page section stack">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.find.title}</h1>
        <p className="lead">{address}</p>
      </header>

      <div className="rows">
        <div className="row row--top row--tall">
          <Icon name="pin" size={18} className="row__lead" />
          <div className="grow stack stack--tight">
            <span className="label">{c.find.address}</span>
            <span>{address}</span>
            <span className="fine faint">{c.home.findHint}</span>
          </div>
        </div>

        <div className="row row--top row--tall">
          <Icon name="clock" size={18} className="row__lead" />
          <div className="grow stack stack--tight">
            <span className="label">{c.find.hours}</span>
            <span>{hours}</span>
          </div>
        </div>

        {siteConfig.support.phone && phone && phoneHref ? (
          <a href={phoneHref} className="row row--tall">
            <Icon name="phone" size={18} className="row__lead" />
            <div className="grow stack stack--tight">
              <span className="label">{c.find.phone}</span>
              <span>{phoneLabel(phone)}</span>
            </div>
            <Icon name="chevron-right" size={16} className="faint" />
          </a>
        ) : null}

        {siteConfig.support.whatsapp && whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noreferrer noopener" className="row row--tall">
            <Icon name="message" size={18} className="row__lead" />
            <div className="grow stack stack--tight">
              <span className="label">{c.find.whatsapp}</span>
              <span>Message us</span>
            </div>
            <Icon name="external" size={16} className="faint" />
          </a>
        ) : null}

        {socials.map((social) => (
          <a
            key={social.label}
            href={social.url}
            target="_blank"
            rel="noreferrer noopener"
            className="row row--tall"
          >
            <Icon name="sparkle" size={18} className="row__lead" />
            <span className="grow">{social.label}</span>
            <Icon name="external" size={16} className="faint" />
          </a>
        ))}
      </div>

      <div className="bar bar--wrap">
        <AnchorButton href={mapsHref} tone="primary" size="sm" icon="pin" newTab>
          {c.find.directions}
        </AnchorButton>
        {siteConfig.features.booking ? (
          <LinkButton to="/book" tone="ghost" size="sm" icon="calendar">
            {c.home.holdTable}
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}
