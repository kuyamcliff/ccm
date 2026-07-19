import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <section className="section">
      <div className="section-inner narrow center">
        <h1 className="page-title">Nothing on this plate.</h1>
        <p>The page you asked for is not here. The meat, however, is.</p>
        <p className="section-cta">
          <Link to="/" className="btn btn-red">
            Back to the fire
          </Link>
        </p>
      </div>
    </section>
  );
}
