import { Router } from "express";
import { createRequire } from "node:module";
import QRCode from "qrcode";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { createQrToken } from "../lib/qrToken.js";
import { parseOrderLines } from "../lib/orderItems.js";

const _require = createRequire(import.meta.url);
// pdfkit ships CommonJS with loose types; the drawing API is used untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PDFDocument = _require("pdfkit") as any;

export const receiptsRouter = Router();

/* Palette kept in step with the on-screen receipt, adjusted for paper: the
   site is dark, a printed receipt is not. */
const INK = "#14100f";
const MUTED = "#6d6360";
const FAINT = "#a49b98";
const RULE = "#e2dcd8";
const BRAND = "#c4261d";
const GREEN = "#2f7d5b";

const PAGE_MARGIN = 52;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

/* Where the footer sits, and therefore the line content must not cross. */
const FOOT_TOP = 760;

/**
 * Holds a receipt to one sheet.
 *
 * A receipt is a thing somebody prints at a counter or shows at a door, and a
 * second page is either wasted paper or the half that gets left behind. PDFKit
 * adds a page the moment the cursor runs past the bottom margin, so the way to
 * be sure is to take that ability away rather than to hope the content fits.
 *
 * Callers still cap what they draw — this is the guarantee, not the plan. Once
 * it is in force, anything that would have overflowed is clipped instead, so
 * the parts that matter are laid out first: the code, then the booking, then
 * the money.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function holdToOnePage(doc: any): void {
  doc.addPage = function noSecondPage() {
    return doc;
  };
}

function methodLabel(method: string | null): string {
  if (method === "mtn_momo") return "MTN Mobile Money";
  if (method === "orange_money") return "Orange Money";
  if (method === "free") return "Covered by promo / gift card";
  return method || "—";
}

/**
 * The masthead line, read fresh on every request.
 *
 * A receipt used to be generated once and this line was typed into the source
 * alongside it, which is exactly backwards: the address on a receipt is a fact
 * about the restaurant, not about the code, and it has to track what the owner
 * has set whenever the PDF is actually built. Nothing here is cached and
 * nothing here is stored — every download, including one for a booking from
 * last month, renders this line from whatever `site_settings` says right now.
 * That is also what makes an "old" receipt current: there is no old file
 * sitting on disk to go stale, only a fresh render on request.
 */
