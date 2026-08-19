export type Role = "user" | "admin" | "super_admin" | "owner";
export interface User { id: number; name: string; email: string; role: Role; }
export type AdminScope = "door" | "bookings" | "takeaway" | "queue" | "floor" | "menu" | "offers" | "gallery" | "reviews" | "events" | "payments" | "promos" | "giftcards" | "messages" | "guests" | "insights" | "settings" | "legal";
export type AdminAction = "view" | "create" | "edit" | "delete" | "cancel" | "refund" | "export" | "manage";
export interface ScopeInfo { key: AdminScope; label: string; hint: string; }
export interface StaffAccess { id: number; name: string; email: string; role: "admin" | "super_admin"; banned_at: string | null; created_at: string; scopes: Record<AdminScope, boolean>; actions: Record<AdminScope, Record<AdminAction, boolean>>; }
export type LoginOutcome = { user: User } | { requires_2fa: true; challenge: string };
export function isTwoFactorChallenge(value: LoginOutcome): value is { requires_2fa: true; challenge: string } { return "requires_2fa" in value; }
export interface SiteSettings { phone?: string; address?: string; city?: string; region?: string; hours?: string; tiktok_url?: string; ig_url?: string; fb_url?: string; site_config_json?: string; booking_deposit_fcfa?: string; late_cancel_fee_fcfa?: string; loyalty_point_value_fcfa?: string; loyalty_min_redeem_points?: string; loyalty_max_redeem_percent?: string; }
export interface MenuItem { id: number; category: string; name: string; description: string; price_fcfa: number | null; price_label: string | null; image_url: string | null; position: number; is_active: number; /** On the menu but not available today. Distinct from is_active, which removes it entirely. */ sold_out: number; dietary_tags: string; }
export type FixtureKind = "grill" | "tv" | "bar" | "door" | "toilets" | "kitchen" | "speaker" | "plant";
export interface FloorFixture { id: number; kind: FixtureKind; label: string; pos_x: number; pos_y: number; width: number; height: number; }
export interface DiningTable { id: number; label: string; capacity: number; zone: string; pos_x: number; pos_y: number; active: number; available?: boolean; }
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed";
export type PaymentState = "unpaid" | "paid" | "refunded";
export interface Booking { id: number; date: string; time: string; party_size: number; phone: string; note: string; status: BookingStatus; payment_status: PaymentState; cancellation_fee_fcfa: number; ccm_code: string | null; cancelled_at: string | null; cancel_reason: string | null; checked_in_at: string | null; table_label?: string | null; table_zone?: string | null; created_at: string; amount_fcfa?: number | null; discount_fcfa?: number | null; pay_method?: string | null; pay_reference?: string | null; items_json?: string | null; items_total_fcfa?: number | null; deposit_fcfa?: number | null; }
export interface ReviewReply { id: number; review_id: number; user_id: number; author: string; text: string; created_at: string; }
export interface Review { id: number; rating: number; text: string; author: string; user_id: number; created_at: string; updated_at: string; media_urls: string[]; likes: number; dislikes: number; user_vote: "like" | "dislike" | null; replies: ReviewReply[]; admin_reply: string | null; admin_reply_at: string | null; is_verified_diner: boolean; }
export interface Offer { id: number; title: string; description: string; badge: string; icon: string; valid_until: string | null; is_active: number; sort_order: number; created_at: string; }
export interface GalleryPhoto { id: number; user_id: number | null; submitter_name: string; caption: string; image_url: string; is_featured: number; is_approved: number; created_at: string; }
export const EVENT_TYPES = ["birthday", "corporate", "private_dining", "wedding", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export interface EventEnquiry { id: number; user_id: number | null; name: string; email: string; phone: string; event_type: EventType; date: string; time: string; guest_count: number; note: string; status: "pending" | "confirmed" | "cancelled"; created_at: string; }
export interface WaitlistEntry { id: number; name: string; phone: string; party_size: number; note: string; status: "waiting" | "notified" | "seated" | "cancelled" | "no_show"; joined_at: string; notified_at: string | null; seated_at: string | null; }
export interface OrderLine { name: string; qty: number; price: number; id?: number; }
export type OrderStatus = "awaiting_payment" | "pending" | "confirmed" | "ready" | "picked_up" | "cancelled";
export interface TakeawayOrder { id: number; order_no: string; name: string; phone: string; items_json: string; total_fcfa: number; pickup_time: string; note: string; status: OrderStatus; promo_code: string | null; gift_card_code: string | null; discount_fcfa: number; payment_status?: PaymentState; created_at: string; }
export interface Payment { id: number; status: "pending" | "completed" | "failed"; amount_fcfa: number; reference: string; type: string; method?: string; }
export interface MomoPrompt { payment_id: number; reference: string; status: "pending" | "completed"; amount_fcfa: number; discount_fcfa: number; points_spent: number; method: string; momo_phone?: string; payment_url?: string | null; expires_in_seconds?: number; zero_cost: boolean; }
export interface MomoStatus { reference: string; status: "pending" | "completed" | "failed"; amount_fcfa: number; discount_fcfa: number; method: string; message: string | null; expires_in_seconds: number; }
export interface ReceiptSummary { id: number; date: string; time: string; party_size: number; status: string; payment_status: string; ccm_code: string | null; table_label: string | null; amount_fcfa: number | null; pay_method: string | null; created_at: string; }
export interface LegalPage { slug: "terms" | "privacy"; title: string; title_fr: string; body: string; body_fr: string; updated_at: string; }
export interface LoyaltyLedgerEntry { amount: number; reason: string; created_at: string; }
export interface LoyaltyRules { point_value_fcfa: number; min_redeem_points: number; max_redeem_percent: number; fcfa_per_point: number; }
export interface Loyalty { points_balance: number; value_fcfa: number; spendable: boolean; rules: LoyaltyRules; ledger: LoyaltyLedgerEntry[]; }
export interface PromoCode { id: number; code: string; type: "percent" | "flat"; value: number; description: string; min_spend_fcfa: number; max_uses: number | null; uses_count: number; expires_at: string | null; is_active: number; created_at: string; }
export interface GiftCard { id: number; code: string; initial_value_fcfa: number; remaining_value_fcfa: number; is_active: number; created_at: string; }
export interface SupportMessage { id: number; thread_id: number; sender: "user" | "admin" | "system"; author_name: string; body: string; kind: "chat" | "system"; created_at: string; }
export interface SupportThread { id: number; subject: string; status: string; last_message_at: string; unread_for_user: number; created_at: string; }
export interface DeskThread { id: number; display_name: string; subject: string; status: string; last_message_at: string; unread_for_admin: number; created_at: string; user_email: string | null; user_name: string | null; last_body: string | null; message_count: number; assigned_admin_id: number | null; assigned_admin_name: string | null; visitor_online: boolean; }
export interface TypingState { who: "user" | "admin"; name: string; }
export interface VerifiedBooking { id: number; code: string; guest_name: string; date: string; time: string; party_size: number; phone: string; note: string | null; table_label: string | null; status: string; payment_status: string; amount_fcfa: number | null; checked_in_at: string | null; checked_in_by: string | null; }
export interface VerifiedOrder { id: number; code: string; customer_name: string; phone: string; items: OrderLine[]; pickup_time: string; note: string | null; total_fcfa: number; discount_fcfa: number; status: string; payment_status: string; collected_at: string | null; collected_by: string | null; created_at: string; }
export type VerifyOutcome = "valid" | "unpaid" | "not_yet" | "not_ready" | "expired" | "already_used" | "cancelled" | "not_found" | "forged" | "unreadable";
export interface VerifyResult { outcome: VerifyOutcome; message: string; source: "scan" | "manual"; kind?: "reservation" | "takeaway"; booking?: VerifiedBooking; order?: VerifiedOrder; }
export interface DeskUser { id: number; name: string; email: string; role: Role; banned_at: string | null; created_at: string; }
export interface DeskStats { totalReservations: number; todayReservations: number; totalUsers: number; pendingPayments: number; totalRevenue: number; }
export interface DeskAnalytics { revenueByDay: { day: string; revenue: number; payments: number }[]; peakHours: { hour: string; count: number }[]; newUsersByDay: { day: string; count: number }[]; reviewSummary: { avg_rating: number | null; total: number }; topMenuItems: { name: string; qty: number; revenue: number }[]; busiestDays: { weekday: number; count: number }[]; window30: { bookings: number; covers: number; cancelled: number; arrived: number }; previous: { bookings: number; covers: number; revenue: number }; }
export interface AuditEntry { id: number; actor_id: number | null; actor_name: string; action: string; target_type: string; target_id: string | null; detail: string; created_at: string; }
export type DeskBooking = Booking & { user_name: string; user_email: string };
export type DeskTable = DiningTable & { today_count: number; booking_id: number | null; booking_time: string | null; booking_party: number | null; booking_status: "confirmed" | "pending_payment" | null; booking_code: string | null; booking_phone: string | null; booking_note: string | null; booking_checked_in: string | null; booking_name: string | null; };
export type DeskPayment = Payment & { res_date: string; res_time: string; user_name: string };
export type DeskReceipt = ReceiptSummary & { user_name: string; user_email: string; pay_reference: string | null };
export type DeskOrder = TakeawayOrder & { user_name: string | null };
