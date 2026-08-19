import type { CSSProperties, ReactNode } from "react";
import { RouteMeta } from "./RouteMeta";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "./Shell";
import { ErrorBoundary } from "./ErrorBoundary";
import { RequireAccount, RequireStaff } from "./guards";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { Maintenance } from "~/features/misc/Maintenance";
import { SkeletonCards } from "~/ui/Feedback";
import { FeatureGate, ServiceGate } from "~/ui/FeatureGate";
import { Home } from "~/features/home/Home";
import { MenuPage } from "~/features/menu/MenuPage";
import { BookPage } from "~/features/booking/BookPage";

const OrderPage = lazy(() => import("~/features/order/OrderPage").then((m) => ({ default: m.OrderPage })));
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
const NotFound = lazy(() => import("~/features/misc/NotFound").then((m) => ({ default: m.NotFound })));
const Desk = lazy(() => import("~/features/desk/DeskRoutes").then((m) => ({ default: m.DeskRoutes })));

const unavailableScreen: CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#0A0A0A", color: "#FFFFFF", textAlign: "center", fontFamily: "Inter, system-ui, sans-serif" };
function NotAvailable() { return <main style={unavailableScreen} aria-labelledby="not-available-title"><section style={{ width: "min(100%, 34rem)" }}><p style={{ color: "#E31C23", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Coming soon</p><h1 id="not-available-title" style={{ fontSize: "clamp(2.5rem, 9vw, 5rem)", lineHeight: 0.95, letterSpacing: "-0.055em", margin: "1rem 0" }}>Not available yet.</h1><p style={{ color: "rgba(255,255,255,0.62)", lineHeight: 1.65 }}>CCM is still being finished behind the scenes. The site is temporarily unavailable while we put the final pieces in place.</p></section></main>; }
function Loading() { return <div className="page section"><SkeletonCards count={2} height="9rem" /></div>; }

/**
 * Closes the customer side while the owner works on the site.
 *
 * Staff pass straight through, exactly as they do at the API, so the owner can
 * keep using the site they have closed — and, more to the point, can reach the
 * switch that opens it again. The console is outside this on purpose.
 *
 * `ready` matters: until the session has come back this tab does not know
 * whether it is staff, and showing the maintenance page to an owner for half a
 * second and then yanking it away is worse than waiting.
 */
/**
 * The screens that stay reachable while the site is closed.
 *
 * Signing in, above all: a signed-out owner who cannot reach the sign-in form
 * can never become staff, and so can never reach the switch that opens the
 * site again. This mirrors the API's own list, which keeps /api/auth open for
 * exactly the same reason — closing one without the other leaves a form that
 * cannot submit, or a route that cannot be reached.
 */
const OPEN_DURING_MAINTENANCE = new Set(["/signin", "/join", "/reset"]);

function MaintenanceGate({ children }: { children: ReactNode }) {
  const { siteConfig, loading } = useVenue();
  const { isStaff, ready } = useSession();
  const { pathname } = useLocation();

  /* Until the session has come back this tab does not know whether it is
     staff. Showing an owner the maintenance page for half a second and then
     yanking it away is worse than making them wait for it. */
  if (loading || !ready) return <Loading />;
  if (!siteConfig.maintenance.enabled || isStaff) return <>{children}</>;
  if (OPEN_DURING_MAINTENANCE.has(pathname.replace(/\/+$/, "") || "/")) return <>{children}</>;
  return <Maintenance />;
}

function CustomerRoutes() {
  return <Routes><Route element={<MaintenanceGate><Shell /></MaintenanceGate>}>
    <Route index element={<Home />} />
    <Route path="menu" element={<MenuPage />} />
    <Route path="book" element={<ServiceGate feature="booking"><BookPage /></ServiceGate>} />
    <Route path="order" element={<ServiceGate feature="ordering"><OrderPage /></ServiceGate>} />
    <Route path="story" element={<StoryPage />} />
    <Route path="find" element={<FindPage />} />
    <Route path="reviews" element={<FeatureGate feature="reviews"><ReviewsPage /></FeatureGate>} />
    <Route path="gallery" element={<FeatureGate feature="gallery"><GalleryPage /></FeatureGate>} />
    <Route path="events" element={<FeatureGate feature="events"><EventsPage /></FeatureGate>} />
    <Route path="waitlist" element={<ServiceGate feature="waitlist"><WaitlistPage /></ServiceGate>} />
    <Route path="offers" element={<FeatureGate feature="offers"><OffersPage /></FeatureGate>} />
    <Route path="help" element={<FeatureGate feature="supportChat"><HelpPage /></FeatureGate>} />
    <Route path="signin" element={<FeatureGate feature="customerAccounts"><SignInPage /></FeatureGate>} />
    <Route path="join" element={<FeatureGate feature="customerAccounts"><JoinPage /></FeatureGate>} />
    <Route path="reset" element={<FeatureGate feature="customerAccounts"><ResetPage /></FeatureGate>} />
    <Route path="mine" element={<FeatureGate feature="customerAccounts"><RequireAccount><MinePage /></RequireAccount></FeatureGate>} />
    <Route path="account" element={<FeatureGate feature="customerAccounts"><RequireAccount><AccountPage /></RequireAccount></FeatureGate>} />
    <Route path="terms" element={<LegalPageView slug="terms" />} />
    <Route path="privacy" element={<LegalPageView slug="privacy" />} />
    <Route path="reserve" element={<Navigate to="/book" replace />} />
    <Route path="takeaway" element={<Navigate to="/order" replace />} />
    <Route path="about" element={<Navigate to="/story" replace />} />
    <Route path="contact" element={<Navigate to="/find" replace />} />
    <Route path="my-tables" element={<Navigate to="/mine" replace />} />
    <Route path="*" element={<NotFound />} />
  </Route><Route path="desk/*" element={<RequireStaff><Desk /></RequireStaff>} /></Routes>;
}

export function App() { const isDevelopmentSite = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/"); return <ErrorBoundary>{isDevelopmentSite ? <><RouteMeta /><Suspense fallback={<Loading />}><CustomerRoutes /></Suspense></> : <NotAvailable />}</ErrorBoundary>; }
