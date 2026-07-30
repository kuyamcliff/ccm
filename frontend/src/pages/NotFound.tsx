import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="notfound-wrap">
      <div className="notfound-inner">
        <p className="notfound-code" aria-hidden="true">404</p>
        <h1 className="notfound-title">Nothing on this plate.</h1>
        <p className="notfound-body">
          The page you asked for doesn't exist. The charcoal, however, is very much lit.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/" className="btn btn-amber btn-big">Back to the fire</Link>
          <Link to="/menu" className="btn btn-outline btn-big">See the menu</Link>
        </div>
      </div>
    </div>
  );
}
