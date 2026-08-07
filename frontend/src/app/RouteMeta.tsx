import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { metaForPath } from "./routeMeta";

/** Finds or creates a tag in the head, so this works over whatever
 *  `index.html` already declared instead of duplicating it. */
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

/**
 * Keeps the document's title, description and canonical in step with the route.
 *
 * Mounted once inside the router rather than called from each page, so a new
 * page cannot ship without one. See `routeMeta.ts` for why this is a table and
 * why the sharing card is not here.
 */
export function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaForPath(pathname);

    document.title = meta.title;

    if (meta.description) {
      setMeta("name", "description", meta.description);
      // og:title and og:description track the page; og:image does not, because
      // it is static in the HTML for crawlers that never run this code.
      setMeta("property", "og:title", meta.title);
      setMeta("property", "og:description", meta.description);
    }

    const canonical = upsert('link[rel="canonical"]', () => {
      const l = document.createElement("link");
      l.rel = "canonical";
      return l;
    }) as HTMLLinkElement;

    if (meta.canonical) {
      canonical.href = meta.canonical;
      setMeta("property", "og:url", meta.canonical);
    } else {
      /* A page with no canonical address of its own must not inherit the last
         one, which would have every account screen claiming to be the menu. */
      canonical.remove();
    }

    if (meta.noindex) setMeta("name", "robots", "noindex, nofollow");
    else removeMeta("name", "robots");
  }, [pathname]);

  return null;
}
