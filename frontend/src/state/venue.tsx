import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api, DEFAULT_DEPOSIT_FCFA, DEFAULT_LATE_CANCEL_FCFA } from "~/lib/api";
import type { SiteSettings } from "~/lib/api";
import { parseSiteConfig, type SiteConfig } from "~/lib/siteConfig";
import { useResource } from "~/lib/useResource";

const FALLBACK: Required<Pick<SiteSettings, "address" | "city" | "region" | "hours">> = {
  address: "Razel Street, opposite P and T school",
  city: "Buea",
  region: "South-West",
  hours: "Every day, midday until late",
};

function joinAddress(street: string, city: string): string {
  if (!city) return street;
  return street.toLowerCase().includes(city.toLowerCase()) ? street : `${street}, ${city}`;
}

interface VenueValue {
  settings: SiteSettings;
  siteConfig: SiteConfig;
  phone: string | null;
  phoneHref: string | null;
  whatsappHref: string | null;
  address: string;
  hours: string;
  socials: { label: string; url: string }[];
  depositFcfa: number;
  lateCancelFcfa: number;
  loading: boolean;
  refresh: () => void;
}

function readMoney(raw: string | undefined, fallback: number): number {
  const parsed = Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

const VenueContext = createContext<VenueValue | null>(null);

export function VenueProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload } = useResource(() => api.site.settings(), []);
  const value = useMemo<VenueValue>(() => {
    const settings = data ?? {};
    const rawConfig = settings.site_config_json;
    const siteConfig = parseSiteConfig(rawConfig);
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
      siteConfig,
      phone,
      phoneHref: international ? `tel:+${international}` : null,
      whatsappHref: siteConfig.support.whatsapp && international ? `https://wa.me/${international}` : null,
      address: joinAddress(settings.address?.trim() || FALLBACK.address, settings.city?.trim() || FALLBACK.city),
      hours: settings.hours?.trim() || FALLBACK.hours,
      socials,
      depositFcfa: readMoney(settings.booking_deposit_fcfa, DEFAULT_DEPOSIT_FCFA),
      lateCancelFcfa: readMoney(settings.late_cancel_fee_fcfa, DEFAULT_LATE_CANCEL_FCFA),
      loading,
      refresh: reload,
    };
  }, [data, loading, reload]);
  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>;
}

export function useVenue(): VenueValue {
  const value = useContext(VenueContext);
  if (!value) throw new Error("useVenue must be used inside VenueProvider");
  return value;
}
