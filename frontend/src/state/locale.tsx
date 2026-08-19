import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useVenue } from "~/state/venue";
import type { LocaleCode } from "~/lib/siteConfig";
import { COPY, type CopyKey } from "./copy";

const STORAGE_KEY = "ccm.locale";


interface LocaleValue { locale: LocaleCode; setLocale: (locale: LocaleCode) => void; t: (key: CopyKey) => string; }
const LocaleContext = createContext<LocaleValue | null>(null);
function readStored(): LocaleCode | null { try { const value = localStorage.getItem(STORAGE_KEY); return value === "fr" || value === "en" ? value : null; } catch { return null; } }
function readUrlLocale(): LocaleCode | null { try { const value = new URLSearchParams(window.location.search).get("lang"); return value === "fr" || value === "en" ? value : null; } catch { return null; } }

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { siteConfig } = useVenue();
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    const explicit = readUrlLocale();
    if (explicit && siteConfig.locales[explicit]) return explicit;
    const stored = readStored();
    if (stored && siteConfig.locales[stored]) return stored;
    return siteConfig.defaultLocale;
  });
  useEffect(() => { const explicit = readUrlLocale(); if (explicit && siteConfig.locales[explicit] && explicit !== locale) setLocaleState(explicit); else if (!siteConfig.locales[locale]) setLocaleState(siteConfig.defaultLocale); }, [locale, siteConfig.defaultLocale, siteConfig.locales]);
  useEffect(() => { document.documentElement.lang = locale === "fr" ? "fr" : "en"; document.documentElement.dir = "ltr"; }, [locale]);
  const setLocale = (next: LocaleCode) => { if (!siteConfig.locales[next]) return; setLocaleState(next); try { localStorage.setItem(STORAGE_KEY, next); } catch {} };
  const value = useMemo<LocaleValue>(() => ({ locale, setLocale, t: (key) => COPY[locale][key] ?? COPY.en[key] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale(): LocaleValue { const value = useContext(LocaleContext); if (!value) throw new Error("useLocale must be used inside LocaleProvider"); return value; }
