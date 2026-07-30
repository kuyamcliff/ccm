import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { SiteSettings } from "./api";

/*
 * One fetch of the site settings, shared by everything that renders them.
 *
 * Before this, the footer, the WhatsApp button and the admin settings page each
 * called /api/site-settings on their own, so a single page load asked for the
 * same row three times and a change made in the admin only appeared in whichever
 * component happened to remount. Location, phone and the social links now come
 * from here, which means editing the address in the dashboard updates every
 * place it appears.
 */

/** Used until the network answers, and if it never does. */
const FALLBACK = {
  address: "562V+C7V, Clerks Quarters, Buea",
  city: "Buea",
  region: "South West Region, Cameroon",
  phone: "",
  whatsapp_phone: "+237677000000",
  hours: "Open daily · 9am till late",
} as const;

interface SettingsValue {
  settings: SiteSettings;
  /** Full street address, e.g. "562V+C7V, Clerks Quarters, Buea". */
  address: string;
  /** Just the town, used in headings and marketing copy. */
  city: string;
  region: string;
  hours: string;
  phone: string;
  tiktok: string;
  instagram: string;
  facebook: string;
  loaded: boolean;
  /** Builds a wa.me link with the number the admin configured. */
  whatsappHref: (message: string) => string;
  /** Re-reads settings after an admin save so the change shows immediately. */
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.siteSettings();
      setSettings(r.settings);
    } catch {
      /* Keep whatever we already have; the fallbacks below cover a cold start. */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<SettingsValue>(() => {
    const address = settings.address?.trim() || FALLBACK.address;
    // The town is the last part of the address, so editing the address in the
    // admin also moves every "in <town>" line on the site.
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    const city = settings.city?.trim() || parts[parts.length - 1] || FALLBACK.city;
    const phone = settings.phone?.trim() || "";

    return {
      settings,
      address,
      city,
      region: settings.region?.trim() || FALLBACK.region,
      hours: settings.hours?.trim() || FALLBACK.hours,
      phone,
      tiktok: settings.tiktok_url?.trim() || "",
      instagram: settings.ig_url?.trim() || "",
      facebook: settings.fb_url?.trim() || "",
      loaded,
      whatsappHref: (message: string) => {
        const digits = (phone || FALLBACK.whatsapp_phone).replace(/[\s\-+()]/g, "");
        return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
      },
      refresh,
    };
  }, [settings, loaded, refresh]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside a SettingsProvider");
  return ctx;
}
