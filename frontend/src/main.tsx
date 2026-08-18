import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { BasketProvider } from "./state/basket";
import { SessionProvider } from "./state/session";
import { ToastProvider } from "./state/toast";
import { VenueProvider } from "./state/venue";
import { LocaleProvider } from "./state/locale";
import { NetworkStatus } from "./ui/NetworkStatus";

const developmentBasename =
  window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")
    ? "/admin"
    : "/";

import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/inter/wght.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/pages.css";
import "./styles/preview-overrides.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={developmentBasename}>
      <ToastProvider>
        <SessionProvider>
          <VenueProvider>
            <LocaleProvider>
              <BasketProvider>
                <NetworkStatus />
                <App />
              </BasketProvider>
            </LocaleProvider>
          </VenueProvider>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Unsupported, or blocked by the browser's storage settings. */
    });
  });
}
