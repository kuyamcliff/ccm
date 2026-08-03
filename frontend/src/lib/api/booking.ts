import { http } from "../http";
import type { Booking, DiningTable, MomoPrompt, MomoStatus } from "./types";

/**
 * What the deposit was before the owner could set it.
 *
 * The price is a site setting now — read it with `useVenue().depositFcfa`,
 * which is what every screen showing a figure must use. This is only the
 * fallback for the moment before settings have loaded, and it matches the
 * server's own default, so the two can never disagree about what to charge.
 */
export const DEFAULT_DEPOSIT_FCFA = 2500;

/** Likewise for cancelling inside the hour. */
export const DEFAULT_LATE_CANCEL_FCFA = 1500;

/** Half-hour slots, 09:00 through 22:30 — the window the server accepts. */
export const SLOTS: string[] = Array.from({ length: 28 }, (_, i) => {
  const hour = 9 + Math.floor(i / 2);
  return `${String(hour).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`;
});

export const MAX_PARTY = 30;

export const bookingApi = {
  /** Passing a date and time marks each table as free or taken for that slot. */
  tables: (date?: string, time?: string) =>
    http.get<{ tables: DiningTable[] }>(`/api/tables${http.query({ date, time })}`).then((r) => r.tables),

  mine: () => http.get<{ reservations: Booking[] }>("/api/reservations").then((r) => r.reservations),

  create: (input: { date: string; time: string; partySize: number; phone: string; note: string; tableId: number | null }) =>
    http.post<{ reservation: Booking }>("/api/reservations", input).then((r) => r.reservation),

  /**
   * Cancels a booking. Close to the sitting the restaurant keeps a fee, and the
   * server answers with that instead of cancelling, so the guest can decide.
   */
  cancel: (id: number) => http.del<{ ok: true } | { requires_fee: true; fee_fcfa: number }>(`/api/reservations/${id}`),

  /** Clears a finished or cancelled booking off the guest's own list only. */
  hide: (id: number) => http.del<{ ok: true }>(`/api/reservations/${id}/hide`),

  /**
   * Pushes a mobile-money PIN prompt to the guest's handset. Nothing is taken
   * until they approve it, so the caller polls `paymentStatus` until it settles.
   */
  payDeposit: (input: { reservationId: number; momoPhone: string; promoCode?: string; giftCardCode?: string }) =>
    http.post<MomoPrompt>("/api/payments/initiate", {
      reservationId: input.reservationId,
      momoPhone: input.momoPhone,
      promoCode: input.promoCode || undefined,
      giftCardCode: input.giftCardCode || undefined,
    }),

  paymentStatus: (reference: string) => http.get<MomoStatus>(`/api/payments/${encodeURIComponent(reference)}/status`),

  /** Abandons a pending prompt and releases any discount it was holding. */
  abandonPayment: (reference: string) =>
    http.post<{ ok: true; status: string }>(`/api/payments/${encodeURIComponent(reference)}/cancel`),

  receipt: (reference: string) =>
    http.get<{ receipt: Record<string, unknown> }>(`/api/payments/${encodeURIComponent(reference)}/receipt`),
};
