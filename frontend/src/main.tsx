import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { BasketProvider } from "./state/basket";
import { LocaleProvider } from "./state/locale";
import { SessionProvider } from "./state/session";
import { ToastProvider } from "./state/toast";
import { VenueProvider } from "./state/venue";
import { preloadHero, readBoot, BOOT_KEYS } from "./lib/boot";
import { seed } from "./lib/store";

/*
 * ── Before anything else ───────────────────────────────────────────────────
 *
 * The cached payload from the last visit, and the hero photograph it names.
 *
 * This runs before React is imported into memory, let alone rendered, which is
 * the entire point: `preloadHero` puts a high-priority preload link in the head
 * so the browser starts pulling the photograph while it is still parsing the
 * rest of this bundle. Under the old arrangement the URL of that photograph was
 * not known until three round trips had finished.
 */
const booted = readBoot();
preloadHero(booted);

if (booted) {
  /* The query cache is warmed with what the boot payload already answers, so the
     home page and the venue provider find their data present on the first render
     instead of each opening a request for it. */
  seed(BOOT_KEYS.settings, booted.settings, { persist: true });
  seed(BOOT_KEYS.highlights, { topItems: booted.topItems, topReview: booted.topReview }, { persist: true });
}

/* Fonts, bundled and served from this origin rather than fetched from a font
   CDN: one fewer connection to open, and no third party that can be slow or
   blocked. Both faces are variable and subset by unicode range. */
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/inter/wght.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/pages.css";

/**
 * The whole site is served under /admin while it is being finished.
 *
 * Every other path shows a holding page. Kept exactly as it was: flipping it is
 * the owner's decision, and it is one line in `app/App.tsx` when they make it.
 */
const basename =
  window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/") ? "/admin" : "/";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      {/* Toast is outermost because the session provider reports an expired
          session through it, so it has to exist before the session does. */}
      <ToastProvider>
        <SessionProvider>
          <VenueProvider>
            <LocaleProvider>
              <BasketProvider>
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
      /* Unsupported, or blocked by the browser's storage settings. The site
         works without it; it is only ever a head start. */
    });
  });
}
