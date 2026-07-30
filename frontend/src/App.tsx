import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { SupportChat } from "./components/SupportChat";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RouteChrome, RouteFallback } from "./components/RouteChrome";
import { useRevealAll } from "./components/Reveal";
import { Home } from "./pages/Home";
import { MenuPage } from "./pages/MenuPage";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { Register } from "./pages/Register";
import { NotFound } from "./pages/NotFound";

/**
 * Only the landing path, the menu and the sign-in screens ship in the first
 * bundle. Everything else — and the entire admin panel, which no ordinary
 * visitor ever opens — is fetched on demand.
 */
const About = lazy(() => import("./pages/About").then((m) => ({ default: m.About })));
const Reserve = lazy(() => import("./pages/Reserve").then((m) => ({ default: m.Reserve })));
const ReserveConfirmed = lazy(() => import("./pages/ReserveConfirmed").then((m) => ({ default: m.ReserveConfirmed })));
const Reviews = lazy(() => import("./pages/Reviews").then((m) => ({ default: m.Reviews })));
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const MyTables = lazy(() => import("./pages/MyTables").then((m) => ({ default: m.MyTables })));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy").then((m) => ({ default: m.PrivacyPolicy })));
const Terms = lazy(() => import("./pages/Terms").then((m) => ({ default: m.Terms })));
const OffersPage = lazy(() => import("./pages/Offers"));
const GalleryPage = lazy(() => import("./pages/Gallery"));
const EventsPage = lazy(() => import("./pages/Events"));
const WaitlistPage = lazy(() => import("./pages/Waitlist"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const AdminReservations = lazy(() => import("./pages/admin/AdminReservations").then((m) => ({ default: m.AdminReservations })));
const AdminTables = lazy(() => import("./pages/admin/AdminTables").then((m) => ({ default: m.AdminTables })));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers").then((m) => ({ default: m.AdminUsers })));
const AdminMenu = lazy(() => import("./pages/admin/AdminMenu").then((m) => ({ default: m.AdminMenu })));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings").then((m) => ({ default: m.AdminSettings })));
const AdminLegal = lazy(() => import("./pages/admin/AdminLegal"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminTableEditor = lazy(() => import("./pages/admin/AdminTableEditor").then((m) => ({ default: m.AdminTableEditor })));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews").then((m) => ({ default: m.AdminReviews })));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments").then((m) => ({ default: m.AdminPayments })));
const AdminReceipts = lazy(() => import("./pages/admin/AdminReceipts").then((m) => ({ default: m.AdminReceipts })));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminOffers = lazy(() => import("./pages/admin/AdminOffers"));
const AdminWaitlist = lazy(() => import("./pages/admin/AdminWaitlist"));
const AdminGiftCards = lazy(() => import("./pages/admin/AdminGiftCards"));
const AdminEvents = lazy(() => import("./pages/admin/AdminEvents"));
const AdminGallery = lazy(() => import("./pages/admin/AdminGallery"));
const AdminTakeaway = lazy(() => import("./pages/admin/AdminTakeaway"));
const AdminPromoCodes = lazy(() => import("./pages/admin/AdminPromoCodes"));
const AdminVerify = lazy(() => import("./pages/admin/AdminVerify"));

/**
 * Replays the entry fade on every navigation.
 *
 * Keyed on the pathname so React tears the wrapper down and builds a new one,
 * which restarts the CSS animation. Without the key the element persists
 * across routes and the animation only ever runs once, on first paint.
 */
function RouteTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  /* Re-scans on every navigation, so a page only has to mark a block with
     `rv` to get the scroll reveal — no per-page wiring. */
  useRevealAll([pathname]);
  return <div key={pathname} className="route-fade">{children}</div>;
}

export default function App() {
  return (
    <>
      <RouteChrome />
      <Routes>
        {/* Admin runs without the public header, footer and chat button. */}
        <Route
          path="/admin"
          element={
            <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
                <AdminLayout />
              </Suspense>
            </ErrorBoundary>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="verify" element={<AdminVerify />} />
          <Route path="reservations" element={<AdminReservations />} />
          <Route path="tables" element={<AdminTables />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="menu" element={<AdminMenu />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="legal" element={<AdminLegal />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="floor" element={<AdminTableEditor />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="receipts" element={<AdminReceipts />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="offers" element={<AdminOffers />} />
          <Route path="promos" element={<AdminPromoCodes />} />
          <Route path="gift-cards" element={<AdminGiftCards />} />
          <Route path="waitlist" element={<AdminWaitlist />} />
          <Route path="events-admin" element={<AdminEvents />} />
          <Route path="gallery-admin" element={<AdminGallery />} />
          <Route path="takeaway-admin" element={<AdminTakeaway />} />
        </Route>

        <Route
          path="*"
          element={
            <div className="page">
              <a className="skip-link" href="#main">Skip to content</a>
              <p className="ticker" aria-hidden="true">
                buea · clerks quarters · opposite supptic · charcoal grill · open daily 9am till late · dine in or collect
              </p>
              <Header />
              <main id="main" tabIndex={-1}>
                <ErrorBoundary>
                  <Suspense fallback={<RouteFallback />}>
                    <RouteTransition>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/menu" element={<MenuPage />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/reserve" element={<Reserve />} />
                      <Route path="/reserve/confirmed" element={<ReserveConfirmed />} />
                      <Route path="/reviews" element={<Reviews />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/register" element={<Register />} />
                      <Route path="/my-tables" element={<MyTables />} />
                      <Route path="/account" element={<Account />} />
                      <Route path="/offers" element={<OffersPage />} />
                      <Route path="/gallery" element={<GalleryPage />} />
                      <Route path="/events" element={<EventsPage />} />
                      <Route path="/waitlist" element={<WaitlistPage />} />
                      {/* Ordering lives on the menu now. Old links and any
                          bookmarks land there instead of a dead end. */}
                      <Route path="/takeaway" element={<Navigate to="/menu" replace />} />
                      <Route path="/privacy" element={<PrivacyPolicy />} />
                      <Route path="/terms" element={<Terms />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    </RouteTransition>
                  </Suspense>
                </ErrorBoundary>
              </main>
              <Footer />
              <SupportChat />
            </div>
          }
        />
      </Routes>
    </>
  );
}
