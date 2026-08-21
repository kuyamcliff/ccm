import type { ReactNode } from "react";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";
import type { FeatureName } from "~/lib/siteConfig";
import { EmptyState } from "./Feedback";
import { LinkButton } from "./Button";

/**
 * Parts of the site the owner has switched off.
 *
 * Two separate controls, and the difference matters to what the screen says.
 *
 *   FeatureGate  the feature is off, or outside its scheduled window. Bookings
 *                are not a thing this restaurant does at the moment.
 *   ServiceGate  the feature exists but is paused right now, or the place is
 *                closed. Bookings are a thing, just not this evening.
 *
 * The second one shows the owner's own wording, because "we are full tonight,
 * try tomorrow" is a different message from "we do not take bookings" and only
 * the owner knows which is true.
 *
 * These hide the screen. They do not protect anything: the API refuses a paused
 * service on its own with a 503 carrying `service_paused`, and that refusal is
 * the real one.
 */

const LABELS: Record<FeatureName, { en: string; fr: string }> = {
  customerAccounts: { en: "Accounts", fr: "Comptes" },
  ordering: { en: "Takeaway", fr: "À emporter" },
  booking: { en: "Table booking", fr: "Réservation" },
  waitlist: { en: "The queue", fr: "La file" },
  reviews: { en: "Reviews", fr: "Avis" },
  gallery: { en: "Photos", fr: "Photos" },
  offers: { en: "Offers", fr: "Offres" },
  events: { en: "Events", fr: "Événements" },
  loyalty: { en: "Points", fr: "Points" },
  giftCards: { en: "Gift cards", fr: "Cartes cadeaux" },
  supportChat: { en: "Chat", fr: "Chat" },
};

export function ServiceUnavailable({ feature, children }: { feature: FeatureName; children?: ReactNode }) {
  const { locale, c } = useCopy();
  const { siteConfig } = useVenue();
  const label = LABELS[feature][locale];

  return (
    <div className="page section">
      <EmptyState
        icon="clock"
        title={`${label}: ${c.gate.pausedTitle.toLowerCase()}`}
        body={typeof children === "string" && children.trim() ? children : c.gate.pausedBody}
        action={
          <>
            <LinkButton to="/menu" tone="ghost" size="sm">
              {c.nav.menu}
            </LinkButton>
            {siteConfig.support.enabled && siteConfig.features.supportChat ? (
              <LinkButton to="/help" tone="quiet" size="sm">
                {c.nav.help}
              </LinkButton>
            ) : null}
          </>
        }
      />
    </div>
  );
}

export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: FeatureName;
  children: ReactNode;
  fallback?: ReactNode;
}) {
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
  const { locale } = useCopy();

  const enabled = siteConfig.features[feature];
  const service = siteConfig.services[feature];
  const businessClosed = siteConfig.business.mode === "closed";

  if (enabled && service.mode === "open" && !businessClosed) return <>{children}</>;

  /* The owner's own words, whichever of the two switches is the one that is
     down. Falls back to our wording only if they have not typed any. */
  const reason = businessClosed ? siteConfig.business.message[locale] : service.message[locale];
  return <>{fallback ?? <ServiceUnavailable feature={feature}>{reason}</ServiceUnavailable>}</>;
}
