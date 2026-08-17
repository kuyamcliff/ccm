import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { metaForPath } from "./routeMeta";

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  const found = document.head.querySelector<HTMLElement>(selector);
  if (found) return found;
  const made = create();
  document.head.appendChild(made);
  return made;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  const el = upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute(attr, key);
    return m;
  });
  el.setAttribute("content", content);
}

function removeMeta(attr: "name" | "property", key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

export function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const isDevelopmentSite = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
    const meta = metaForPath(pathname);

    document.title = isDevelopmentSite ? `${meta.title} · Development` : meta.title;

    if (meta.description) {
      setMeta("name", "description", meta.description);
      setMeta("property", "og:title", meta.title);
      setMeta("property", "og:description", meta.description);
    }

    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (isDevelopmentSite || !meta.canonical) {
      canonical?.remove();
    } else {
      const link = canonical ?? (upsert('link[rel="canonical"]', () => { const l = document.createElement("link"); l.rel = "canonical"; return l; }) as HTMLLinkElement);
      link.href = meta.canonical;
      setMeta("property", "og:url", meta.canonical);
    }

    if (isDevelopmentSite || meta.noindex) setMeta("name", "robots", "noindex, nofollow");
    else removeMeta("name", "robots");
  }, [pathname]);

  return null;
}
