import { bookingApi } from "./booking";
import { deskApi } from "./desk";
import { meApi } from "./me";
import { orderApi } from "./orders";
import { publicApi } from "./public";
import { deskSupportApi, supportApi } from "./support";

/**
 * The whole API surface, in one object.
 *
 *   api.booking.create(...)   api.desk.bookings.list(...)
 *
 * Grouped by what a person is doing, not by which Express router happens to
 * serve it.
 */
export const api = {
  me: meApi,
  site: publicApi,
  booking: bookingApi,
  orders: orderApi,
  support: supportApi,
  desk: deskApi,
  deskSupport: deskSupportApi,
};

export * from "./types";
export { DEFAULT_DEPOSIT_FCFA, DEFAULT_LATE_CANCEL_FCFA, SLOTS, MAX_PARTY, clashFromError } from "./booking";
export type { AlternativeTable, BookingAlternatives, BookingClash, BookingClashReason } from "./booking";
