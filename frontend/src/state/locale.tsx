import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { COPY, fill, type Copy, type Locale } from "~/copy";

/**
 * Which language the site is in.
 *
 * Buea is Anglophone and English is the default, but Cameroon is not, and a
 * francophone customer landing here from a shared link should not have to
 * translate a menu in their head. So the choice is offered, remembered, and
 * guessed once from the browser if it has never been made.
 *
 * The copy itself is reached as an object rather than through a lookup
 * function:
 *
 *     const { c } = useCopy();
 *     <h1>{c.home.heroLead}</h1>
 *
 * which the editor completes and the compiler checks. The previous version used
 * `t("someKey")` plus a few hundred inline `locale === "fr" ? ... : ...`
 * ternaries buried in JSX, and a typo in a key was a silent empty string.
 */

const STORAGE_KEY = "ccm.locale";

interface LocaleValue {
  locale: Locale;
  /** The whole copy tree for the active language. */
  c: Copy;
  setLocale: (locale: Locale) => void;
  /** Fills `{name}` placeholders. Re-exported here so a screen needs one import. */
  fill: typeof fill;
}

const LocaleContext = createContext<LocaleValue | null>(null);

function firstGuess(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "fr") return stored;
  } catch {
    /* Storage refused. Fall through to the browser's own preference. */
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr")) return "fr";
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(firstGuess);

  /* Kept on the document as well, because it is what a screen reader uses to
     choose a voice and what the browser uses to pick hyphenation rules. Getting
     this wrong makes French read aloud in an English accent. */
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The choice holds for this visit; it just will not survive a reload. */
    }
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({ locale, c: COPY[locale], setLocale, fill }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useCopy(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useCopy must be used inside LocaleProvider");
  return value;
}
