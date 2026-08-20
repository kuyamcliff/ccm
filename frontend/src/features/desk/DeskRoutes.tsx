import { Route, Routes } from "react-router-dom";
import { DeskShell } from "./DeskShell";
import { Overview } from "./Overview";
import { Bookings } from "./Bookings";
import { Door } from "./Door";
import { Orders } from "./Orders";
import { Queue } from "./Queue";
import { Floor } from "./Floor";
import { MenuAdmin } from "./MenuAdmin";
import { Offers } from "./Offers";
import { GalleryAdmin } from "./GalleryAdmin";
import { ReviewsAdmin } from "./ReviewsAdmin";
import { EventsAdmin } from "./EventsAdmin";
import { MoneyDesk } from "./Money";
import { Promos } from "./Promos";
import { GiftCards } from "./GiftCards";
import { Inbox } from "./Inbox";
import { Guests } from "./Guests";
import { Insights } from "./Insights";
import { Settings } from "./Settings";
import { OwnerSiteControl } from "./OwnerSiteControl";
import { Translations } from "./Translations";
import { LegalAdmin } from "./LegalAdmin";
import { AuditLog } from "./AuditLog";
import { Access } from "./Access";
import { NotFound } from "~/features/misc/NotFound";

import "~/styles/desk.css";

export function DeskRoutes() {
  return (
    <Routes>
      <Route element={<DeskShell />}>
        <Route index element={<Overview />} />
        <Route path="door" element={<Door />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="orders" element={<Orders />} />
        <Route path="queue" element={<Queue />} />
        <Route path="floor" element={<Floor />} />
        <Route path="menu" element={<MenuAdmin />} />
        <Route path="offers" element={<Offers />} />
        <Route path="gallery" element={<GalleryAdmin />} />
        <Route path="reviews" element={<ReviewsAdmin />} />
        <Route path="events" element={<EventsAdmin />} />
        <Route path="money" element={<MoneyDesk />} />
        <Route path="promos" element={<Promos />} />
        <Route path="cards" element={<GiftCards />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="guests" element={<Guests />} />
        <Route path="insights" element={<Insights />} />
        <Route path="settings" element={<Settings />} />
        <Route path="site-control" element={<OwnerSiteControl />} />
        <Route path="translations" element={<Translations />} />
        <Route path="legal" element={<LegalAdmin />} />
        <Route path="log" element={<AuditLog />} />
        <Route path="access" element={<Access />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
