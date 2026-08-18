import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const { siteConfig } = useVenue();
  const frenchEnabled = siteConfig.locales.fr;

  if (!frenchEnabled) return null;

  return (
    <div className="language-switcher" role="group" aria-label="Language">
      <button
        type="button"
        className={locale === "en" ? "language-switcher__active" : ""}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        className={locale === "fr" ? "language-switcher__active" : ""}
        aria-pressed={locale === "fr"}
        onClick={() => setLocale("fr")}
      >
        FR
      </button>
    </div>
  );
}
