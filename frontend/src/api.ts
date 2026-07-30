export class ApiError extends Error {
  status: number;
  /** Seconds to wait before retrying, when the server sent one with a 429. */
  retryAfter?: number;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }

  /** True when the request never reached the server. */
  get isOffline() {
    return this.status === 0;
  }
}

/** Uploads need longer than a plain JSON call, so the ceiling is generous. */
const REQUEST_TIMEOUT_MS = 30_000;

const SUPPORT_TOKEN_KEY = "ccm_support_token";

/** Identifies a signed-out visitor's support thread across visits. */
export function getSupportToken(): string | null {
  try { return localStorage.getItem(SUPPORT_TOKEN_KEY); } catch { return null; }
}

export function setSupportToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SUPPORT_TOKEN_KEY, token);
    else localStorage.removeItem(SUPPORT_TOKEN_KEY);
  } catch { /* private browsing; the thread just will not survive a reload */ }
}

/** Retries for a read that failed in a way a retry could plausibly fix. */
const MAX_RETRIES = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads are retried with backoff; writes never are.
 *
 * On a weak mobile connection a single dropped packet turns into a failed
 * fetch, and asking again a moment later usually succeeds. Repeating a POST is
 * a different matter: an order or a payment could be placed twice, so only
 * idempotent requests are retried.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const retryable = method === "GET" || method === "HEAD";

  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt <= (retryable ? MAX_RETRIES : 0); attempt++) {
    try {
      return await attempt_(path, options);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      // Worth another go: no connection at all, a timeout, or the server saying
      // it is temporarily overloaded. A 4xx will fail identically every time.
      const worthRetrying =
        apiErr !== null && (apiErr.status === 0 || apiErr.status === 503 || apiErr.status === 502);
      if (!retryable || !worthRetrying || attempt === MAX_RETRIES) throw err;
      lastError = apiErr;
      await sleep(400 * 2 ** attempt + Math.random() * 200);
    }
  }
  throw lastError ?? new ApiError(0, "Request failed.");
}

