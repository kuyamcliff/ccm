import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";
import { Icon } from "~/ui/Icon";
import { usePress } from "./press";

/**
 * One button that flips the language.
 *
 * A two-part EN / FR control spends a lot of a phone's top bar showing a choice
 * that only ever has one other option. This shows the language you are reading
 * in, and pressing it switches to the other one.
 *
 * The accessible name describes the change rather than the state, so a screen
 * reader announces "switch to French" instead of "EN", which on its own tells
 * somebody nothing about what the button would do.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useCopy();
  const { siteConfig } = useVenue();
  const press = usePress();

  /* Nothing to switch to if the owner only offers one language. */
  if (!siteConfig.locales.fr || !siteConfig.locales.en) return null;

  const next = locale === "en" ? "fr" : "en";

  return (
    <button
      type="button"
      className="btn btn--quiet btn--sm lang"
      onClick={() => setLocale(next)}
      aria-label={next === "fr" ? "Passer en francais" : "Switch to English"}
      title={next === "fr" ? "Francais" : "English"}
      {...press.pressProps}
    >
      <Icon name="globe" size={16} />
      <span aria-hidden="true">{locale.toUpperCase()}</span>
    </button>
  );
}
