import { randomInt } from "node:crypto";
import { db } from "../db.js";

/**
 * Booking references.
 *
 * The old format was `CCM-{year}-{zero-padded row id}`. That leaked the
 * sequence: anyone holding one receipt could read off every other booking
 * reference, and could invent plausible ones on the spot. These are drawn from
 * a CSPRNG instead, so a reference carries no information about any other.
 */

/**
 * Crockford-style alphabet with the characters people misread removed:
 * no 0/O, no 1/I/L, no U. Staff read these aloud and type them by hand.
 */
export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const GROUPS = 2;
export const GROUP_LEN = 4;

/** 30^8 ≈ 6.6e11 possible references. */
export const CODE_ENTROPY_BITS = Math.round(Math.log2(ALPHABET.length ** (GROUPS * GROUP_LEN)));

export function randomBlock(length: number): string {
  let out = "";
  // randomInt is rejection-sampled, so no modulo bias across the alphabet.
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Formats a fresh reference under any prefix: PREFIX-XXXX-XXXX. */
export function mintCode(prefix: string): string {
  const blocks: string[] = [];
  for (let i = 0; i < GROUPS; i++) blocks.push(randomBlock(GROUP_LEN));
  return `${prefix}-${blocks.join("-")}`;
}

/**
 * Accepts a typed reference under any prefix, in any case and spacing.
 *
 * Returns "" for anything that is not a well-formed reference, so a caller
 * never has to decide whether a near-miss was close enough.
 */
export function normaliseCode(raw: string, prefix: string): string {
  const cleaned = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned.startsWith(prefix)) return "";
  const body = cleaned.slice(prefix.length);
  if (body.length !== GROUPS * GROUP_LEN) return "";
  if (![...body].every((c) => ALPHABET.includes(c))) return "";
  const blocks: string[] = [];
  for (let i = 0; i < GROUPS; i++) blocks.push(body.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN));
  return `${prefix}-${blocks.join("-")}`;
}

/** Formats as CCM-XXXX-XXXX. */
function mint(): string {
  return mintCode("CCM");
}

/**
 * Returns a reference not already in use.
 *
 * A collision is vanishingly unlikely, but the column is unique so a clash
 * would surface as an insert failure at the worst possible moment — during
 * checkout. Retrying here keeps that off the customer's path.
 */
export async function generateBookingCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = mint();
    const taken = await db.prepare("SELECT 1 FROM reservations WHERE ccm_code = ?").get(code);
    if (!taken) return code;
  }
  throw new Error("Could not allocate an unused booking reference.");
}

/** Accepts user input in any case and with loose spacing. */
export function normaliseBookingCode(raw: string): string {
  return normaliseCode(raw, "CCM");
}

/**
 * Takeaway order references: TKA-XXXX-XXXX.
 *
 * Drawn from the same CSPRNG as a booking reference rather than from the row
 * id and the date. The old `TKW-{year}-{id}` form told anyone holding one
 * receipt how many orders the shop had taken and let them guess every other
 * reference, which matters now that a takeaway code is what the door scans.
 */
export async function generateOrderCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = mintCode("TKA");
    const taken = await db.prepare("SELECT 1 FROM takeaway_orders WHERE order_no = ?").get(code);
    if (!taken) return code;
  }
  throw new Error("Could not allocate an unused order reference.");
}

export function normaliseOrderCode(raw: string): string {
  return normaliseCode(raw, "TKA");
}

/**
 * Gives every legacy `CCM-{year}-{id}` row a random reference.
 *
 * Run once at boot. Old printed receipts stop scanning, which is the point:
 * those references were guessable and should not stay valid.
 */
export async function backfillLegacyBookingCodes(): Promise<void> {
  const legacy = (await db
    .prepare("SELECT id FROM reservations WHERE ccm_code IS NULL OR ccm_code NOT LIKE 'CCM-____-____'")
    .all()) as { id: number }[];
  if (legacy.length === 0) return;

  const update = db.prepare("UPDATE reservations SET ccm_code = ? WHERE id = ?");
  for (const row of legacy) update.run(await generateBookingCode(), row.id);

  console.log(`[codes] Reissued ${legacy.length} guessable booking reference(s).`);
}
