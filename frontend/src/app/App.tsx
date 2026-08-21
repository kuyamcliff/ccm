import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Boot } from "./Boot";
import { Shell } from "./Shell";
import { RouteMeta } from "./RouteMeta";
import { ErrorBoundary } from "./ErrorBoundary";
import { RequireAccount, RequireStaff } from "./guards";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { FeatureGate, ServiceGate } from "~/ui/FeatureGate";
import { PageLoading } from "~/ui/Feedback";

/* The four screens somebody can land on cold, imported eagerly so they are in
   the first chunk rather than behind a second request. Everything else is split
   out and prefetched on intent when a link is touched. */
import { Home } from "~/features/home/Home";
import { MenuPage } from "~/features/menu/MenuPage";
import { Maintenance } from "~/features/misc/Maintenance";
import { NotFound } from "~/features/misc/NotFound";

const OrderPage = lazy(() => import("~/features/order/OrderPage").then((m) => ({ default: m.OrderPage })));
const BookPage = lazy(() => import("~/features/booking/BookPage").then((m) => ({ default: m.BookPage })));
const StoryPage = lazy(() => import("~/features/story/StoryPage").then((m) => ({ default: m.StoryPage })));
const FindPage = lazy(() => import("~/features/find/FindPage").then((m) => ({ default: m.FindPage })));
const MinePage = lazy(() => import("~/features/mine/MinePage").then((m) => ({ default: m.MinePage })));
const ReviewsPage = lazy(() => import("~/features/reviews/ReviewsPage").then((m) => ({ default: m.ReviewsPage })));
const GalleryPage = lazy(() => import("~/features/gallery/GalleryPage").then((m) => ({ default: m.GalleryPage })));
const EventsPage = lazy(() => import("~/features/events/EventsPage").then((m) => ({ default: m.EventsPage })));
const WaitlistPage = lazy(() => import("~/features/waitlist/WaitlistPage").then((m) => ({ default: m.WaitlistPage })));
const OffersPage = lazy(() => import("~/features/offers/OffersPage").then((m) => ({ default: m.OffersPage })));
const AccountPage = lazy(() => import("~/features/account/AccountPage").then((m) => ({ default: m.AccountPage })));
const SignInPage = lazy(() => import("~/features/auth/SignInPage").then((m) => ({ default: m.SignInPage })));
const JoinPage = lazy(() => import("~/features/auth/JoinPage").then((m) => ({ default: m.JoinPage })));
const ResetPage = lazy(() => import("~/features/auth/ResetPage").then((m) => ({ default: m.ResetPage })));
const HelpPage = lazy(() => import("~/features/support/HelpPage").then((m) => ({ default: m.HelpPage })));
const LegalPageView = lazy(() => import("~/features/legal/LegalPageView").then((m) => ({ default: m.LegalPageView })));
const Desk = lazy(() => import("~/features/desk/DeskRoutes").then((m) => ({ default: m.DeskRoutes })));

/**
 * The screens that stay reachable while the site is closed.
 *
 * Signing in above all. A signed-out owner who cannot reach the sign-in form can
 * never become staff, and so can never reach the switch that opens the site
 * again. This mirrors the API's own list in `backend/src/lib/maintenance.ts`,
 * which keeps `/api/auth` open for exactly the same reason: closing one without
 * the other leaves a form that cannot submit.
 */
const OPEN_WHILE_CLOSED = new Set(["/signin", "/join", "/reset"]);

/**
 * Closes the customer site while the owner works on it.
 *
 * ── What changed in v5 ─────────────────────────────────────────────────────
 *
 * This used to refuse to render *anything* until both the session and the
 * settings had come back, which put a blank skeleton in front of every visitor
 * for the length of a round trip, on every cold load. It was one of the four
 * waterfalls that made the site feel slow.
 *
 * Now both are usually settled on the first frame from the cached boot payload,
 * and when they are not, the gate errs towards showing the site rather than
 * showing a wait. Guessing wrong for a moment means an owner sees the customer
 * site for a beat during maintenance, which is harmless. Guessing the other way
 * means every visitor waits.
 */
function MaintenanceGate({ children }: { children: ReactNode }) {
  const { siteConfig, loading } = useVenue();
  const { isStaff, ready } = useSession();
  const { pathname } = useLocation();

  if (loading || !ready) return <>{children}</>;
  if (!siteConfig.maintenance.enabled || isStaff) return <>{children}</>;
  if (OPEN_WHILE_CLOSED.has(pathname.replace(/\/+$/, "") || "/")) return <>{children}</>;
  return <Maintenance />;
}