async function attempt_<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (path.startsWith("/api/support")) {
    const token = getSupportToken();
    if (token) headers["x-support-token"] = token;
  }
  // Caller-supplied headers win over the defaults above.
  Object.assign(headers, options.headers as Record<string, string> | undefined);

  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      // Without a deadline a stalled connection leaves the UI spinning forever.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...options,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, "That took too long. Check your connection and try again.");
    }
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }

  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status}).`;
    const retryAfter =
      data && typeof data === "object" && "retry_after_seconds" in data
        ? Number((data as { retry_after_seconds: unknown }).retry_after_seconds)
        : undefined;
    throw new ApiError(res.status, message, retryAfter);
  }

  return data as T;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin" | "super_admin";
}

/**
 * With two-factor authentication on, a correct password does not sign you in.
 * The server withholds the session and returns a short-lived challenge that
 * must be exchanged for one by supplying the authenticator code.
 */
export type LoginResult = { user: User } | { requires_2fa: true; challenge: string };

export function needsTwoFactor(r: LoginResult): r is { requires_2fa: true; challenge: string } {
  return "requires_2fa" in r;
}

export interface RestaurantTable {
  id: number;
  label: string;
  capacity: number;
  zone: string;
  pos_x: number;
  pos_y: number;
  active: number;
  available?: boolean;
}

export interface Reservation {
  id: number;
  date: string;
  time: string;
  party_size: number;
  phone: string;
  note: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "completed";
  payment_status: "unpaid" | "paid" | "refunded";
  cancellation_fee_fcfa: number;
  ccm_code: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  checked_in_at: string | null;
  table_label?: string;
  table_zone?: string;
  created_at: string;
  /** Present once a deposit has been collected. */
  amount_fcfa?: number | null;
  discount_fcfa?: number | null;
  pay_method?: string | null;
  pay_reference?: string | null;
}

export interface ReviewReply {
  id: number;
  review_id: number;
  user_id: number;
  author: string;
  text: string;
  created_at: string;
}

export interface Review {
  id: number;
  rating: number;
  text: string;
  author: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  media_urls: string[];
  likes: number;
  dislikes: number;
  user_vote: "like" | "dislike" | null;
  replies: ReviewReply[];
  admin_reply: string | null;
  admin_reply_at: string | null;
  is_verified_diner: boolean;
}

export interface Payment {
  id: number;
  status: "pending" | "completed" | "failed";
  amount_fcfa: number;
  reference: string;
  type: string;
  method?: string;
}

export interface PaymentVerifyResult {
  payment: Payment;
  reservation: {
    id: number;
    date: string;
    time: string;
    party_size: number;
    phone: string;
    note: string;
    status: string;
    ccm_code: string | null;
    table_label: string | null;
  };
}

/** What the server returns after pushing a MoMo prompt to the customer. */
export interface MomoInitiation {
  payment_id: number;
  reference: string;
  status: "pending" | "completed";
  amount_fcfa: number;
  discount_fcfa: number;
  method: string;
  momo_phone?: string;
  /** Seconds the customer has to approve on their handset. */
  expires_in_seconds?: number;
  /** True when a promo or gift card covered the whole amount. */
  zero_cost: boolean;
}

export interface AdminAnalytics {
  revenueByDay: { day: string; revenue: number; payments: number }[];
  peakHours: { hour: string; count: number }[];
  newUsersByDay: { day: string; count: number }[];
  reviewSummary: { avg_rating: number | null; total: number };
  /** Counted from takeaway line items, ordered by quantity sold. */
  topMenuItems: { name: string; qty: number; revenue: number }[];
  busiestDays: { weekday: number; count: number }[];
  window30: { bookings: number; covers: number; cancelled: number; arrived: number };
  /** Same length window immediately before, for direction of travel. */
  previous: { bookings: number; covers: number; revenue: number };
}

export interface VerifiedBooking {
  id: number;
  code: string;
  guest_name: string;
  date: string;
  time: string;
  party_size: number;
  phone: string;
  note: string | null;
  table_label: string | null;
  status: string;
  payment_status: string;
  amount_fcfa: number | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

/** A prepaid collection order, as the counter scanner sees it. */
export interface VerifiedOrder {
  id: number;
  code: string;
  customer_name: string;
  phone: string;
  items: { name: string; qty: number; price: number }[];
  pickup_time: string;
  note: string | null;
  total_fcfa: number;
  discount_fcfa: number;
  status: string;
  payment_status: string;
  collected_at: string | null;
  collected_by: string | null;
  created_at: string;
}

export interface VerifyResult {
  /** `valid` means hand over or admit; every other value needs a decision. */
  outcome:
    | "valid" | "unpaid" | "not_yet" | "not_ready" | "expired" | "already_used"
    | "cancelled" | "not_found" | "forged" | "unreadable";
  message: string;
  source: "scan" | "manual";
  /** Which kind of reference was recognised. Absent when nothing matched. */
  kind?: "reservation" | "takeaway";
  booking?: VerifiedBooking;
  order?: VerifiedOrder;
}

/** Mirrors the Receipt component's props; served by /payments/:ref/receipt. */
export interface ReceiptData {
  code: string;
  guestName: string;
  guestPhone: string | null;
  date: string;
  time: string;
  partySize: number;
  tableLabel: string | null;
  note: string | null;
  subtotalFcfa: number;
  discountFcfa: number;
  paidFcfa: number;
  method: string;
  momoPhone: string | null;
  reference: string | null;
  paidAt: string | null;
  status: "paid" | "unpaid" | "failed";
  reservationId: number;
}

export interface MomoStatus {
  reference: string;
  status: "pending" | "completed" | "failed";
  amount_fcfa: number;
  discount_fcfa: number;
  method: string;
  /** Plain-language explanation, present when something went wrong. */
  message: string | null;
  expires_in_seconds: number;
}

export interface MenuItem {
  id: number;
  category: string;
  name: string;
  description: string;
  price_fcfa: number | null;
  price_label: string | null;
  image_url: string | null;
  position: number;
  is_active: number;
  dietary_tags: string | null;
}

export interface SupportMessage {
  id: number;
  thread_id: number;
  sender: "user" | "admin" | "system";
  author_name: string;
  body: string;
  /** `system` marks a line the desk wrote itself, such as a handover. */
  kind: "chat" | "system";
  created_at: string;
}

/** One of the caller's own conversations, as the widget sees it. */
export interface SupportThreadSummary {
  id: number;
  subject: string;
  status: string;
  last_message_at: string;
  unread_for_user: number;
  created_at: string;
}

export interface SupportThreadsResponse {
  threads: SupportThreadSummary[];
  guest_token: string | null;
  staffed: boolean;
}

export interface SupportTranscript {
  thread: SupportThreadSummary;
  messages: SupportMessage[];
  typing: { who: "user" | "admin"; name: string } | null;
  staffed: boolean;
}

export interface SupportSendResponse {
  ok: true;
  thread: SupportThreadSummary;
  message: SupportMessage;
  messages: SupportMessage[];
  guest_token: string | null;
  staffed: boolean;
}

export interface AdminSupportThread {
  id: number;
  display_name: string;
  subject: string;
  status: string;
  last_message_at: string;
  unread_for_admin: number;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  last_body: string | null;
  message_count: number;
  assigned_admin_id: number | null;
  assigned_admin_name: string | null;
  visitor_online: boolean;
}

export interface SupportTransfer {
  created_at: string;
  note: string;
  from_name: string | null;
  to_name: string | null;
}

export interface AdminSupportRoster {
  id: number;
  name: string;
  email: string;
  role: string;
  online: boolean;
}

export interface LegalPage {
  slug: "terms" | "privacy";
  title: string;
  /** Plain text. "## " starts a heading; blank lines separate paragraphs. */
  body: string;
  updated_at: string;
}

export interface SiteSettings {
  phone?: string;
  address?: string;
  ig_url?: string;
  tiktok_url?: string;
  fb_url?: string;
  [key: string]: string | undefined;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin" | "super_admin";
  banned_at: string | null;
  created_at: string;
}

export interface Offer {
  id: number;
  title: string;
  description: string;
  badge: string;
  icon: string;
  valid_until: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
}

export interface PromoCode {
  id: number;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string;
  min_spend_fcfa: number;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  is_active: number;
  created_at: string;
}

export interface GiftCard {
  id: number;
  code: string;
  initial_value_fcfa: number;
  remaining_value_fcfa: number;
  is_active: number;
  created_at: string;
}

export interface WaitlistEntry {
  id: number;
  name: string;
  phone: string;
  party_size: number;
  note: string;
  status: "waiting" | "notified" | "seated" | "cancelled" | "no_show";
  joined_at: string;
  notified_at: string | null;
  seated_at: string | null;
}

export interface GalleryPhoto {
  id: number;
  user_id: number | null;
  submitter_name: string;
  caption: string;
  image_url: string;
  is_featured: number;
  is_approved: number;
  created_at: string;
}

export interface EventBooking {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  phone: string;
  event_type: string;
  date: string;
  time: string;
  guest_count: number;
  note: string;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
}

export interface TakeawayOrder {
  id: number;
  order_no: string;
  name: string;
  phone: string;
  items_json: string;
  total_fcfa: number;
  pickup_time: string;
  note: string;
  status: "pending" | "confirmed" | "ready" | "picked_up" | "cancelled";
  promo_code: string | null;
  gift_card_code: string | null;
  discount_fcfa: number;
  created_at: string;
}

export interface ReceiptSummary {
  id: number;
  date: string;
  time: string;
  party_size: number;
  status: string;
  payment_status: string;
  ccm_code: string | null;
  table_label: string | null;
  amount_fcfa: number | null;
  pay_method: string | null;
  created_at: string;
}

export const api = {
  me: () => request<{ user: User }>("/api/auth/me"),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  /** Resolves to a user, or to a 2FA challenge that must be answered first. */
  login: (email: string, password: string) =>
    request<LoginResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  verify2fa: (challenge: string, code: string) =>
    request<{ user: User }>("/api/auth/login/2fa", { method: "POST", body: JSON.stringify({ challenge, code }) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  logoutEverywhere: () => request<{ ok: true }>("/api/auth/logout-all", { method: "POST" }),

  menu: () => request<{ menu: MenuItem[] }>("/api/menu"),
  siteSettings: () => request<{ settings: SiteSettings }>("/api/site-settings"),
  legalPage: (slug: "terms" | "privacy") => request<{ page: LegalPage }>(`/api/legal/${slug}`),

  /** Whether "forgot password" can work, i.e. whether the server can send mail. */
  recoveryStatus: () =>
    request<{ self_service: boolean; code_length: number; expires_in_minutes: number }>("/api/recovery/status"),
  /** Step one: emails a 6-digit code to the address, if it has an account. */
  requestPasswordReset: (email: string) =>
    request<{ ok: true; message: string }>("/api/recovery/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  /** Step two: code plus new password, in one call. */
  redeemPasswordReset: (email: string, code: string, password: string) =>
    request<{ ok: true; message: string }>("/api/recovery/redeem", {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
    }),

  /** Every conversation the caller has had. */
  supportThreads: () => request<SupportThreadsResponse>("/api/support/threads/mine"),
  supportTranscript: (id: number) => request<SupportTranscript>(`/api/support/threads/mine/${id}`),
  /** Omitting `threadId` starts a new conversation. */
  sendSupportMessage: (body: string, threadId?: number | null, name?: string) =>
    request<SupportSendResponse>("/api/support/messages", {
      method: "POST",
      body: JSON.stringify({ body, thread_id: threadId ?? undefined, name }),
    }),
  supportTyping: (id: number, stopped = false) =>
    request<{ ok: true }>(`/api/support/threads/${id}/typing`, {
      method: "POST",
      body: JSON.stringify({ stopped }),
    }),
  popular: () => request<{ topReview: Review | null; topItems: MenuItem[] }>("/api/popular"),

  tables: (date?: string, time?: string) =>
    request<{ tables: RestaurantTable[] }>(`/api/tables${date && time ? `?date=${date}&time=${time}` : ""}`),

  myReservations: () => request<{ reservations: Reservation[] }>("/api/reservations"),
  createReservation: (input: { date: string; time: string; partySize: number; phone: string; note: string; tableId: number | null }) =>
    request<{ reservation: Reservation }>("/api/reservations", { method: "POST", body: JSON.stringify(input) }),
  /** Removes a cancelled or finished booking from the guest's own list. */
  hideReservation: (id: number) =>
    request<{ ok: true }>(`/api/reservations/${id}/hide`, { method: "DELETE" }),
  cancelReservation: (id: number) =>
    request<{ ok: true } | { requires_fee: true; fee_fcfa: number }>(`/api/reservations/${id}`, { method: "DELETE" }),

  myReceipts: () => request<{ receipts: ReceiptSummary[] }>("/api/account/receipts"),
  deleteAccount: (password: string) =>
    request<{ ok: true }>("/api/account", { method: "DELETE", body: JSON.stringify({ password }) }),
  downloadReceipt: async (id: number) => {
    const res = await fetch(`/api/receipts/${id}`, { credentials: "same-origin" });
    if (!res.ok) throw new ApiError(res.status, "Could not download receipt.");
    return res;
  },
  downloadTakeawayReceipt: async (orderNo: string) => {
    const res = await fetch(`/api/receipts/takeaway/${encodeURIComponent(orderNo)}`, { credentials: "same-origin" });
    if (!res.ok) throw new ApiError(res.status, "Could not download receipt.");
    return res;
  },

  changeName: (name: string) =>
    request<{ ok: true }>("/api/account/name", { method: "PATCH", body: JSON.stringify({ name }) }),
  changeEmail: (email: string, password: string) =>
    request<{ ok: true }>("/api/account/email", { method: "PATCH", body: JSON.stringify({ email, password }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/api/account/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),

  get2faStatus: () => request<{ enabled: boolean }>("/api/account/2fa/status"),
  setup2fa: () => request<{ secret: string; uri: string; qrDataUrl: string }>("/api/account/2fa/setup", { method: "POST" }),
  enable2fa: (code: string) => request<{ ok: true }>("/api/account/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disable2fa: (password: string) => request<{ ok: true }>("/api/account/2fa/disable", { method: "POST", body: JSON.stringify({ password }) }),

  getPasskeys: () => request<{ passkeys: { id: number; display_name: string; created_at: string }[] }>("/api/account/passkeys"),
  deletePasskey: (id: number) => request<{ ok: true }>(`/api/account/passkeys/${id}`, { method: "DELETE" }),

  reviews: () => request<{ reviews: Review[] }>("/api/reviews"),
  saveReview: (rating: number, text: string, media_urls: string[] = []) =>
    request<{ review: Review }>("/api/reviews", { method: "POST", body: JSON.stringify({ rating, text, media_urls }) }),
  deleteMyReview: () => request<{ ok: true }>("/api/reviews/mine", { method: "DELETE" }),
  voteReview: (id: number, vote: "like" | "dislike") =>
    request<{ ok: true; likes: number; dislikes: number; user_vote: "like" | "dislike" }>(`/api/reviews/${id}/vote`, { method: "POST", body: JSON.stringify({ vote }) }),
  unvoteReview: (id: number) =>
    request<{ ok: true; likes: number; dislikes: number; user_vote: null }>(`/api/reviews/${id}/vote`, { method: "DELETE" }),
  addReviewReply: (id: number, text: string) =>
    request<{ reply: ReviewReply }>(`/api/reviews/${id}/replies`, { method: "POST", body: JSON.stringify({ text }) }),
  deleteReviewReply: (replyId: number) =>
    request<{ ok: true }>(`/api/reviews/replies/${replyId}`, { method: "DELETE" }),

  // Offers
  offers: () => request<{ offers: Offer[] }>("/api/offers"),

  // Promo codes
  validatePromo: (code: string, spend_fcfa?: number) =>
    request<{ valid: true; code: string; type: string; value: number; description: string; discount_fcfa: number }>(
      "/api/promos/validate", { method: "POST", body: JSON.stringify({ code, spend_fcfa: spend_fcfa ?? 0 }) }
    ),

  // Gift cards
  validateGiftCard: (code: string) =>
    request<{ valid: true; code: string; initial_value_fcfa: number; remaining_value_fcfa: number }>(
      "/api/gift-cards/validate", { method: "POST", body: JSON.stringify({ code }) }
    ),

  // Waitlist
  waitlistInfo: () => request<{ waiting: number; est_wait_minutes: number }>("/api/waitlist"),
  joinWaitlist: (data: { name: string; phone: string; party_size: number; note?: string }) =>
    request<{ id: number; position: number; est_wait_minutes: number }>("/api/waitlist", { method: "POST", body: JSON.stringify(data) }),

  // Gallery
  gallery: () => request<{ photos: GalleryPhoto[] }>("/api/gallery"),
  submitPhoto: (data: { image_url: string; caption?: string }) =>
    request<{ ok: true; message: string }>("/api/gallery", { method: "POST", body: JSON.stringify(data) }),

  // Events
  bookEvent: (data: { name: string; email: string; phone: string; event_type: string; date: string; time: string; guest_count: number; note?: string }) =>
    request<{ ok: true }>("/api/events", { method: "POST", body: JSON.stringify(data) }),

  // Takeaway
  placeOrder: (data: { name: string; phone: string; pickup_time: string; items: { id: number; qty: number }[]; note?: string; promo_code?: string; gift_card_code?: string }) =>
    request<{
      ok: true;
      id: number;
      order_no: string;
      subtotal: number;
      discount_fcfa: number;
      total_fcfa: number;
      /** Takeaway is prepaid; false only when a discount covered it entirely. */
      payment_required: boolean;
      status: string;
    }>("/api/takeaway", { method: "POST", body: JSON.stringify(data) }),
  myOrders: () => request<{ orders: TakeawayOrder[] }>("/api/takeaway/my-orders"),

  // Admin review reply
  adminReplyToReview: (id: number, text: string) =>
    request<{ ok: true }>(`/api/admin/reviews/${id}/reply`, { method: "POST", body: JSON.stringify({ text }) }),
  adminDeleteReviewReply: (id: number) =>
    request<{ ok: true }>(`/api/admin/reviews/${id}/reply`, { method: "DELETE" }),

  /**
   * Pushes a MoMo PIN prompt to the customer's handset. Nothing is charged
   * until they approve it — poll `paymentStatus` until it resolves.
   */
  initiatePayment: (
    reservationId: number,
    momoPhone: string,
    promoCode?: string,
    giftCardCode?: string
  ) =>
    request<MomoInitiation>("/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({
        reservationId,
        momoPhone,
        promoCode: promoCode || undefined,
        giftCardCode: giftCardCode || undefined,
      }),
    }),

  paymentStatus: (reference: string) =>
    request<MomoStatus>(`/api/payments/${encodeURIComponent(reference)}/status`),

  /** Pushes a MoMo prompt for an existing takeaway order. */
  payTakeaway: (orderNo: string, momoPhone: string) =>
    request<{
      reference: string;
      order_no: string;
      amount_fcfa: number;
      momo_phone: string;
      expires_in_seconds: number;
      status: "pending";
    }>(`/api/takeaway/${encodeURIComponent(orderNo)}/pay`, {
      method: "POST",
      body: JSON.stringify({ momoPhone }),
    }),

  takeawayPaymentStatus: (reference: string) =>
    request<MomoStatus>(`/api/takeaway/pay/${encodeURIComponent(reference)}/status`),

  cancelTakeawayPayment: (reference: string) =>
    request<{ ok: true }>(`/api/takeaway/pay/${encodeURIComponent(reference)}/cancel`, { method: "POST" }),

  /** Admin door check. Pass a scanned `token` or a typed `code`. */
  verifyBooking: (input: { token?: string; code?: string }) =>
    request<VerifyResult>("/api/verify", { method: "POST", body: JSON.stringify(input) }),
  checkInBooking: (id: number) =>
    request<{ ok: true; booking: VerifiedBooking }>(`/api/verify/${id}/check-in`, { method: "POST" }),
  undoCheckIn: (id: number) =>
    request<{ ok: true }>(`/api/verify/${id}/undo-check-in`, { method: "POST" }),
  /** Hands over a paid takeaway order at the counter. */
  collectOrder: (id: number) =>
    request<{ ok: true; order: VerifiedOrder }>(`/api/verify/order/${id}/collect`, { method: "POST" }),
  undoCollect: (id: number) =>
    request<{ ok: true }>(`/api/verify/order/${id}/undo-collect`, { method: "POST" }),

  paymentReceipt: (reference: string) =>
    request<{ receipt: ReceiptData }>(`/api/payments/${encodeURIComponent(reference)}/receipt`),

  /** Abandons a pending prompt and releases any discount it was holding. */
  cancelPayment: (reference: string) =>
    request<{ ok: true; status: string }>(`/api/payments/${encodeURIComponent(reference)}/cancel`, {
      method: "POST",
    }),

  admin: {
    stats: () =>
      request<{ totalReservations: number; todayReservations: number; totalUsers: number; pendingPayments: number; totalRevenue: number }>("/api/admin/stats"),
    reservations: (params?: { date?: string; status?: string; q?: string }) => {
      const q = new URLSearchParams();
      if (params?.date) q.set("date", params.date);
      if (params?.status) q.set("status", params.status);
      if (params?.q) q.set("q", params.q);
      return request<{ reservations: (Reservation & { user_name: string; user_email: string })[] }>(
        `/api/admin/reservations${q.toString() ? "?" + q : ""}`
      );
    },
    updateReservation: (id: number, status: string) =>
      request<{ ok: true }>(`/api/admin/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    cancelReservation: (id: number, reason?: string) =>
      request<{ ok: true }>(`/api/admin/reservations/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason ?? "" }) }),
    uncancelReservation: (id: number) =>
      request<{ ok: true }>(`/api/admin/reservations/${id}/uncancel`, { method: "POST" }),

    tables: () => request<{ tables: (RestaurantTable & { today_count: number })[] }>("/api/admin/tables"),
    createTable: (data: { label: string; capacity: number; zone: string; pos_x: number; pos_y: number }) =>
      request<{ table: RestaurantTable }>("/api/admin/tables", { method: "POST", body: JSON.stringify(data) }),
    updateTable: (id: number, data: Omit<Partial<RestaurantTable>, "active"> & { active?: number | boolean }) =>
      request<{ ok: true }>(`/api/admin/tables/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteTable: (id: number) =>
      request<{ ok: true }>(`/api/admin/tables/${id}`, { method: "DELETE" }),

    users: () => request<{ users: AdminUser[] }>("/api/admin/users"),
    banUser: (id: number) =>
      request<{ ok: true }>(`/api/admin/users/${id}/ban`, { method: "PATCH" }),
    unbanUser: (id: number) =>
      request<{ ok: true }>(`/api/admin/users/${id}/unban`, { method: "PATCH" }),
    setUserRole: (id: number, role: "user" | "admin") =>
      request<{ ok: true }>(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    deleteUser: (id: number) =>
      request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

    getMenu: () => request<{ menu: MenuItem[] }>("/api/admin/menu"),
    createMenuItem: (item: Partial<MenuItem>) =>
      request<{ item: MenuItem }>("/api/admin/menu", { method: "POST", body: JSON.stringify(item) }),
    updateMenuItem: (id: number, item: Partial<MenuItem>) =>
      request<{ ok: true }>(`/api/admin/menu/${id}`, { method: "PATCH", body: JSON.stringify(item) }),
    deleteMenuItem: (id: number) =>
      request<{ ok: true }>(`/api/admin/menu/${id}`, { method: "DELETE" }),

    updateSettings: (updates: Record<string, string>) =>
      request<{ ok: true }>("/api/site-settings", { method: "PATCH", body: JSON.stringify(updates) }),

    /** Diagnostic only — proves Resend works. Does not issue or reveal reset codes. */
    sendTestEmail: (to?: string) =>
      request<{ ok: true; id?: string; to: string }>("/api/recovery/admin/test-email", {
        method: "POST",
        body: JSON.stringify({ to }),
      }),

    supportThreads: (opts: { status?: string; mine?: boolean } = {}) => {
      const q = new URLSearchParams();
      if (opts.status) q.set("status", opts.status);
      if (opts.mine) q.set("mine", "1");
      const qs = q.toString();
      return request<{ threads: AdminSupportThread[]; online_admins: { id: number; name: string }[] }>(
        `/api/support/threads${qs ? `?${qs}` : ""}`
      );
    },
    supportThread: (id: number) =>
      request<{
        thread: AdminSupportThread;
        messages: SupportMessage[];
        transfers: SupportTransfer[];
        typing: { who: "user" | "admin"; name: string } | null;
        visitor_online: boolean;
        online_admins: { id: number; name: string }[];
      }>(`/api/support/threads/${id}`),
    replySupport: (id: number, body: string) =>
      request<{ ok: true; message: SupportMessage; messages: SupportMessage[] }>(
        `/api/support/threads/${id}/reply`,
        { method: "POST", body: JSON.stringify({ body }) }
      ),
    supportTyping: (id: number, stopped = false) =>
      request<{ ok: true }>(`/api/support/threads/${id}/typing`, {
        method: "POST",
        body: JSON.stringify({ stopped }),
      }),
    supportAdmins: () => request<{ admins: AdminSupportRoster[] }>("/api/support/admins"),
    forwardSupport: (id: number, toAdminId: number, note: string) =>
      request<{ ok: true; assigned_admin_id: number; assigned_admin_name: string }>(
        `/api/support/threads/${id}/forward`,
        { method: "POST", body: JSON.stringify({ to_admin_id: toAdminId, note }) }
      ),
    setSupportStatus: (id: number, status: "open" | "closed") =>
      request<{ ok: true }>(`/api/support/threads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    deleteSupportThread: (id: number) =>
      request<{ ok: true }>(`/api/support/threads/${id}`, { method: "DELETE" }),

    legalPages: () => request<{ pages: LegalPage[] }>("/api/legal"),
    updateLegalPage: (slug: "terms" | "privacy", data: { title: string; body: string }) =>
      request<{ ok: true; page: LegalPage }>(`/api/legal/${slug}`, { method: "PUT", body: JSON.stringify(data) }),

    reviews: () => request<{ reviews: (Review & { author: string })[] }>("/api/admin/reviews"),
    deleteReview: (id: number) => request<{ ok: true }>(`/api/admin/reviews/${id}`, { method: "DELETE" }),
    payments: () =>
      request<{ payments: (Payment & { res_date: string; res_time: string; user_name: string })[] }>("/api/admin/payments"),
    updatePayment: (id: number, status: "failed" | "completed") =>
      request<{ ok: true }>(`/api/admin/payments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    receipts: () =>
      request<{ receipts: (ReceiptSummary & { user_name: string; user_email: string; pay_reference: string | null })[] }>("/api/admin/receipts"),

    analytics: () => request<AdminAnalytics>("/api/admin/analytics"),

    offers: () => request<{ offers: Offer[] }>("/api/offers/all"),
    createOffer: (data: Partial<Offer>) =>
      request<{ ok: true }>("/api/offers", { method: "POST", body: JSON.stringify(data) }),
    updateOffer: (id: number, data: Partial<Offer>) =>
      request<{ ok: true }>(`/api/offers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteOffer: (id: number) =>
      request<{ ok: true }>(`/api/offers/${id}`, { method: "DELETE" }),

    promoCodes: () => request<{ codes: PromoCode[] }>("/api/promos"),
    createPromoCode: (data: Partial<PromoCode>) =>
      request<{ ok: true }>("/api/promos", { method: "POST", body: JSON.stringify(data) }),
    togglePromoCode: (id: number, is_active: boolean) =>
      request<{ ok: true }>(`/api/promos/${id}`, { method: "PATCH", body: JSON.stringify({ is_active }) }),
    deletePromoCode: (id: number) =>
      request<{ ok: true }>(`/api/promos/${id}`, { method: "DELETE" }),

    giftCards: () => request<{ cards: GiftCard[] }>("/api/gift-cards"),
    createGiftCard: (value_fcfa: number) =>
      request<{ code: string; value_fcfa: number }>("/api/gift-cards", { method: "POST", body: JSON.stringify({ value_fcfa }) }),
    deactivateGiftCard: (id: number) =>
      request<{ ok: true }>(`/api/gift-cards/${id}`, { method: "DELETE" }),
    toggleGiftCard: (id: number) =>
      request<{ ok: true; is_active: boolean }>(`/api/gift-cards/${id}`, { method: "PATCH" }),

    waitlist: () => request<{ entries: WaitlistEntry[] }>("/api/waitlist/all"),
    updateWaitlistEntry: (id: number, status: string) =>
      request<{ ok: true }>(`/api/waitlist/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    clearWaitlist: () => request<{ ok: true }>("/api/waitlist/clear", { method: "DELETE" }),

    galleryAll: () => request<{ photos: GalleryPhoto[] }>("/api/gallery/all"),
    galleryPending: () => request<{ photos: GalleryPhoto[] }>("/api/gallery/pending"),
    uploadPhoto: (data: { image_url: string; caption?: string }) =>
      request<{ ok: true; photo: GalleryPhoto }>("/api/gallery/admin-upload", { method: "POST", body: JSON.stringify(data) }),
    updatePhoto: (id: number, data: { is_approved?: boolean; is_featured?: boolean }) =>
      request<{ ok: true }>(`/api/gallery/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deletePhoto: (id: number) =>
      request<{ ok: true }>(`/api/gallery/${id}`, { method: "DELETE" }),

    events: () => request<{ bookings: EventBooking[] }>("/api/events"),
    createEvent: (data: { name: string; email: string; phone: string; event_type: string; date: string; time: string; guest_count: number; note?: string; status?: string }) =>
      request<{ ok: true }>("/api/events/admin-create", { method: "POST", body: JSON.stringify(data) }),
    updateEvent: (id: number, status: "pending" | "confirmed" | "cancelled") =>
      request<{ ok: true }>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    deleteEvent: (id: number) =>
      request<{ ok: true }>(`/api/events/${id}`, { method: "DELETE" }),

    takeaway: () => request<{ orders: (TakeawayOrder & { user_name: string | null })[] }>("/api/takeaway"),
    updateTakeawayStatus: (id: number, status: string) =>
      request<{ ok: true }>(`/api/takeaway/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  },
};
