import { LegalPageView } from "../components/LegalPageView";
import { useT } from "../i18n/context";

/** Content is editable from the admin dashboard; see LegalPageView. */
export function Terms() {
  const t = useT("legal");
  return <LegalPageView slug="terms" fallbackTitle={t("termsTitle")} />;
}
