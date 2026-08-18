import { useSession } from "~/state/session";
import { Notice } from "~/ui/Feedback";
import { DeskPage } from "./parts";
import { SiteControl } from "./SiteControl";

export function OwnerSiteControl() {
  const { isTopOwner } = useSession();
  if (isTopOwner) return <SiteControl />;
  return <DeskPage title="Site control" lead="Customer-facing controls are reserved for the owner."><Notice tone="warn" title="Owner access required">This page can pause services, hide customer features and change what the website shows. Ask the owner for access.</Notice></DeskPage>;
}
