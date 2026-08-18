import { http } from "../http";
import type { MomoStatus, TakeawayOrder } from "./types";

type WalletId = "mtn_momo" | "orange_money";

export const orderApi = {
  place: (input: { name: string; phone: string; pickup_time: string; items: { id: number; qty: number }[]; note?: string; promo_code?: string; gift_card_code?: string; use_points?: boolean }) =>
    http.post<{ ok: true; id: number; order_no: string; subtotal: number; discount_fcfa: number; points_spent: number; points_value_fcfa: number; total_fcfa: number; payment_required: boolean; status: string }>("/api/takeaway", input),

  pay: (orderNo: string, momoPhone: string, walletOrIdempotency: WalletId | string, maybeIdempotency?: string) => {
    const wallet: WalletId = walletOrIdempotency === "mtn_momo" || walletOrIdempotency === "orange_money" ? walletOrIdempotency : "mtn_momo";
    const idempotencyKey = maybeIdempotency ?? walletOrIdempotency;
    return http.post<{ reference: string; order_no: string; amount_fcfa: number; momo_phone: string; expires_in_seconds: number; status: "pending" | "completed"; payment_url?: string | null }>(
      `/api/takeaway/${encodeURIComponent(orderNo)}/pay`,
      { momoPhone, wallet },
      { "Idempotency-Key": idempotencyKey }
    );
  },

  paymentStatus: (reference: string) => http.get<MomoStatus>(`/api/takeaway/pay/${encodeURIComponent(reference)}/status`),
  abandonPayment: (reference: string) => http.post<{ ok: true }>(`/api/takeaway/pay/${encodeURIComponent(reference)}/cancel`),
  mine: () => http.get<{ orders: TakeawayOrder[] }>("/api/takeaway/my-orders").then((r) => r.orders),
};
