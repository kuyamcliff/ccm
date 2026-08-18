import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useVenue } from "~/state/venue";
import type { LocaleCode } from "~/lib/siteConfig";

const STORAGE_KEY = "ccm.locale";
const copy = {
  en: {
    home: "Home", menu: "Menu", takeaway: "Takeaway", book: "Book a table", story: "Our story", find: "Find us", reviews: "Reviews", gallery: "Photos", offers: "Offers", events: "Events", waitlist: "Join the queue", help: "Help", signIn: "Sign in", account: "You", mine: "My visits", admin: "Admin", call: "Call", basket: "Basket", seeMenu: "See the menu", orderNow: "Order now", openNow: "Open now", closed: "Closed", busy: "Busy right now", messageUs: "Message us", directions: "Directions", back: "Back", tryAgain: "Try again", noConnection: "No connection", backOnline: "Back online", paymentIssue: "Payment issue", bookingHelp: "Booking help", orderHelp: "Order help", locationHelp: "Where are you?", menuHelp: "What's on the menu?", supportOnline: "Someone is at the desk", supportOffline: "Nobody is at the desk right now", usuallyReplies: "Usually replies within", needHelp: "Need help?", noFeature: "This service is temporarily unavailable.", comeEat: "Come and eat", reachUs: "Reach us", terms: "Terms", privacy: "Privacy", freshFooter: "Fresh chicken, goat and pork off the fire every day.", closedMenu: "See the menu",
  },
  fr: {
    home: "Accueil", menu: "Menu", takeaway: "À emporter", book: "Réserver une table", story: "Notre histoire", find: "Nous trouver", reviews: "Avis", gallery: "Photos", offers: "Offres", events: "Événements", waitlist: "Rejoindre la file", help: "Aide", signIn: "Se connecter", account: "Vous", mine: "Mes visites", admin: "Admin", call: "Appeler", basket: "Panier", seeMenu: "Voir le menu", orderNow: "Commander", openNow: "Ouvert maintenant", closed: "Fermé", busy: "Très demandé en ce moment", messageUs: "Nous écrire", directions: "Itinéraire", back: "Retour", tryAgain: "Réessayer", noConnection: "Pas de connexion", backOnline: "Connexion rétablie", paymentIssue: "Problème de paiement", bookingHelp: "Aide pour la réservation", orderHelp: "Aide pour la commande", locationHelp: "Où êtes-vous ?", menuHelp: "Qu'y a-t-il au menu ?", supportOnline: "Quelqu'un est disponible", supportOffline: "Personne n'est disponible pour le moment", usuallyReplies: "Réponse habituelle sous", needHelp: "Besoin d'aide ?", noFeature: "Ce service est temporairement indisponible.", comeEat: "Venez manger", reachUs: "Nous contacter", terms: "Conditions", privacy: "Confidentialité", freshFooter: "Poulet, porc et chèvre grillés au feu chaque jour.", closedMenu: "Voir le menu",
  },
} as const;

type CopyKey = keyof typeof copy.en;
interface LocaleValue { locale: LocaleCode; setLocale: (locale: LocaleCode) => void; t: (key: CopyKey) => string; }
const LocaleContext = createContext<LocaleValue | null>(null);
function readStored(): LocaleCode | null { try { const value = localStorage.getItem(STORAGE_KEY); return value === "fr" || value === "en" ? value : null; } catch { return null; } }

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { siteConfig } = useVenue();
  const [locale, setLocaleState] = useState<LocaleCode>(() => { const stored = readStored(); if (stored && siteConfig.locales[stored]) return stored; return siteConfig.defaultLocale; });
  useEffect(() => { if (!siteConfig.locales[locale]) setLocaleState(siteConfig.defaultLocale); }, [locale, siteConfig.defaultLocale, siteConfig.locales]);
  useEffect(() => { document.documentElement.lang = locale === "fr" ? "fr" : "en"; document.documentElement.dir = "ltr"; }, [locale]);
  const setLocale = (next: LocaleCode) => { if (!siteConfig.locales[next]) return; setLocaleState(next); try { localStorage.setItem(STORAGE_KEY, next); } catch {} };
  const value = useMemo<LocaleValue>(() => ({ locale, setLocale, t: (key) => copy[locale][key] ?? copy.en[key] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale(): LocaleValue { const value = useContext(LocaleContext); if (!value) throw new Error("useLocale must be used inside LocaleProvider"); return value; }
