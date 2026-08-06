import type { Request } from "express";
import {
  APPROVAL_WINDOW_SECONDS,
  MomoError,
  explainFailure as explainMomoFailure,
  getTransaction as getMomoTransaction,
  momoConfigured,
  requestToPay as momoRequestToPay,
  toMsisdn,
  verifyMomoWebhook,
} from "./momo.js";
import {
  explainOrangeFailure,
  getOrangeTransaction,
  orangeConfigured,
  orangeRequestToPay,
  toOrangeMsisdn,
  verifyOrangeWebhook,
} from "./orange.js";

/**
 * The two mobile wallets, behind one shape.
 *
 * MTN and Orange split Cameroon's mobile money roughly down the middle, so a
 * site that only takes MTN turns away about half the people who want to book.
 * They are different APIs — MTN pushes a PIN prompt and is polled, Orange
 * issues a payment token — but the restaurant's side of the transaction is the
 * same three questions every time: can this number pay, has it paid yet, and
 * what do I tell the customer if it did not.
 *
 * Everything payment-flow-shaped lives here rather than in the routes, so
 * adding a third wallet is a file and a line in WALLETS, not another branch
 * through checkout.
 */

export type WalletId = "mtn_momo" | "orange_money";

/** What a wallet reports back about one transaction. */
export interface WalletTransaction {
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  /** The wallet's own transaction id, present once money has moved. */
  providerTransactionId: string | null;
  /** A machine code on failure, e.g. NOT_ENOUGH_FUNDS. */
  reason: string | null;
}

export interface ChargeInput {
  amount: number;
  msisdn: string;
  /**
   * The reference we chose and wrote down before calling the wallet, used as
   * the wallet's own idempotency key.
   *
   * Generating it here rather than letting the wallet mint one is what makes a
   * retry safe all the way down: MTN treats X-Reference-Id as the key for the
   * charge, so replaying the same value cannot take the money twice, whereas a
   * fresh UUID per attempt is a brand new charge as far as MTN is concerned.
   */
  reference: string;
  /** Our booking code, echoed back by the wallet for reconciliation. */
  externalId: string;
  payerMessage: string;
  payeeNote: string;
}

/**
 * A webhook that has been proved to come from the wallet.
 *
 * `eventId` is what makes a redelivery detectable, and every wallet here sends
 * one. A webhook without an id is refused rather than trusted, because there is
 * then no way to tell a retry from a second payment.
 */
export interface WalletEvent {
  eventId: string;
  /** The reference we stored on the payment row when the charge started. */
  reference: string;
  status: "SUCCESSFUL" | "FAILED";
  providerTransactionId: string | null;
  reason: string | null;
}

export interface Wallet {
  id: WalletId;
  /** Shown to the customer when they pick how to pay. */
  label: string;
  /** The network, for the "enter your ... number" prompt. */
  network: string;
  configured(): boolean;
  /** Normalises a typed number, or null when it is not valid for this network. */
  toMsisdn(raw: string): string | null;
  charge(input: ChargeInput): Promise<string>;
  getTransaction(reference: string): Promise<WalletTransaction>;
  explainFailure(reason: string | null): string;
  /**
   * Verifies the signature on a delivery and returns the event, or null when
   * it cannot be proved genuine. Returning null must mean "reject": this is
   * the only thing standing between the internet and a settled payment.
   */
  verifyWebhook(req: Request): WalletEvent | null;
}

const mtn: Wallet = {
  id: "mtn_momo",
  label: "MTN Mobile Money",
  network: "MTN",
  configured: momoConfigured,
  toMsisdn,
  charge: momoRequestToPay,
  getTransaction: async (reference) => {
    const trx = await getMomoTransaction(reference);
    return {
      status: trx.status,
      providerTransactionId: trx.financialTransactionId,
      reason: trx.reason,
    };
  },
  explainFailure: explainMomoFailure,
  verifyWebhook: verifyMomoWebhook,
};

const orange: Wallet = {
  id: "orange_money",
  label: "Orange Money",
  network: "Orange",
  configured: orangeConfigured,
  toMsisdn: toOrangeMsisdn,
  charge: orangeRequestToPay,
  getTransaction: getOrangeTransaction,
  explainFailure: explainOrangeFailure,
  verifyWebhook: verifyOrangeWebhook,
};

export const WALLETS: Record<WalletId, Wallet> = {
  mtn_momo: mtn,
  orange_money: orange,
};

export function isWalletId(value: unknown): value is WalletId {
  return value === "mtn_momo" || value === "orange_money";
}

/** The wallet for an id, or null. Used to turn a request body into a provider. */
export function walletFor(value: unknown): Wallet | null {
  return isWalletId(value) ? WALLETS[value] : null;
}

/** Which wallets this deployment can actually charge, for the checkout screen. */
export function availableWallets(): { id: WalletId; label: string; network: string }[] {
  return Object.values(WALLETS)
    .filter((w) => w.configured())
    .map((w) => ({ id: w.id, label: w.label, network: w.network }));
}

export { APPROVAL_WINDOW_SECONDS, MomoError };
