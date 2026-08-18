import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";
import type { FeatureName } from "~/lib/siteConfig";
import { Icon } from "~/ui/Icon";

const labels: Record<FeatureName, { en: string; fr: string }> = {
  customerAccounts: { en: "Customer accounts", fr: "Comptes clients" }, ordering: { en: "Takeaway", fr: "Commande à emporter" }, booking: { en: "Table booking", fr: "Réservation de table" }, waitlist: { en: "Waitlist", fr: "Liste d'attente" }, reviews: { en: "Reviews", fr: "Avis" }, gallery: { en: "Photos", fr: "Photos" }, offers: { en: "Offers", fr: "Offres" }, events: { en: "Events", fr: "Événements" }, loyalty: { en: "Loyalty", fr: "Fidélité" }, giftCards: { en: "Gift cards", fr: "Cartes cadeaux" }, supportChat: { en: "Support chat", fr: "Chat d'assistance" },
};

export function ServiceUnavailable({ feature, children }: { feature: FeatureName; children?: ReactNode }) {
  const { locale, t } = useLocale();
  const { siteConfig } = useVenue();
  const label = labels[feature][locale];
  const reason = children ?? t("noFeature");
  return <div className="empty empty--service" role="status" aria-live="polite"><span className="empty__icon" aria-hidden="true"><Icon name="clock" size={28} /></span><p className="empty__title">{label}</p><p className="fine muted">{reason}</p><div className="row row--wrap empty__actions"><Link className="btn btn--ghost" to="/menu">{t("menu")}</Link>{siteConfig.support.enabled && siteConfig.features.supportChat ? <Link className="btn btn--quiet" to="/help">{t("help")}</Link> : null}</div></div>;
}

export function FeatureGate({ feature, children, fallback }: { feature: FeatureName; children: ReactNode; fallback?: ReactNode }) {
  const { siteConfig } = useVenue();
  return <>{siteConfig.features[feature] ? children : fallback ?? <ServiceUnavailable feature={feature} />}</>;
}

export function ServiceGate({ feature, children, fallback }: { feature: "ordering" | "booking" | "waitlist"; children: ReactNode; fallback?: ReactNode }) {
  const { siteConfig } = useVenue();
  const { locale } = useLocale();
  const enabled = siteConfig.features[feature];
  const service = siteConfig.services[feature];
  const businessClosed = siteConfig.business.mode === "closed";
  const serviceOpen = enabled && service.mode === "open" && !businessClosed;
  if (serviceOpen) return <>{children}</>;
  const reason = businessClosed ? siteConfig.business.message[locale] : service.message[locale];
  return <>{fallback ?? <ServiceUnavailable feature={feature}>{reason}</ServiceUnavailable>}</>;
}
