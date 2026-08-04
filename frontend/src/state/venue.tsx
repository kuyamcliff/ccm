import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { api, DEFAULT_DEPOSIT_FCFA, DEFAULT_LATE_CANCEL_FCFA } from "~/lib/api";
import type { SiteSettings } from "~/lib/api";
import { useResource } from "~/lib/useResource";

/**
 * The restaurant's own details — phone, address, hours, socials.
 *
 * They live in the database and are edited from the staff console, so nothing
 * in the interface hard-codes a phone number. Until they load, or if the call
 * fails, the fallbacks below are what shows: an empty footer would look broken,
 * and these are facts about the place that do not change.
 */

const FALLBACK: Required<Pick<SiteSettings, "address" | "city" | "region" | "hours">> = {
  address: "Razel Street, opposite P and T school",
  city: "Buea",
  region: "South-West",
  hours: "Every day, midday until late",
};

/** Owners usually type the town into the street line already; appending it
    again is how you end up with "Razel Street, Buea, Buea". */
function joinAddress(street: string, city: string): string {
  if (!city) return street;
  return street.toLowerCase().includes(city.toLowerCase()) ? street : `${street}, ${city}`;
}

interface VenueValue {
  settings: SiteSettings;
  phone: string | null;
  /** Ready to drop into an href — digits only, with the country code. */
  phoneHref: string | null;
  whatsappHref: string | null;
  address: string;
  hours: string;
  socials: { label: string; url: string }[];
  /** What a table costs to hold, as the owner has it set. */
  depositFcfa: number;
  /** Charged for cancelling inside the hour, once a deposit has been paid. */
  lateCancelFcfa: number;
  loading: boolean;
}

/**
 * Settings arrive as strings, and one typed by hand may be "2,500" or empty.
 * Anything that is not a usable amount falls back to the figure the server
 * uses for the same key, so the two never quote different prices.
 */
function readMoney(raw: string | undefined, fallback: number): number {
  const parsed = Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

const VenueContext = createContext<VenueValue | null>(null);

export function VenueProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useResource(() => api.site.settings(), []);

  const value = useMemo<VenueValue>(() => {
    const settings = data ?? {};
    const phone = settings.phone?.trim() || null;
    const digits = phone ? phone.replace(/\D/g, "") : "";
    const international = digits.length === 9 ? `237${digits}` : digits;

    const socials = [
      { label: "TikTok", url: settings.tiktok_url },
      { label: "Instagram", url: settings.ig_url },
      { label: "Facebook", url: settings.fb_url },
    ].flatMap((entry) => (entry.url?.trim() ? [{ label: entry.label, url: entry.url.trim() }] : []));

    return {
      settings,
      phone,
      phoneHref: international ? `tel:+${international}` : null,
      whatsappHref: international ? `https://wa.me/${international}` : null,
      address: joinAddress(settings.address?.trim() || FALLBACK.address, settings.city?.trim() || FALLBACK.city),
      hours: settings.hours?.trim() || FALLBACK.hours,
      socials,
      depositFcfa: readMoney(settings.booking_deposit_fcfa, DEFAULT_DEPOSIT_FCFA),
      lateCancelFcfa: readMoney(settings.late_cancel_fee_fcfa, DEFAULT_LATE_CANCEL_FCFA),
      loading,
    };
  }, [data, loading]);

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>;
}

export function useVenue(): VenueValue {
  const value = useContext(VenueContext);
  if (!value) throw new Error("useVenue must be used inside VenueProvider");
  return value;
}
