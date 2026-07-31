import { LegalPageView } from "../components/LegalPageView";
import { useT } from "../i18n/context";

/** Content is editable from the admin dashboard; see LegalPageView. */
export function PrivacyPolicy() {
  const t = useT("legal");
  return <LegalPageView slug="privacy" fallbackTitle={t("privacyTitle")} />;
}
