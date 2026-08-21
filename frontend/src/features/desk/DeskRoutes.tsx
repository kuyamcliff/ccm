import { Route, Routes } from "react-router-dom";
import { DeskShell } from "./DeskShell";
import { Overview } from "./Overview";
import { Door } from "./Door";
import { Bookings } from "./Bookings";
import { Orders } from "./Orders";
import { Queue } from "./Queue";
import { Floor } from "./Floor";
import { MenuAdmin } from "./MenuAdmin";
import { Offers } from "./Offers";
import { GalleryAdmin } from "./GalleryAdmin";
import { ReviewsAdmin } from "./ReviewsAdmin";
import { EventsAdmin } from "./EventsAdmin";
import { Money } from "./Money";
import { Promos } from "./Promos";
import { GiftCards } from "./GiftCards";
import { Inbox } from "./Inbox";
import { Guests } from "./Guests";
import { Reminders } from "./Reminders";
import { Insights } from "./Insights";
import { Settings } from "./Settings";
import { SiteControl } from "./SiteControl";
import { Translations } from "./Translations";
import { LegalAdmin } from "./LegalAdmin";
import { AuditLog } from "./AuditLog";
import { Access } from "./Access";
import { DevSystem } from "./dev/DevSystem";
import { DevErrors } from "./dev/DevErrors";
import { DevFlags } from "./dev/DevFlags";
import { DevData } from "./dev/DevData";
import { DevImpersonate } from "./dev/DevImpersonate";
import { RequireDeveloper } from "~/app/guards";
import { NotFound } from "~/features/misc/NotFound";

/* Loaded with the console chunk, not the customer one, so a diner never
   downloads any of this. See the manualChunks rule in vite.config.ts. */
import "~/styles/desk.css";

/**
 * Every console route.
 *
 * Flat on purpose. The rail groups these into five headings for reading, but the
 * URLs are one level deep because a member of staff reads them out loud
 * ("it is slash desk slash door") and because a nested router here buys nothing:
 * there is no shared layout below `DeskShell`.
 *
 * The developer routes sit under `/desk/dev` behind `RequireDeveloper`. That
 * guard hides them; `requireDeveloper` on the server is what refuses them.
 */
export function DeskRoutes() {
  return (
    <Routes>
      <Route element={<DeskShell />}>
        <Route index element={<Overview />} />

        {/* Tonight */}
        <Route path="door" element={<Door />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="orders" element={<Orders />} />
        <Route path="queue" element={<Queue />} />
        <Route path="floor" element={<Floor />} />

        {/* The place */}
        <Route path="menu" element={<MenuAdmin />} />
        <Route path="offers" element={<Offers />} />
        <Route path="gallery" element={<GalleryAdmin />} />
        <Route path="reviews" element={<ReviewsAdmin />} />
        <Route path="events" element={<EventsAdmin />} />

        {/* Money */}
        <Route path="money" element={<Money />} />
        <Route path="promos" element={<Promos />} />
        <Route path="cards" element={<GiftCards />} />

        {/* People */}
        <Route path="inbox" element={<Inbox />} />
        <Route path="guests" element={<Guests />} />
        <Route path="reminders" element={<Reminders />} />

        {/* The site */}
        <Route path="insights" element={<Insights />} />
        <Route path="settings" element={<Settings />} />
        <Route path="site-control" element={<SiteControl />} />
        <Route path="translations" element={<Translations />} />
        <Route path="legal" element={<LegalAdmin />} />
        <Route path="log" element={<AuditLog />} />
        <Route path="access" element={<Access />} />

        {/* Developer */}
        <Route
          path="dev"
          element={
            <RequireDeveloper>
              <DevSystem />
            </RequireDeveloper>
          }
        />
        <Route
          path="dev/errors"
          element={
            <RequireDeveloper>
              <DevErrors />
            </RequireDeveloper>
          }
        />
        <Route
          path="dev/flags"
          element={
            <RequireDeveloper>
              <DevFlags />
            </RequireDeveloper>
          }
        />
        <Route
          path="dev/data"
          element={
            <RequireDeveloper>
              <DevData />
            </RequireDeveloper>
          }
        />
        <Route
          path="dev/impersonate"
          element={
            <RequireDeveloper>
              <DevImpersonate />
            </RequireDeveloper>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
