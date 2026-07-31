import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { BasketProvider } from "./state/basket";
import { SessionProvider } from "./state/session";
import { ToastProvider } from "./state/toast";
import { VenueProvider } from "./state/venue";

/*
 * Fonts are bundled rather than fetched from a font CDN. On a Buea mobile
 * connection a third-party lookup costs a DNS resolution, a TLS handshake and a
 * round trip before a single glyph arrives, and it hands a third party a log
 * entry for every visitor. Served from our own origin they are just two more
 * files in the same connection the page is already using.
 */
import "@fontsource/anton/latin-400.css";
import "@fontsource-variable/karla/index.css";
import "@fontsource/dm-mono/latin-400.css";
import "@fontsource/dm-mono/latin-500.css";

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
