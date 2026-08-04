import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { ErrorBoundary } from "./ErrorBoundary";
import { RequireAccount, RequireStaff } from "./guards";
import { SkeletonCards } from "~/ui/Feedback";

/* Eager: the three screens most visits start on. Everything else is fetched
   when it is first opened, which keeps the initial download small on a phone. */
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

function Loading() {
  return (
    <div className="page section">
      <SkeletonCards count={2} height="9rem" />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="book" element={<BookPage />} />
            <Route path="order" element={<OrderPage />} />
            <Route path="story" element={<StoryPage />} />
            <Route path="find" element={<FindPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="gallery" element={<GalleryPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="waitlist" element={<WaitlistPage />} />
            <Route path="offers" element={<OffersPage />} />
            <Route path="help" element={<HelpPage />} />

            <Route path="signin" element={<SignInPage />} />
            <Route path="join" element={<JoinPage />} />
            <Route path="reset" element={<ResetPage />} />

            <Route
              path="mine"
              element={
                <RequireAccount>
                  <MinePage />
                </RequireAccount>
              }
            />
            <Route
              path="account"
              element={
                <RequireAccount>
                  <AccountPage />
                </RequireAccount>
              }
            />

            <Route path="terms" element={<LegalPageView slug="terms" />} />
            <Route path="privacy" element={<LegalPageView slug="privacy" />} />

            {/* Paths the old site used. Kept so links already shared, and
                anything a search engine has indexed, still land somewhere. */}
            <Route path="reserve" element={<Navigate to="/book" replace />} />
            <Route path="takeaway" element={<Navigate to="/order" replace />} />
            <Route path="about" element={<Navigate to="/story" replace />} />
            <Route path="contact" element={<Navigate to="/find" replace />} />
            <Route path="my-tables" element={<Navigate to="/mine" replace />} />
            <Route path="admin/*" element={<Navigate to="/desk" replace />} />

            <Route path="*" element={<NotFound />} />
          </Route>

          {/* The staff console has its own chrome and sits outside the shell. */}
          <Route
            path="desk/*"
            element={
              <RequireStaff>
                <Desk />
              </RequireStaff>
            }
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
