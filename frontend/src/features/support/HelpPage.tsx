import { Icon } from "~/ui/Icon";
import { LinkButton, AnchorButton } from "~/ui/Button";
import { phoneLabel } from "~/lib/format";
import { Conversation } from "./Conversation";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * Help.
 *
 * The chat is the main thing on the page, but it is not the only way through:
 * somebody with a problem at eight on a Friday should not have to wait for a
 * reply if they could just ring. So the phone number and WhatsApp are above the
 * chat, not buried under it.
 */
export function HelpPage() {
  const { c } = useCopy();
  const { phone, phoneHref, whatsappHref, siteConfig } = useVenue();

  return (
    <div className="page section stack help">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.help.title}</h1>
        <p className="lead">{c.help.lead}</p>
      </header>

      <div className="bar bar--wrap bar--tight">
        {siteConfig.support.phone && phone && phoneHref ? (
          <AnchorButton href={phoneHref} tone="ghost" size="sm" icon="phone">
            {phoneLabel(phone)}
          </AnchorButton>
        ) : null}
        {siteConfig.support.whatsapp && whatsappHref ? (
          <AnchorButton href={whatsappHref} tone="ghost" size="sm" icon="message" newTab>
            WhatsApp
          </AnchorButton>
        ) : null}
        <LinkButton to="/find" tone="quiet" size="sm" icon="pin">
          {c.find.title}
        </LinkButton>
      </div>

      {siteConfig.support.enabled ? (
        <Conversation active />
      ) : (
        <div className="rows">
          <div className="row">
            <Icon name="clock" size={17} className="row__lead" />
            <span className="grow fine">{c.help.offline}</span>
          </div>
        </div>
      )}
    </div>
  );
}
