import { Link } from "react-router-dom";
import { useT } from "../i18n/context";

export function NotFound() {
  const t = useT("notFound");
  return (
    <div className="notfound-wrap">
      <div className="notfound-inner">
        <p className="notfound-code" aria-hidden="true">404</p>
        <h1 className="notfound-title">{t("title")}</h1>
        <p className="notfound-body">
          {t("body")}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/" className="btn btn-amber btn-big">{t("backToFire")}</Link>
          <Link to="/menu" className="btn btn-outline btn-big">{t("seeMenu")}</Link>
        </div>
      </div>
    </div>
  );
}
