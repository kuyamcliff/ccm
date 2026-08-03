/**
 * The shape of everything the API returns.
 *
 * These mirror the server's SQL rows, which is why booleans arrive as 0 or 1
 * and every timestamp is a "YYYY-MM-DD HH:MM:SS" string in UTC. Nothing is
 * prettied up here — the display layer does that, once, on the way to a screen.
 */

export type Role = "user" | "admin" | "super_admin";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

/** A correct password does not always mean a session: 2FA can intervene. */
export type LoginOutcome = { user: User } | { requires_2fa: true; challenge: string };

export function isTwoFactorChallenge(value: LoginOutcome): value is { requires_2fa: true; challenge: string } {
  return "requires_2fa" in value;
}

export interface SiteSettings {
  phone?: string;
  address?: string;
  city?: string;
  region?: string;
  hours?: string;
  tiktok_url?: string;
  ig_url?: string;
  fb_url?: string;
  /* Money, but delivered as strings like every other setting — site_settings is
     a key/value table. Read them through `useVenue`, which parses and falls
     back, rather than pulling them out here. */
  booking_deposit_fcfa?: string;
  late_cancel_fee_fcfa?: string;
}

export interface MenuItem {
  id: number;
  category: string;
  name: string;
  description: string;
  price_fcfa: number | null;
  /** Used when a dish is priced by weight or by market rate. */
  price_label: string | null;
  image_url: string | null;
  position: number;
  is_active: number;
  /** JSON array as a string, e.g. '["spicy"]'. */
  dietary_tags: string;
}

export interface DiningTable {
  id: number;
  label: string;
  capacity: number;
  zone: string;
  pos_x: number;
  pos_y: number;
  active: number;
  /** Only present when the caller asked about a specific date and time. */
  available?: boolean;
}

export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed";
export type PaymentState = "unpaid" | "paid" | "refunded";

export interface Booking {
  id: number;
  date: string;
  time: string;
  party_size: number;
  phone: string;
  note: string;
  status: BookingStatus;
  payment_status: PaymentState;
  cancellation_fee_fcfa: number;
  /** The code the guest shows at the door. Null until the booking is settled. */
  ccm_code: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  checked_in_at: string | null;
  table_label?: string | null;
  table_zone?: string | null;
  created_at: string;
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
  /** True when this reviewer actually turned up to a booking. */
  is_verified_diner: boolean;
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

export const EVENT_TYPES = ["birthday", "corporate", "private_dining", "wedding", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventEnquiry {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  phone: string;
  event_type: EventType;
  date: string;
  time: string;
  guest_count: number;
  note: string;
  status: "pending" | "confirmed" | "cancelled";
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

export interface OrderLine {
  name: string;
  qty: number;
  price: number;
}

export type OrderStatus = "pending" | "confirmed" | "ready" | "picked_up" | "cancelled";

export interface TakeawayOrder {
  id: number;
  order_no: string;
  name: string;
  phone: string;
  /** JSON array of OrderLine, as stored. */
  items_json: string;
  total_fcfa: number;
  pickup_time: string;
  note: string;
  status: OrderStatus;
  promo_code: string | null;
  gift_card_code: string | null;
  discount_fcfa: number;
  payment_status?: PaymentState;
  created_at: string;
}

export interface Payment {
  id: number;
  status: "pending" | "completed" | "failed";
  amount_fcfa: number;
  reference: string;
  type: string;
  method?: string;
}

/** What comes back after a mobile-money prompt is pushed to a handset. */
export interface MomoPrompt {
  payment_id: number;
  reference: string;
  status: "pending" | "completed";
  amount_fcfa: number;
  discount_fcfa: number;
  method: string;
  momo_phone?: string;
  expires_in_seconds?: number;
  /** True when a promo or gift card covered the whole amount. */
  zero_cost: boolean;
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

export interface LegalPage {
  slug: "terms" | "privacy";
  title: string;
  /** Plain text. "## " opens a heading; a blank line separates paragraphs. */
  body: string;
  updated_at: string;
}

export interface LoyaltyLedgerEntry {
  amount: number;
  reason: string;
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

/* ── Support desk ─────────────────────────────────────────────────────── */

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

export interface SupportThread {
  id: number;
  subject: string;
  status: string;
  last_message_at: string;
  unread_for_user: number;
  created_at: string;
}

export interface DeskThread {
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

export interface TypingState {
  who: "user" | "admin";
  name: string;
}

/* ── Door ─────────────────────────────────────────────────────────────── */

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

export interface VerifiedOrder {
  id: number;
  code: string;
  customer_name: string;
  phone: string;
  items: OrderLine[];
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

export type VerifyOutcome =
  | "valid"
  | "unpaid"
  | "not_yet"
  | "not_ready"
  | "expired"
  | "already_used"
  | "cancelled"
  | "not_found"
  | "forged"
  | "unreadable";

export interface VerifyResult {
  /** `valid` means admit or hand over; everything else needs a human decision. */
  outcome: VerifyOutcome;
  message: string;
  source: "scan" | "manual";
  kind?: "reservation" | "takeaway";
  booking?: VerifiedBooking;
  order?: VerifiedOrder;
}

/* ── Staff console ────────────────────────────────────────────────────── */

export interface DeskUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  banned_at: string | null;
  created_at: string;
}

export interface DeskStats {
  totalReservations: number;
  todayReservations: number;
  totalUsers: number;
  pendingPayments: number;
  totalRevenue: number;
}

export interface DeskAnalytics {
  revenueByDay: { day: string; revenue: number; payments: number }[];
  peakHours: { hour: string; count: number }[];
  newUsersByDay: { day: string; count: number }[];
  reviewSummary: { avg_rating: number | null; total: number };
  topMenuItems: { name: string; qty: number; revenue: number }[];
  busiestDays: { weekday: number; count: number }[];
  window30: { bookings: number; covers: number; cancelled: number; arrived: number };
  /** The same length of window immediately before, for direction of travel. */
  previous: { bookings: number; covers: number; revenue: number };
}

export interface AuditEntry {
  id: number;
  actor_id: number | null;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: string;
  created_at: string;
}

export type DeskBooking = Booking & { user_name: string; user_email: string };
export type DeskTable = DiningTable & { today_count: number };
export type DeskPayment = Payment & { res_date: string; res_time: string; user_name: string };
export type DeskReceipt = ReceiptSummary & { user_name: string; user_email: string; pay_reference: string | null };
export type DeskOrder = TakeawayOrder & { user_name: string | null };
