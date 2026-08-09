import { http } from "../http";
import type { MomoStatus, TakeawayOrder } from "./types";

/** Collection orders. Prepaid, so an order and its payment are two steps. */
export const orderApi = {
  place: (input: {
    name: string;
    phone: string;
    pickup_time: string;
    items: { id: number; qty: number }[];
    note?: string;
    promo_code?: string;
    gift_card_code?: string;
    /** Spends as much of the guest's points balance as the rules allow. The
     *  server decides how many that is; the browser only says yes. */
    use_points?: boolean;
  }) =>
    http.post<{
      ok: true;
      id: number;
      order_no: string;
      subtotal: number;
      discount_fcfa: number;
      points_spent: number;
      points_value_fcfa: number;
      total_fcfa: number;
      /** False only when a discount covered the order entirely. */
      payment_required: boolean;
      status: string;
    }>("/api/takeaway", input),

  pay: (orderNo: string, momoPhone: string, idempotencyKey: string) =>
    http.post<{
      reference: string;
      order_no: string;
      amount_fcfa: number;
      momo_phone: string;
      expires_in_seconds: number;
      status: "pending";
    }>(
      `/api/takeaway/${encodeURIComponent(orderNo)}/pay`,
      { momoPhone },
      { "Idempotency-Key": idempotencyKey }
    ),

  paymentStatus: (reference: string) =>
    http.get<MomoStatus>(`/api/takeaway/pay/${encodeURIComponent(reference)}/status`),

  abandonPayment: (reference: string) =>
    http.post<{ ok: true }>(`/api/takeaway/pay/${encodeURIComponent(reference)}/cancel`),

  mine: () => http.get<{ orders: TakeawayOrder[] }>("/api/takeaway/my-orders").then((r) => r.orders),
};
