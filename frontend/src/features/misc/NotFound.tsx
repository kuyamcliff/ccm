import { LinkButton } from "~/ui/Button";

export function NotFound() {
  return (
    <div className="page section stack" style={{ maxWidth: "32rem" }}>
      <p className="label">404</p>
      <h1 className="display display--xl">Nothing here</h1>
      <p className="lead">
        That page has moved or never existed. The menu and the booking form are where they have always been.
      </p>
      <div className="row row--wrap">
        <LinkButton to="/menu" tone="primary">
          See the menu
        </LinkButton>
        <LinkButton to="/book" tone="ghost">
          Book a table
        </LinkButton>
      </div>
    </div>
  );
}
