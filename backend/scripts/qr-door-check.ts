/**
 * Proves the door can read a receipt.
 *
 * Builds the exact QR the receipt embeds — same signer, same payload — renders
 * it to pixels the way a camera would see it, decodes it with the same library
 * the door screen uses, and sends the result to /api/verify.
 *
 * Run with the server up:  npx tsx scripts/qr-door-check.ts
 */

import QRCode from "qrcode";
import jsQR from "jsqr";
import { createQrToken } from "../src/lib/qrToken.js";

const API = process.env.API ?? "http://localhost:4000";
const ORIGIN = process.env.FRONTEND_URL ?? "http://localhost:5173";

/** Renders a QR to an RGBA buffer, as a camera pointed at it would deliver. */
function toPixels(text: string, scale = 6, quiet = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const width = (size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!data[row * size + col]) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = ((quiet + col) * scale + x) + ((quiet + row) * scale + y) * width;
          pixels[px * 4] = 0;
          pixels[px * 4 + 1] = 0;
          pixels[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { pixels, width };
}

async function check(label: string, token: string, expect: "valid" | "refused" = "valid") {
  const { pixels, width } = toPixels(token);
  const scanned = jsQR(pixels, width, width, { inversionAttempts: "attemptBoth" });

  if (!scanned) {
    console.log(`FAIL  ${label}: the QR did not decode`);
    return false;
  }
  if (scanned.data !== token) {
    console.log(`FAIL  ${label}: decoded text does not match the token`);
    return false;
  }

  const res = await fetch(`${API}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: process.env.COOKIE ?? "" },
    body: JSON.stringify({ token: scanned.data }),
  });
  const body = (await res.json()) as { outcome?: string; kind?: string; message?: string; error?: string };

  const wasValid = res.status === 200 && body.outcome === "valid";
  const ok = expect === "valid" ? wasValid : !wasValid;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: decoded ${scanned.data.slice(0, 18)}… -> ${res.status} ` +
      `${body.outcome ?? body.error} (${body.kind ?? "no kind"})`
  );
  return ok;
}

const bookingId = Number(process.env.BOOKING_ID ?? 1);
const bookingCode = process.env.BOOKING_CODE ?? "";
const orderId = Number(process.env.ORDER_ID ?? 1);
const orderCode = process.env.ORDER_CODE ?? "";

const results = [
  await check("booking receipt QR", createQrToken({ code: bookingCode, reservationId: bookingId })),
  await check(
    "takeaway receipt QR",
    createQrToken({ code: orderCode, reservationId: orderId, subject: "takeaway" })
  ),
  await check("a forged token is refused", "CCM1.bm90LWEtcmVhbC1wYXlsb2Fk.AAAAAAAAAAAAAAAAAAAAAA", "refused"),
];

const passed = results.every(Boolean);
console.log(passed ? "\nAll door checks behaved correctly." : "\nSomething is wrong.");
process.exit(passed ? 0 : 1);