async function venueMasthead(): Promise<{ addressLine: string; phone: string | null }> {
  const rows = (await db.prepare("SELECT key, value FROM site_settings").all()) as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;

  const street = settings.address?.trim() || "Razel Street, opposite P and T school";
  const city = settings.city?.trim() || "Buea";
  // Owners usually type the town into the street line already; appending it
  // again is how a receipt ends up reading "Buea, Buea". Mirrors the join the
  // customer site does in state/venue.tsx, so the two never disagree.
  const joined = street.toLowerCase().includes(city.toLowerCase()) ? street : `${street}, ${city}`;

  const rawPhone = settings.phone?.trim() || null;
  const digits = rawPhone ? rawPhone.replace(/\D/g, "") : "";
  const phone = digits.length === 9 ? `${digits[0]} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}` : rawPhone;

  return { addressLine: `${joined}, Cameroon`, phone };
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/**
 * Takeaway receipt.
 *
 * Registered ahead of the booking route so `/takeaway/...` is not swallowed by
 * the `:reservationId` parameter. Same layout as a booking receipt — one
 * document design, two kinds of order — with the item lines in place of the
 * table details, and a QR the counter scans on collection.
 */
receiptsRouter.get("/takeaway/:orderNo", requireAuth, async (req, res) => {
  const orderNo = String(req.params.orderNo ?? "");

  const row = (await db
    .prepare(
      `SELECT o.id, o.order_no, o.name, o.phone, o.items_json, o.total_fcfa, o.discount_fcfa,
              o.pickup_time, o.note, o.status, o.payment_status, o.paid_at, o.created_at,
              o.user_id, o.momo_phone, o.momo_transaction_id, o.collected_at
       FROM takeaway_orders o WHERE o.order_no = ?`
    )
    .get(orderNo)) as Record<string, unknown> | undefined;

  if (!row) { res.status(404).json({ error: "Receipt not found." }); return; }

  const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin" || req.user!.role === "owner";
  if (row.user_id !== req.user!.id && !isAdmin) {
    res.status(403).json({ error: "Not your receipt." });
    return;
  }

  const code = String(row.order_no);
  const paid = Number(row.total_fcfa) || 0;
  const discount = Number(row.discount_fcfa) || 0;
  const isPaid = row.payment_status === "paid";

  let items: { name: string; qty: number; price: number }[] = [];
  try { items = JSON.parse(String(row.items_json)); } catch { /* keep the receipt */ }
  const subtotal = items.reduce((sum, l) => sum + l.price * l.qty, 0) || paid + discount;

  let qr: string | null = null;
  try {
    const token = createQrToken({ code, reservationId: Number(row.id), subject: "takeaway" });
    qr = await QRCode.toDataURL(token, {
      errorCorrectionLevel: "H", margin: 0, width: 260,
      color: { dark: "#14100f", light: "#ffffff" },
    });
  } catch { /* a missing QR is not worth failing the receipt over */ }

  const venue = await venueMasthead();

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, info: { Title: `${code} receipt` } });
  holdToOnePage(doc);
  doc.on("data", (c: Buffer) => chunks.push(c));
  doc.on("end", () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${code}-receipt.pdf"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  });

  const L = PAGE_MARGIN;
  const R = PAGE_MARGIN + CONTENT_WIDTH;
  const rule = (y: number, color = RULE) => {
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(color).stroke();
  };
  const sectionTitle = (label: string) => {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FAINT)
      .text(label.toUpperCase(), L, doc.y, { characterSpacing: 1.6 });
    doc.moveDown(0.6);
  };
  const detail = (label: string, value: string) => {
    const y = doc.y;
    doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text(label, L, y, { width: 160 });
    doc.fontSize(9.5).font("Helvetica-Bold").fillColor(INK)
      .text(value, L + 165, y, { width: CONTENT_WIDTH - 165, align: "right" });
    doc.y = Math.max(doc.y, y + 15);
  };

  // ── Masthead ──
  doc.fontSize(19).font("Helvetica-Bold").fillColor(INK)
    .text("CAM CHOP MEAT", L, PAGE_MARGIN, { characterSpacing: 1.2 });
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED)
    .text(venue.addressLine, { characterSpacing: 0.3 });

  const badge = isPaid ? "PAID" : "UNPAID";
  const badgeColor = isPaid ? GREEN : BRAND;
  const badgeW = 62;
  doc.roundedRect(R - badgeW, PAGE_MARGIN + 1, badgeW, 20, 3).lineWidth(1).strokeColor(badgeColor).stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor(badgeColor)
    .text(badge, R - badgeW, PAGE_MARGIN + 7, { width: badgeW, align: "center", characterSpacing: 1 });

  doc.y = PAGE_MARGIN + 46;
  rule(doc.y);
  doc.moveDown(1.2);

  // ── Reference band ──
  const bandY = doc.y;
  const bandH = qr ? 96 : 68;
  doc.roundedRect(L, bandY, CONTENT_WIDTH, bandH, 5).fillColor("#faf7f5").fill();
  doc.fontSize(8).font("Helvetica-Bold").fillColor(FAINT)
    .text("COLLECTION CODE", L + 18, bandY + 16, { characterSpacing: 1.6 });
  doc.fontSize(22).font("Courier-Bold").fillColor(BRAND).text(code, L + 18, bandY + 32);
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED)
    .text("Show this at the counter", L + 18, bandY + 60);

  if (qr) {
    const qrSize = 68;
    doc.image(Buffer.from(qr.split(",")[1], "base64"), R - qrSize - 18, bandY + 14, { width: qrSize, height: qrSize });
  }

  doc.y = bandY + bandH + 24;

  // ── Order ──
  sectionTitle("Order");
  detail("Name", String(row.name));
  detail("Collect at", String(row.pickup_time));
  if (row.phone) detail("Contact", String(row.phone));
  detail("Placed", String(row.created_at).replace(" ", " · "));

  if (row.note) {
    doc.moveDown(0.4);
    doc.fontSize(9).font("Helvetica-Oblique").fillColor(MUTED)
      .text(`“${String(row.note)}”`, L, doc.y, { width: CONTENT_WIDTH });
  }

  doc.moveDown(1.2);
  rule(doc.y);
  doc.moveDown(1);

  // ── Items ──
  sectionTitle("Items");
  /* Capped for the same reason as the booking receipt: past this many lines the
     footer is pushed off the sheet, and the remainder is summed instead. */
  const MAX_ITEM_LINES = 14;
  const shownItems = items.slice(0, MAX_ITEM_LINES);
  const hiddenItems = items.slice(MAX_ITEM_LINES);
  for (const line of shownItems) {
    const y = doc.y;
    doc.fontSize(9.5).font("Helvetica").fillColor(INK)
      .text(`${line.qty} × ${line.name}`, L, y, { width: CONTENT_WIDTH - 120 });
    doc.font("Helvetica-Bold").fillColor(INK)
      .text(`${(line.price * line.qty).toLocaleString()} FCFA`, L + CONTENT_WIDTH - 120, y, {
        width: 120, align: "right",
      });
    doc.y = Math.max(doc.y, y + 15);
  }

  if (hiddenItems.length > 0) {
    const rest = hiddenItems.reduce((sum, l) => sum + l.price * l.qty, 0);
    const y = doc.y;
    doc.fontSize(9.5).font("Helvetica").fillColor(MUTED)
      .text(`and ${hiddenItems.length} more ${hiddenItems.length === 1 ? "item" : "items"}`, L, y, {
        width: CONTENT_WIDTH - 120,
      });
    doc.font("Helvetica-Bold").fillColor(INK)
      .text(`${rest.toLocaleString()} FCFA`, L + CONTENT_WIDTH - 120, y, { width: 120, align: "right" });
    doc.y = Math.max(doc.y, y + 15);
  }

  doc.moveDown(0.5);
  rule(doc.y);
  doc.moveDown(0.6);

  const money = (label: string, value: string, color?: string) => {
    const y = doc.y;
    doc.fontSize(9.5).font("Helvetica").fillColor(color ?? MUTED).text(label, L, y, { width: 200 });
    doc.fillColor(color ?? INK).text(value, L + 205, y, { width: CONTENT_WIDTH - 205, align: "right" });
    doc.y = Math.max(doc.y, y + 15);
  };
  money("Subtotal", `${subtotal.toLocaleString()} FCFA`);
  if (discount > 0) money("Discount applied", `- ${discount.toLocaleString()} FCFA`, GREEN);

  doc.moveDown(0.35);
  rule(doc.y);
  doc.moveDown(0.55);

  const totalY = doc.y;
  doc.fontSize(11).font("Helvetica-Bold").fillColor(INK).text(isPaid ? "Total paid" : "Total due", L, totalY);
  doc.fontSize(14).font("Helvetica-Bold").fillColor(BRAND)
    .text(`${paid.toLocaleString()} FCFA`, L + 205, totalY - 2, { width: CONTENT_WIDTH - 205, align: "right" });
  doc.y = totalY + 24;

  if (row.momo_phone) detail("Paid from", String(row.momo_phone));
  if (row.momo_transaction_id) detail("Transaction", String(row.momo_transaction_id));
  if (isPaid && row.paid_at) detail("Received", `${String(row.paid_at).replace(" ", " · ")} UTC`);
  if (row.collected_at) detail("Collected", `${String(row.collected_at).replace(" ", " · ")} UTC`);

  // ── Footer ──
  const footTop = FOOT_TOP;
  rule(footTop);
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED)
    .text(
      venue.phone
        ? `Takeaway is paid before it is cooked. Bring this code to the counter, or call ${venue.phone}.`
        : "Takeaway is paid before it is cooked. Bring this code to the counter at your collection time.",
      L, footTop + 12, { width: CONTENT_WIDTH, align: "center" }
    );
  doc.fontSize(7.5).fillColor(FAINT)
    .text(
      `Issued ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC · camchopmeat.com`,
      L, footTop + 30, { width: CONTENT_WIDTH, align: "center" }
    );

  doc.end();
});

