import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { BasketProvider } from "./state/basket";
import { SessionProvider } from "./state/session";
import { ToastProvider } from "./state/toast";
import { VenueProvider } from "./state/venue";

/*
 * Two families, both bundled rather than fetched from a font CDN.
 *
 * On a Buea mobile connection a third-party lookup costs a DNS resolution, a
 * TLS handshake and a round trip before a single glyph arrives, and it hands a
 * stranger a log entry for every visitor. Served from our own origin they are
 * two more files on the connection the page is already using.
 *
 * Both are variable, so every weight the interface uses comes out of one file
 * each, and each ships as a set of subsets keyed by unicode range: a phone
 * here downloads the Latin one and nothing else.
 */
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/inter/wght.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/pages.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <VenueProvider>
            <BasketProvider>
              <App />
            </BasketProvider>
          </VenueProvider>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);

/*
 * The service worker is registered after load so it never competes with the
 * first paint for bandwidth. It also replaces the worker the previous version
 * of this site installed — see public/sw.js.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Unsupported, or blocked by the browser's storage settings. The site
         works without it; only offline support is lost. */
    });
  });
}
