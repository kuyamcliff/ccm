import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";
import { Icon } from "~/ui/Icon";

/**
 * One button that flips the language.
 *
 * The old two-part EN / FR control spent a lot of a phone's top bar to show a
 * choice that only ever has one other option. This is a single tap: it shows
 * the language you are reading in, and pressing it switches to the other one.
 * The label reads out the change so a screen reader announces "switch to
 * French", not just "EN".
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const { siteConfig } = useVenue();

  // Nothing to switch to if the owner only offers one language.
  if (!siteConfig.locales.fr || !siteConfig.locales.en) return null;

  const next = locale === "en" ? "fr" : "en";

  return (
    <button
      type="button"
      className="lang-toggle btn btn--quiet btn--icon"
      onClick={() => setLocale(next)}
      aria-label={next === "fr" ? "Passer en français" : "Switch to English"}
      title={next === "fr" ? "Français" : "English"}
    >
      <Icon name="globe" size={18} />
      <span className="lang-toggle__code" aria-hidden="true">{locale.toUpperCase()}</span>
    </button>
  );
}
