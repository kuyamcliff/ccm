import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "~/ui/Icon";
import { IconButton } from "~/ui/Button";
import { usePress } from "~/ui/press";
import { Conversation } from "./Conversation";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * The floating button that opens the chat over whatever you are doing.
 *
 * Hidden on the pages where it would be in the way or redundant: the Help page
 * already is the chat, and on the booking, ordering and payment screens the last
 * thing anybody needs is a second thing to press near the button they are
 * actually reaching for.
 *
 * It sits above the tab bar rather than over it, and it collapses to an icon on
 * a phone. The panel is anchored bottom-right on a desk and full width on a
 * phone, because a 320px chat window floating in the corner of a 360px screen is
 * a chat window nobody can type in.
 */
const HIDDEN_ON = ["/help", "/book", "/order", "/signin", "/join", "/reset"];

export function SupportLauncher() {
  const { c } = useCopy();
  const { siteConfig } = useVenue();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const press = usePress();

  if (!siteConfig.features.supportChat || !siteConfig.support.enabled) return null;
  if (HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  return (
    <>
      <button
        type="button"
        className="launcher"
        data-open={open ? "true" : undefined}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? c.common.close : c.help.title}
        {...press.pressProps}
      >
        <Icon name={open ? "close" : "message"} size={20} />
        <span className="launcher__label">{c.help.title}</span>
      </button>

      {open ? (
        <div className="launcher__panel" role="dialog" aria-label={c.help.title}>
          <div className="launcher__head">
            <span className="head">{c.help.title}</span>
            <IconButton name="close" label={c.common.close} size="sm" className="push" onClick={() => setOpen(false)} />
          </div>
          <Conversation active compact />
        </div>
      ) : null}
    </>
  );
}
