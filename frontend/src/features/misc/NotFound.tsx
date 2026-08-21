import { LinkButton } from "~/ui/Button";
import { useCopy } from "~/state/locale";

/**
 * A page that is not here.
 *
 * Named routes that used to exist are redirected in `app/App.tsx` rather than
 * landing here, because somebody following a two-year-old WhatsApp link to
 * `/reserve` should get the booking page, not an apology.
 */
export function NotFound() {
  const { c } = useCopy();

  return (
    <div className="page section stack center gate">
      <p className="label hot">404</p>
      <h1 className="display display--xl">{c.gate.notFoundTitle}</h1>
      <p className="lead">{c.gate.notFoundBody}</p>
      <div className="bar bar--tight gate__actions">
        <LinkButton to="/" tone="primary" size="sm">
          {c.gate.goHome}
        </LinkButton>
        <LinkButton to="/menu" tone="ghost" size="sm">
          {c.nav.menu}
        </LinkButton>
      </div>
    </div>
  );
}
