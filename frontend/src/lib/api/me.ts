import { fetchFile, http } from "../http";
import type { LoginOutcome, LoyaltyLedgerEntry, ReceiptSummary, User } from "./types";

/** Sessions, the account, and everything filed under it. */
export const meApi = {
  current: () => http.get<{ user: User }>("/api/auth/me").then((r) => r.user),

  register: (name: string, email: string, password: string) =>
    http.post<{ user: User }>("/api/auth/register", { name, email, password }).then((r) => r.user),

  /** Resolves to a session, or to a challenge that must be answered first. */
  signIn: (email: string, password: string) => http.post<LoginOutcome>("/api/auth/login", { email, password }),

  answerTwoFactor: (challenge: string, code: string) =>
    http.post<{ user: User }>("/api/auth/login/2fa", { challenge, code }).then((r) => r.user),

  signOut: () => http.post<{ ok: true }>("/api/auth/logout"),

  /** Ends every session everywhere — the "I lost my phone" button. */
  signOutEverywhere: () => http.post<{ ok: true }>("/api/auth/logout-all"),

  /** Whether the server can email a reset code at all. */
  resetAvailability: () =>
    http.get<{ self_service: boolean; code_length: number; expires_in_minutes: number }>("/api/recovery/status"),

  requestReset: (email: string) => http.post<{ ok: true; message: string }>("/api/recovery/request", { email }),

  redeemReset: (email: string, code: string, password: string) =>
    http.post<{ ok: true; message: string }>("/api/recovery/redeem", { email, code, password }),

  changeName: (name: string) => http.patch<{ ok: true }>("/api/account/name", { name }),

  changeEmail: (email: string, password: string) => http.patch<{ ok: true }>("/api/account/email", { email, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    http.patch<{ ok: true }>("/api/account/password", { currentPassword, newPassword }),

  closeAccount: (password: string) => http.del<{ ok: true }>("/api/account", { password }),

  twoFactorStatus: () => http.get<{ enabled: boolean }>("/api/account/2fa/status"),

  /** Returns the shared secret plus a QR to point an authenticator app at. */
  beginTwoFactor: () => http.post<{ secret: string; uri: string; qrDataUrl: string }>("/api/account/2fa/setup"),

  confirmTwoFactor: (code: string) => http.post<{ ok: true }>("/api/account/2fa/enable", { code }),

  disableTwoFactor: (password: string) => http.post<{ ok: true }>("/api/account/2fa/disable", { password }),

  passkeys: () =>
    http
      .get<{ passkeys: { id: number; display_name: string; created_at: string }[] }>("/api/account/passkeys")
      .then((r) => r.passkeys),

  removePasskey: (id: number) => http.del<{ ok: true }>(`/api/account/passkeys/${id}`),

  receipts: () => http.get<{ receipts: ReceiptSummary[] }>("/api/account/receipts").then((r) => r.receipts),

  loyalty: () => http.get<{ points_balance: number; ledger: LoyaltyLedgerEntry[] }>("/api/loyalty"),

  /** PDF for a settled booking. */
  bookingReceiptFile: (reservationId: number) => fetchFile(`/api/receipts/${reservationId}`),

  orderReceiptFile: (orderNo: string) => fetchFile(`/api/receipts/takeaway/${encodeURIComponent(orderNo)}`),
};
