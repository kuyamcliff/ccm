import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";
import type { FeatureName } from "~/lib/siteConfig";
import { Icon } from "~/ui/Icon";

const labels: Record<FeatureName, { en: string; fr: string }> = {
  customerAccounts: { en: "Customer accounts", fr: "Comptes clients" },
  ordering: { en: "Takeaway", fr: "Commande à emporter" },
  booking: { en: "Table booking", fr: "Réservation de table" },
  waitlist: { en: "Waitlist", fr: "Liste d'attente" },
  reviews: { en: "Reviews", fr: "Avis" },
  gallery: { en: "Photos", fr: "Photos" },
  offers: { en: "Offers", fr: "Offres" },
  events: { en: "Events", fr: "Événements" },
  loyalty: { en: "Loyalty", fr: "Fidélité" },
  giftCards: { en: "Gift cards", fr: "Cartes cadeaux" },
  supportChat: { en: "Support chat", fr: "Chat d'assistance" },
};

export function ServiceUnavailable({ feature, children }: { feature: FeatureName; children?: ReactNode }) {
  const { locale, t } = useLocale();
  const label = labels[feature][locale];

  return (
    <div className="empty empty--service" role="status">
      <span className="empty__icon" aria-hidden="true">
        <Icon name="clock" size={28} />
      </span>
      <p className="empty__title">{label}</p>
      <p className="fine muted">{children ?? t("noFeature")}</p>
      <div className="row row--wrap empty__actions">
        <Link className="btn btn--ghost" to="/menu">{t("menu")}</Link>
        <Link className="btn btn--quiet" to="/help">{t("help")}</Link>
      </div>
    </div>
  );
}

export function FeatureGate({ feature, children, fallback }: { feature: FeatureName; children: ReactNode; fallback?: ReactNode }) {
  const { siteConfig } = useVenue();
  if (siteConfig.features[feature]) return <>{children}</>;
  return <>{fallback ?? <ServiceUnavailable feature={feature} />}</>;
}

export function ServiceGate({
  feature,
  children,
  fallback,
}: {
  feature: "ordering" | "booking" | "waitlist";
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { siteConfig } = useVenue();
  const enabled = siteConfig.features[feature];
  const service = siteConfig.services[feature];
  if (enabled && service.mode === "open") return <>{children}</>;
  return (
    <>
      {fallback ?? (
        <ServiceUnavailable feature={feature}>
          {service.message.en}
        </ServiceUnavailable>
      )}
    </>
  );
}
