import { http } from "../http";
import type {
  AuditEntry,
  DeskAnalytics,
  DeskBooking,
  DeskOrder,
  DeskPayment,
  DeskReceipt,
  DeskStats,
  DeskTable,
  DeskUser,
  DiningTable,
  EventEnquiry,
  EventType,
  FixtureKind,
  FloorFixture,
  GalleryPhoto,
  GiftCard,
  LegalPage,
  LoyaltyLedgerEntry,
  MenuItem,
  Offer,
  PromoCode,
  Review,
  SiteSettings,
  VerifiedBooking,
  VerifiedOrder,
  VerifyResult,
  WaitlistEntry,
} from "./types";

/**
 * Everything behind the staff sign-in.
 *
 * Grouped by the screen that uses it rather than by the router it happens to
 * live on server-side, because that is how it gets read.
 */
export const deskApi = {
  stats: () => http.get<DeskStats>("/api/admin/stats"),
  analytics: () => http.get<DeskAnalytics>("/api/admin/analytics"),
  audit: (limit = 200) => http.get<{ entries: AuditEntry[] }>(`/api/admin/audit?limit=${limit}`).then((r) => r.entries),

  bookings: {
    list: (filters: { date?: string; status?: string; q?: string } = {}) =>
      http
        .get<{ reservations: DeskBooking[] }>(`/api/admin/reservations${http.query(filters)}`)
        .then((r) => r.reservations),
    setStatus: (id: number, status: string) => http.patch<{ ok: true }>(`/api/admin/reservations/${id}`, { status }),
    cancel: (id: number, reason: string) => http.post<{ ok: true }>(`/api/admin/reservations/${id}/cancel`, { reason }),
    restore: (id: number) => http.post<{ ok: true }>(`/api/admin/reservations/${id}/uncancel`),
  },

  tables: {
    list: () => http.get<{ tables: DeskTable[] }>("/api/admin/tables").then((r) => r.tables),
    create: (input: { label: string; capacity: number; zone: string; pos_x: number; pos_y: number }) =>
      http.post<{ table: DiningTable }>("/api/admin/tables", input).then((r) => r.table),
    update: (id: number, input: Partial<{ label: string; capacity: number; zone: string; pos_x: number; pos_y: number; active: boolean }>) =>
      http.patch<{ ok: true }>(`/api/admin/tables/${id}`, input),
    remove: (id: number) => http.del<{ ok: true }>(`/api/admin/tables/${id}`),
  },

  /** The room around the tables — grill, screen, bar. Never bookable. */
  fixtures: {
    list: () =>
      http.get<{ fixtures: FloorFixture[]; kinds: FixtureKind[] }>("/api/admin/fixtures"),
    create: (input: { kind: FixtureKind; label?: string; pos_x?: number; pos_y?: number; width?: number; height?: number }) =>
      http.post<{ id: number }>("/api/admin/fixtures", input),
    update: (
      id: number,
      input: Partial<{ kind: FixtureKind; label: string; pos_x: number; pos_y: number; width: number; height: number }>
    ) => http.patch<{ ok: true }>(`/api/admin/fixtures/${id}`, input),
    remove: (id: number) => http.del<{ ok: true }>(`/api/admin/fixtures/${id}`),
  },

  menu: {
    list: () => http.get<{ menu: MenuItem[] }>("/api/admin/menu").then((r) => r.menu),
    create: (input: Partial<MenuItem>) => http.post<{ item: MenuItem }>("/api/admin/menu", input).then((r) => r.item),
    update: (id: number, input: Partial<MenuItem>) => http.patch<{ ok: true }>(`/api/admin/menu/${id}`, input),
    remove: (id: number) => http.del<{ ok: true }>(`/api/admin/menu/${id}`),
  },

  orders: {
    list: () => http.get<{ orders: DeskOrder[] }>("/api/takeaway").then((r) => r.orders),
    setStatus: (id: number, status: string) => http.patch<{ ok: true }>(`/api/takeaway/${id}/status`, { status }),
  },

  /** The door: scan a pass, or type the code off it. */
  door: {
    check: (input: { token?: string; code?: string }) => http.post<VerifyResult>("/api/verify", input),
    admit: (id: number) =>
      http.post<{ ok: true; booking: VerifiedBooking }>(`/api/verify/${id}/check-in`).then((r) => r.booking),
    undoAdmit: (id: number) => http.post<{ ok: true }>(`/api/verify/${id}/undo-check-in`),
    handOver: (id: number) =>
      http.post<{ ok: true; order: VerifiedOrder }>(`/api/verify/order/${id}/collect`).then((r) => r.order),
    undoHandOver: (id: number) => http.post<{ ok: true }>(`/api/verify/order/${id}/undo-collect`),
  },

  users: {
    list: () => http.get<{ users: DeskUser[] }>("/api/admin/users").then((r) => r.users),
    ban: (id: number) => http.patch<{ ok: true }>(`/api/admin/users/${id}/ban`),
    unban: (id: number) => http.patch<{ ok: true }>(`/api/admin/users/${id}/unban`),
    setRole: (id: number, role: "user" | "admin") => http.patch<{ ok: true }>(`/api/admin/users/${id}/role`, { role }),
    remove: (id: number) => http.del<{ ok: true }>(`/api/admin/users/${id}`),
    adjustPoints: (userId: number, amount: number, reason: string) =>
      http.post<{ ok: true; points_balance: number }>("/api/loyalty/adjust", { user_id: userId, amount, reason }),
  },

  money: {
    payments: () => http.get<{ payments: DeskPayment[] }>("/api/admin/payments").then((r) => r.payments),
    setPaymentStatus: (id: number, status: "failed" | "completed") =>
      http.patch<{ ok: true }>(`/api/admin/payments/${id}`, { status }),
    receipts: () => http.get<{ receipts: DeskReceipt[] }>("/api/admin/receipts").then((r) => r.receipts),
  },

  reviews: {
    /*
     * Read from the public list, not /api/admin/reviews.
     *
     * The admin endpoint selects a thinner row: no admin_reply, no votes, no
     * verified-diner flag. The console needs all of it — without admin_reply
     * staff cannot see which reviews they have already answered, and would
     * reply to the same one twice. The public list returns every review with
     * those fields, and staff are allowed to read it, so it is the better
     * source. Writes below still go to the admin routes.
     */
    list: () => http.get<{ reviews: Review[] }>("/api/reviews").then((r) => r.reviews),
    remove: (id: number) => http.del<{ ok: true }>(`/api/admin/reviews/${id}`),
    reply: (id: number, text: string) => http.post<{ ok: true }>(`/api/admin/reviews/${id}/reply`, { text }),
    removeReply: (id: number) => http.del<{ ok: true }>(`/api/admin/reviews/${id}/reply`),
  },

  gallery: {
    all: () => http.get<{ photos: GalleryPhoto[] }>("/api/gallery/all").then((r) => r.photos),
    pending: () => http.get<{ photos: GalleryPhoto[] }>("/api/gallery/pending").then((r) => r.photos),
    upload: (imageUrl: string, caption: string) =>
      http.post<{ ok: true; photo: GalleryPhoto }>("/api/gallery/admin-upload", { image_url: imageUrl, caption }),
    update: (id: number, input: { is_approved?: boolean; is_featured?: boolean }) =>
      http.patch<{ ok: true }>(`/api/gallery/${id}`, input),
    remove: (id: number) => http.del<{ ok: true }>(`/api/gallery/${id}`),
  },

  events: {
    list: () => http.get<{ bookings: EventEnquiry[] }>("/api/events").then((r) => r.bookings),
    create: (input: {
      name: string;
      email: string;
      phone: string;
      event_type: EventType;
      date: string;
      time: string;
      guest_count: number;
      note?: string;
      status?: string;
    }) => http.post<{ ok: true }>("/api/events/admin-create", input),
    setStatus: (id: number, status: "pending" | "confirmed" | "cancelled") =>
      http.patch<{ ok: true }>(`/api/events/${id}`, { status }),
    remove: (id: number) => http.del<{ ok: true }>(`/api/events/${id}`),
  },

  waitlist: {
    list: () => http.get<{ entries: WaitlistEntry[] }>("/api/waitlist/all").then((r) => r.entries),
    setStatus: (id: number, status: string) => http.patch<{ ok: true }>(`/api/waitlist/${id}`, { status }),
    clear: () => http.del<{ ok: true }>("/api/waitlist/clear"),
  },

  offers: {
    list: () => http.get<{ offers: Offer[] }>("/api/offers/all").then((r) => r.offers),
    create: (input: Partial<Offer>) => http.post<{ ok: true }>("/api/offers", input),
    update: (id: number, input: Partial<Offer>) => http.patch<{ ok: true }>(`/api/offers/${id}`, input),
    remove: (id: number) => http.del<{ ok: true }>(`/api/offers/${id}`),
  },

  promos: {
    list: () => http.get<{ codes: PromoCode[] }>("/api/promos").then((r) => r.codes),
    create: (input: Partial<PromoCode>) => http.post<{ ok: true }>("/api/promos", input),
    setActive: (id: number, isActive: boolean) => http.patch<{ ok: true }>(`/api/promos/${id}`, { is_active: isActive }),
    remove: (id: number) => http.del<{ ok: true }>(`/api/promos/${id}`),
  },

  giftCards: {
    list: () => http.get<{ cards: GiftCard[] }>("/api/gift-cards").then((r) => r.cards),
    issue: (valueFcfa: number) =>
      http.post<{ code: string; value_fcfa: number }>("/api/gift-cards", { value_fcfa: valueFcfa }),
    toggle: (id: number) => http.patch<{ ok: true; is_active: boolean }>(`/api/gift-cards/${id}`),
    deactivate: (id: number) => http.del<{ ok: true }>(`/api/gift-cards/${id}`),
    ledger: (id: number) =>
      http.get<{ entries: LoyaltyLedgerEntry[] }>(`/api/gift-cards/${id}/ledger`).then((r) => r.entries),
  },

  settings: {
    update: (updates: Partial<SiteSettings>) => http.patch<{ ok: true }>("/api/site-settings", updates),
    /** Proves outgoing email works. Never issues or reveals a reset code. */
    sendTestEmail: (to?: string) => http.post<{ ok: true; to: string }>("/api/recovery/admin/test-email", { to }),
  },

  legal: {
    list: () => http.get<{ pages: LegalPage[] }>("/api/legal").then((r) => r.pages),
    save: (slug: "terms" | "privacy", input: { title: string; body: string }) =>
      http.put<{ ok: true; page: LegalPage }>(`/api/legal/${slug}`, input),
  },
};
