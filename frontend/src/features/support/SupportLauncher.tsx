import { useState } from "react";
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
  const { pathname } = useLocation();

  if (pathname.startsWith("/help") || pathname.startsWith("/desk")) return null;

  return (
    <>
      <button type="button" className="helper" onClick={() => setOpen(true)}>
        <Icon name="message" size={18} />
        Message us
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Message us">
        <Conversation active={open} compact />
      </Sheet>
    </>
  );
}
