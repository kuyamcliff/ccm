import { useLanguage } from "../i18n/context";

export function Stars({ value }: { value: number }) {
  const { t } = useLanguage();
  const label = t("common", "starsAriaLabel").replace("{value}", String(value));
  return (
    <span className="stars" role="img" aria-label={label}>
      {"★".repeat(value)}
      <span className="stars-empty">{"★".repeat(5 - value)}</span>
    </span>
  );
}
