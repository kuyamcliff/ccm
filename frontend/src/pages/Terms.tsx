import { LegalPageView } from "../components/LegalPageView";

/** Content is editable from the admin dashboard; see LegalPageView. */
export function Terms() {
  return <LegalPageView slug="terms" fallbackTitle="Terms of use" />;
}
