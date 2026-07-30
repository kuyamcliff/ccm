import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { SettingsProvider } from "./settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./styles.css";
import "./styles/menu.css";
import "./styles/gallery.css";
import "./styles/analytics.css";

/*
 * Promote the preloaded web fonts to an active stylesheet. The preload has
 * already fetched them, so this applies from cache without a second request and
 * without the fetch having blocked the first paint.
 */
const fontLink = document.getElementById("webfonts") as HTMLLinkElement | null;
if (fontLink) fontLink.rel = "stylesheet";

/*
 * Registered only in a production build. During development the worker would
 * serve cached copies of files Vite is actively rebuilding, which shows up as
 * edits that mysteriously do not appear.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Take over as soon as a new version is ready, so the next navigation
        // is already on the current build.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage("skip-waiting");
            }
          });
        });
      })
      .catch(() => {
        // A failed registration costs offline support, nothing else.
      });
  });
} else if ("serviceWorker" in navigator) {
  // Clear out a worker left behind by an earlier production visit on this host.
  navigator.serviceWorker
    .getRegistrations()
    .then((rs) => rs.forEach((r) => r.unregister()))
    .catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