receiptsRouter.get("/:reservationId", requireAuth, async (req, res) => {
  const resId = Number(req.params.reservationId);
  if (!Number.isInteger(resId)) {
    res.status(400).json({ error: "Bad reservation id." });
    return;
  }

  const row = (await db
    .prepare(
      `SELECT r.id, r.date, r.time, r.party_size, r.phone, r.note, r.status, r.payment_status,
              r.ccm_code, r.created_at, r.user_id, r.items_json, r.items_total_fcfa, r.deposit_fcfa,
              u.name AS guest_name, u.email AS guest_email,
              t.label AS table_label, t.zone AS table_zone,
              p.amount_fcfa, p.discount_fcfa, p.momo_phone, p.method AS pay_method,
              p.reference AS pay_reference, p.momo_transaction_id, p.updated_at AS paid_at
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed' AND p.type = 'reservation'
       WHERE r.id = ?`
    )
    .get(resId)) as Record<string, unknown> | undefined;

  if (!row) { res.status(404).json({ error: "Receipt not found." }); return; }

  const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin" || req.user!.role === "owner";
  if (row.user_id !== req.user!.id && !isAdmin) {
    res.status(403).json({ error: "Not your receipt." });
    return;
  }

  const code =
    (row.ccm_code as string | null) ??
    `CCM-${new Date(row.created_at as string).getFullYear()}-${String(resId).padStart(5, "0")}`;

  const paid = Number(row.amount_fcfa) || 0;
  const discount = Number(row.discount_fcfa) || 0;
  const subtotal = paid + discount;
  const isPaid = row.payment_status === "paid";

  /* Food and drink ordered with the table. `deposit_fcfa` is what was frozen
     onto the booking when it was paid; older rows predate that column, so the
     deposit is inferred by taking the food back off the total. */
  const preordered = parseOrderLines(row.items_json as string | null);
  const itemsTotal = Number(row.items_total_fcfa) || 0;
  const depositPart = Number(row.deposit_fcfa) || Math.max(0, subtotal - itemsTotal);

  /* The QR carries an HMAC-signed token, not a link. A plain reference would
     prove nothing — anyone can encode text into a QR — whereas this cannot be
     produced without the server's signing secret. Error correction is high so
     it still scans off a creased printout or a phone screen. */
  let qr: string | null = null;
  try {
    const token = createQrToken({ code, reservationId: resId });
    qr = await QRCode.toDataURL(token, {
      errorCorrectionLevel: "H", margin: 0, width: 260,
      color: { dark: "#14100f", light: "#ffffff" },
    });
  } catch {
    // A missing QR is not worth failing the whole receipt over.
  }

  const venue = await venueMasthead();

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, info: { Title: `${code} receipt` } });
  holdToOnePage(doc);
  doc.on("data", (c: Buffer) => chunks.push(c));
  doc.on("end", () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${code}-receipt.pdf"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  });

  const L = PAGE_MARGIN;
  const R = PAGE_MARGIN + CONTENT_WIDTH;

  const rule = (y: number, color = RULE) => {
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(color).stroke();
  };

  const sectionTitle = (label: string) => {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FAINT)
      .text(label.toUpperCase(), L, doc.y, { characterSpacing: 1.6 });
    doc.moveDown(0.6);
  };

  /** Label left, value right, on one baseline. */
  const detail = (label: string, value: string) => {
    const y = doc.y;
    doc.fontSize(9.5).font("Helvetica").fillColor(MUTED).text(label, L, y, { width: 160 });
    doc.fontSize(9.5).font("Helvetica-Bold").fillColor(INK)
      .text(value, L + 165, y, { width: CONTENT_WIDTH - 165, align: "right" });
    doc.y = Math.max(doc.y, y + 15);
  };

  // ── Masthead ──
  doc.fontSize(19).font("Helvetica-Bold").fillColor(INK)
    .text("CAM CHOP MEAT", L, PAGE_MARGIN, { characterSpacing: 1.2 });
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED)
    .text(venue.addressLine, { characterSpacing: 0.3 });

  // Status badge, right-aligned against the masthead.
  const badge = isPaid ? "PAID" : "UNPAID";
  const badgeColor = isPaid ? GREEN : BRAND;
  const badgeW = 62;
  doc.roundedRect(R - badgeW, PAGE_MARGIN + 1, badgeW, 20, 3)
    .lineWidth(1).strokeColor(badgeColor).stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor(badgeColor)
    .text(badge, R - badgeW, PAGE_MARGIN + 7, { width: badgeW, align: "center", characterSpacing: 1 });

  doc.y = PAGE_MARGIN + 46;
  rule(doc.y);
  doc.moveDown(1.2);

  // ── Reference band ──
  const bandY = doc.y;
  const bandH = qr ? 96 : 68;
  doc.roundedRect(L, bandY, CONTENT_WIDTH, bandH, 5).fillColor("#faf7f5").fill();

  doc.fontSize(8).font("Helvetica-Bold").fillColor(FAINT)
    .text("BOOKING REFERENCE", L + 18, bandY + 16, { characterSpacing: 1.6 });
  doc.fontSize(22).font("Courier-Bold").fillColor(BRAND)
    .text(code, L + 18, bandY + 32);
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED)
    .text("Quote this at the door", L + 18, bandY + 60);

  if (qr) {
    const qrSize = 68;
    doc.image(Buffer.from(qr.split(",")[1], "base64"), R - qrSize - 18, bandY + 14, {
      width: qrSize, height: qrSize,
    });
  }

  doc.y = bandY + bandH + 24;

  // ── Booking ──
  sectionTitle("Booking");
  detail("Guest", String(row.guest_name));
  detail("Date", longDate(String(row.date)));
  detail("Time", String(row.time));
  detail("Party size", `${row.party_size} ${Number(row.party_size) === 1 ? "guest" : "guests"}`);
  if (row.table_label) {
    detail("Table", `${row.table_label}${row.table_zone ? ` · ${row.table_zone}` : ""}`);
  }
  if (row.phone) detail("Contact", String(row.phone));

  if (row.note) {
    doc.moveDown(0.4);
    doc.fontSize(9).font("Helvetica-Oblique").fillColor(MUTED)
      .text(`“${String(row.note)}”`, L, doc.y, { width: CONTENT_WIDTH });
  }

  doc.moveDown(1.2);
  rule(doc.y);
  doc.moveDown(1);

  // ── Payment ──
  sectionTitle("Payment");

  const money = (label: string, value: string, opts: { color?: string; bold?: boolean } = {}) => {
    const y = doc.y;
    doc.fontSize(9.5).font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(opts.color ?? MUTED).text(label, L, y, { width: 200 });
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fillColor(opts.color ?? INK)
      .text(value, L + 205, y, { width: CONTENT_WIDTH - 205, align: "right" });
    doc.y = Math.max(doc.y, y + 15);
  };

  money("Table deposit", `${depositPart.toLocaleString()} FCFA`);

  /* What they ordered ahead, itemised. Capped so a large party's order cannot
     push the footer onto a second page — the rest is summed into one line,
     which is the honest way to stay on one sheet. */
  if (preordered.length > 0) {
    const MAX_LINES = 8;
    const shown = preordered.slice(0, MAX_LINES);
    const hidden = preordered.slice(MAX_LINES);

    for (const line of shown) {
      money(`${line.qty} × ${line.name}`, `${(line.price * line.qty).toLocaleString()} FCFA`);
    }
    if (hidden.length > 0) {
      const rest = hidden.reduce((sum, l) => sum + l.price * l.qty, 0);
      money(
        `and ${hidden.length} more ${hidden.length === 1 ? "item" : "items"}`,
        `${rest.toLocaleString()} FCFA`
      );
    }
    money("Food and drinks", `${itemsTotal.toLocaleString()} FCFA`, { bold: true });
  }

  if (discount > 0) money("Discount applied", `- ${discount.toLocaleString()} FCFA`, { color: GREEN });

  doc.moveDown(0.35);
  rule(doc.y);
  doc.moveDown(0.55);

  const totalY = doc.y;
  doc.fontSize(11).font("Helvetica-Bold").fillColor(INK).text(isPaid ? "Total paid" : "Total due", L, totalY);
  doc.fontSize(14).font("Helvetica-Bold").fillColor(BRAND)
    .text(`${paid.toLocaleString()} FCFA`, L + 205, totalY - 2, { width: CONTENT_WIDTH - 205, align: "right" });
  doc.y = totalY + 24;

  detail("Method", methodLabel(row.pay_method as string | null));
  if (row.momo_phone) detail("Paid from", String(row.momo_phone));
  if (row.momo_transaction_id ?? row.pay_reference) {
    detail("Transaction", String(row.momo_transaction_id ?? row.pay_reference));
  }
  if (isPaid && row.paid_at) {
    detail("Received", `${String(row.paid_at).replace(" ", " · ")} UTC`);
  }

  // ── Footer, pinned to the bottom of the page ──
  const footTop = FOOT_TOP;
  rule(footTop);
  doc.fontSize(8.5).font("Helvetica").fillColor(MUTED)
    .text(
      "The deposit comes off your bill. Arrive within 20 minutes of your slot or the table may be released.",
      L, footTop + 12, { width: CONTENT_WIDTH, align: "center" }
    );
  doc.fontSize(7.5).fillColor(FAINT)
    .text(
      `Issued ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC · camchopmeat.com`,
      L, footTop + 30, { width: CONTENT_WIDTH, align: "center" }
    );

  doc.end();
});
