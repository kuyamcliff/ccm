import { AnchorButton } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { phoneLabel } from "~/lib/format";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * The site, closed by the owner.
 *
 * Shows the owner's own wording when they have typed any, and ours when they
 * have not. The phone number is the point of this screen: somebody who cannot
 * book online should still be able to ring the door and be told what is
 * happening.
 *
 * Deliberately without the shell. There is no navigation to offer.
 */
export function Maintenance() {
  const { c, locale } = useCopy();
  const { siteConfig, phone, phoneHref, address, hours } = useVenue();

  const owners = siteConfig.maintenance.message?.[locale]?.trim();

  return (
    <main className="page gate gate--full stack center">
      <img src="/mark.svg" alt="" width={40} height={40} className="gate__mark" />
      <h1 className="display display--xl">{c.gate.maintenanceTitle}</h1>
      <p className="lead">{owners || c.gate.maintenanceBody}</p>

      <div className="rows gate__facts">
        <div className="row">
          <Icon name="pin" size={17} className="row__lead" />
          <span className="grow fine">{address}</span>
        </div>
        <div className="row">
          <Icon name="clock" size={17} className="row__lead" />
          <span className="grow fine">{hours}</span>
        </div>
      </div>

      {phone && phoneHref ? (
        <AnchorButton href={phoneHref} tone="primary" size="sm" icon="phone">
          {phoneLabel(phone)}
        </AnchorButton>
      ) : null}
    </main>
  );
}