function CustomerRoutes() {
  return (
    <Routes>
      <Route
        element={
          <MaintenanceGate>
            <Shell />
          </MaintenanceGate>
        }
      >
        <Route index element={<Home />} />
        <Route path="menu" element={<MenuPage />} />

        <Route
          path="book"
          element={
            <ServiceGate feature="booking">
              <BookPage />
            </ServiceGate>
          }
        />
        <Route
          path="order"
          element={
            <ServiceGate feature="ordering">
              <OrderPage />
            </ServiceGate>
          }
        />
        <Route
          path="waitlist"
          element={
            <ServiceGate feature="waitlist">
              <WaitlistPage />
            </ServiceGate>
          }
        />

        <Route path="story" element={<StoryPage />} />
        <Route path="find" element={<FindPage />} />

        <Route
          path="reviews"
          element={
            <FeatureGate feature="reviews">
              <ReviewsPage />
            </FeatureGate>
          }
        />
        <Route
          path="gallery"
          element={
            <FeatureGate feature="gallery">
              <GalleryPage />
            </FeatureGate>
          }
        />
        <Route
          path="events"
          element={
            <FeatureGate feature="events">
              <EventsPage />
            </FeatureGate>
          }
        />
        <Route
          path="offers"
          element={
            <FeatureGate feature="offers">
              <OffersPage />
            </FeatureGate>
          }
        />
        <Route
          path="help"
          element={
            <FeatureGate feature="supportChat">
              <HelpPage />
            </FeatureGate>
          }
        />

        <Route
          path="signin"
          element={
            <FeatureGate feature="customerAccounts">
              <SignInPage />
            </FeatureGate>
          }
        />
        <Route
          path="join"
          element={
            <FeatureGate feature="customerAccounts">
              <JoinPage />
            </FeatureGate>
          }
        />
        <Route
          path="reset"
          element={
            <FeatureGate feature="customerAccounts">
              <ResetPage />
            </FeatureGate>
          }
        />
        <Route
          path="mine"
          element={
            <FeatureGate feature="customerAccounts">
              <RequireAccount>
                <MinePage />
              </RequireAccount>
            </FeatureGate>
          }
        />
        <Route
          path="account"
          element={
            <FeatureGate feature="customerAccounts">
              <RequireAccount>
                <AccountPage />
              </RequireAccount>
            </FeatureGate>
          }
        />

        <Route path="terms" element={<LegalPageView slug="terms" />} />
        <Route path="privacy" element={<LegalPageView slug="privacy" />} />

        {/* Addresses from earlier versions of the site that are still in
            somebody's messages, somebody's bookmarks, and Google's index. */}
        <Route path="reserve" element={<Navigate to="/book" replace />} />
        <Route path="takeaway" element={<Navigate to="/order" replace />} />
        <Route path="about" element={<Navigate to="/story" replace />} />
        <Route path="contact" element={<Navigate to="/find" replace />} />
        <Route path="my-tables" element={<Navigate to="/mine" replace />} />

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* The console is outside the maintenance gate and outside the customer
          shell: it has its own chrome, and the owner has to be able to use the
          site they have just closed. */}
      <Route
        path="desk/*"
        element={
          <RequireStaff>
            <Desk />
          </RequireStaff>
        }
      />
    </Routes>
  );
}

/**
 * Until the site launches, everything outside /admin is a holding page.
 *
 * One constant. When the restaurant is ready to go live, delete this and the
 * `basename` in `main.tsx`, and the site is at the root.
 */
function NotYet() {
  return (
    <main className="page section stack center notyet">
      <p className="label hot">Coming soon</p>
      <h1 className="display display--hero">Cam Chop Meat</h1>
      <p className="lead">
        The best meat in Buea. We are putting the finishing touches to the site. Back very shortly.
      </p>
    </main>
  );
}

export function App() {
  const gated = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");

  return (
    <ErrorBoundary>
      {gated ? (
        <>
          <Boot />
          <RouteMeta />
          <Suspense fallback={<PageLoading />}>
            <CustomerRoutes />
          </Suspense>
        </>
      ) : (
        <NotYet />
      )}
    </ErrorBoundary>
  );
}
