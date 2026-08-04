import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "~/ui/Icon";
import { Sheet } from "~/ui/Sheet";
import { Conversation } from "./Conversation";

/**
 * The floating way in to support.
 *
 * Hidden on the help page (where the same conversation is already the whole
 * page) and inside the staff console, which has its own desk. The chat itself
 * only connects once the sheet is opened, so an idle visitor never holds a
 * stream open.
 */
export function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const [past, setPast] = useState(false);
  const { pathname } = useLocation();

  /*
   * It stays out of the way of the first screen.
   *
   * A floating button over the hero is the single most template-looking thing
   * a restaurant site can do, and nobody has a question before they have seen
   * the place. It fades in once the visitor has scrolled, which is also when
   * they have started reading and might have one.
   */
  useEffect(() => {
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        setPast(window.scrollY > 400);
        queued = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  if (pathname.startsWith("/help") || pathname.startsWith("/desk")) return null;

  return (
    <>
      <button type="button" className="helper" data-shown={past} onClick={() => setOpen(true)}>
        <Icon name="message" size={18} />
        Message us
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Message us">
        <Conversation active={open} compact />
      </Sheet>
    </>
  );
}
