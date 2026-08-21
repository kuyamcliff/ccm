import { ApiError, http } from "../http";
import type { Booking, DiningTable, FloorFixture, MomoPrompt, MomoStatus } from "./types";

/** A table the server says is still free at the slot the guest wanted. */
export interface AlternativeTable {
  id: number;
  label: string;
  zone: string;
  capacity: number;
}

/** What the server offers instead when the slot has just gone. */
export interface BookingAlternatives {
  times: string[];
  tables: AlternativeTable[];
}

/**
 * Why a booking was refused, in a word the app can switch on.
 *
 * `table` — somebody else took that table for that slot.
 * `guest` — this guest already has a table at that exact slot.
 */
export type BookingClashReason = "table" | "guest";

export interface BookingClash {
  reason: BookingClashReason;
  /** Absent when the day is too full to suggest anything. */
  alternatives: BookingAlternatives | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads the suggestions off a refused booking, if there are any.
 *
 * Checked rather than asserted, field by field, because this arrives over the
 * network on the unhappy path: a booking that has already failed must not
 * become a blank screen because the shape was not what we expected. Anything
 * unreadable simply comes back as nothing, and the guest gets the plain
 * refusal they would have got before.
 */
export function parseBookingAlternatives(value: unknown): BookingAlternatives | null {
  if (!isRecord(value)) return null;
  const raw = value.alternatives;
  if (!isRecord(raw)) return null;

  const times = Array.isArray(raw.times) ? raw.times.filter((t): t is string => /^\d{2}:\d{2}$/.test(String(t))) : [];
  const tables = Array.isArray(raw.tables)
    ? raw.tables.flatMap((entry): AlternativeTable[] => {
        if (!isRecord(entry)) return [];
        const { id, label, zone, capacity } = entry;
        if (typeof id !== "number" || !Number.isFinite(id)) return [];
        if (typeof label !== "string" || label === "") return [];
        if (typeof capacity !== "number" || !Number.isFinite(capacity)) return [];
        return [{ id, label, zone: typeof zone === "string" ? zone : "", capacity }];
      })
    : [];

  if (times.length === 0 && tables.length === 0) return null;
  return { times, tables };
}

/**
 * Reads a booking clash off a failed request, or nothing if it was not one.
 *
 * The reason is taken from the server's own `clash` word rather than from its
 * English sentence, so a screen can say this in the guest's language instead
 * of pattern-matching prose it does not own.
 */
export function clashFromError(error: unknown): BookingClash | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (!isRecord(error.body)) return null;
  const reason = error.body.clash;
  if (reason !== "table" && reason !== "guest") return null;
  return { reason, alternatives: parseBookingAlternatives(error.body) };
}

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

  /** The room in full — bookable tables plus the fixtures drawn around them. */
  floor: (date?: string, time?: string) =>
    http
      .get<{ tables: DiningTable[]; fixtures?: FloorFixture[] }>(`/api/tables${http.query({ date, time })}`)
      .then((r) => ({ tables: r.tables, fixtures: r.fixtures ?? [] })),

  mine: () => http.get<{ reservations: Booking[] }>("/api/reservations").then((r) => r.reservations),

  /**
   * Where the booking lives as a calendar entry.
   *
   * An address rather than a fetch: the phone's own calendar app is what
   * should open this, and that only happens when the browser follows a link
   * to something the server labels as a calendar. A blob built here would
   * land in Downloads instead, which is not adding anything to a calendar.
   */
  calendarUrl: (id: number) => `/api/reservations/${id}/calendar.ics`,

  create: (input: {
    date: string;
    time: string;
    partySize: number;
    phone: string;
    note: string;
    tableId: number | null;
    /** Food and drink to have ready. Priced by the server, never from here. */
    items?: { id: number; qty: number }[];
  }) => http.post<{ reservation: Booking }>("/api/reservations", input).then((r) => r.reservation),

  /**
   * Cancels a booking.
   *
   * Inside the last hour of a paid booking the restaurant keeps a fee, and the
   * server quotes it as a **402** rather than cancelling: read `fee_fcfa` off
   * the error, show it, and call again with `acceptFee` once the guest has said
   * yes to that number. Two steps on purpose, so nobody is charged a fee they
   * were never shown.
   */
  cancel: (id: number, acceptFee = false) =>
    http.del<{ ok: true; fee_fcfa?: number }>(`/api/reservations/${id}`, acceptFee ? { accept_fee: true } : undefined),

  /** Clears a finished or cancelled booking off the guest's own list only. */
  hide: (id: number) => http.del<{ ok: true }>(`/api/reservations/${id}/hide`),

  /**
   * Pushes a mobile-money PIN prompt to the guest's handset. Nothing is taken
   * until they approve it, so the caller polls `paymentStatus` until it settles.
   */
  payDeposit: (input: {
    reservationId: number;
    momoPhone: string;
    promoCode?: string;
    giftCardCode?: string;
    /** Spends as much of the guest's points balance as the rules allow. */
    usePoints?: boolean;
    wallet?: string;
    /** The same value on every retry of one attempt, so a request that was
     *  sent twice is charged once. */
    idempotencyKey: string;
  }) =>
    http.post<MomoPrompt>(
      "/api/payments/initiate",
      {
        reservationId: input.reservationId,
        momoPhone: input.momoPhone,
        wallet: input.wallet || undefined,
        promoCode: input.promoCode || undefined,
        giftCardCode: input.giftCardCode || undefined,
        usePoints: input.usePoints || undefined,
      },
      { "Idempotency-Key": input.idempotencyKey }
    ),

  paymentStatus: (reference: string) => http.get<MomoStatus>(`/api/payments/${encodeURIComponent(reference)}/status`),

  /** Abandons a pending prompt and releases any discount it was holding. */
  abandonPayment: (reference: string) =>
    http.post<{ ok: true; status: string }>(`/api/payments/${encodeURIComponent(reference)}/cancel`),

  receipt: (reference: string) =>
    http.get<{ receipt: Record<string, unknown> }>(`/api/payments/${encodeURIComponent(reference)}/receipt`),
};
