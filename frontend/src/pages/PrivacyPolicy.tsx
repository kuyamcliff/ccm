import { LegalPageView } from "../components/LegalPageView";

/** Content is editable from the admin dashboard; see LegalPageView. */
export function PrivacyPolicy() {
  return <LegalPageView slug="privacy" fallbackTitle="Privacy policy" />;
}
