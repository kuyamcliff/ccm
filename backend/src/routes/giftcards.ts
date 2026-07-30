import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db, transaction } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";

export const giftCardsRouter = Router();

type CardRow = {
  id: number;
  code: string;
  remaining_value_fcfa: number;
  initial_value_fcfa: number;
  is_active: number;
};

function genCode(): string {
  // 8 random bytes keeps the space at 2^64, far past guessing range even
  // before the rate limit below.
  const h = () => randomBytes(2).toString("hex").toUpperCase();
  return `GIFT-${h()}-${h()}-${h()}-${h()}`;
}

/** Codes are bearer instruments — without this they could be enumerated. */
const validateLimit = rateLimit("giftcard-validate", {
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: "Too many gift card checks. Wait a few minutes and try again.",
});

giftCardsRouter.post("/validate", requireAuth, validateLimit, (req, res) => {
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  if (!code) { res.status(400).json({ error: "Enter a gift card code." }); return; }

  const card = db
    .prepare(
      "SELECT id, code, initial_value_fcfa, remaining_value_fcfa, is_active FROM gift_cards WHERE code = ?"
    )
    .get(code) as CardRow | undefined;

  if (!card || !card.is_active) {
    res.status(404).json({ error: "Gift card not found or inactive." });
    return;
  }
  if (card.remaining_value_fcfa <= 0) {
    res.status(410).json({ error: "This gift card has been fully used." });
    return;
  }

  res.json({
    valid: true,
    code: card.code,
    initial_value_fcfa: card.initial_value_fcfa,
    remaining_value_fcfa: card.remaining_value_fcfa,
  });
});

// ── Admin ────────────────────────────────────────────────

giftCardsRouter.post("/", requireAdmin, (req, res) => {
  const value = Number(req.body?.value_fcfa);
  if (!Number.isInteger(value) || value < 500 || value > 1_000_000) {
    res.status(400).json({ error: "Value must be between 500 and 1,000,000 FCFA." });
    return;
  }

  const code = genCode();
  db.prepare(
    "INSERT INTO gift_cards (code, initial_value_fcfa, remaining_value_fcfa, purchased_by) VALUES (?, ?, ?, ?)"
  ).run(code, value, value, req.user!.id);

  audit(req, { action: "gift_card.create", targetType: "gift_card", targetId: code, detail: `${value} FCFA` });
  res.status(201).json({ code, value_fcfa: value });
});

giftCardsRouter.get("/", requireAdmin, (_req, res) => {
  res.json({
    cards: db.prepare("SELECT * FROM gift_cards ORDER BY created_at DESC LIMIT 500").all(),
  });
});

/** Balance history for one card. */
giftCardsRouter.get("/:id/ledger", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad card id." }); return; }
  const entries = db
    .prepare(
      "SELECT amount_fcfa, ref_type, ref_id, created_at FROM gift_card_ledger WHERE gift_card_id = ? ORDER BY created_at DESC LIMIT 200"
    )
    .all(id);
  res.json({ entries });
});

giftCardsRouter.patch("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad card id." }); return; }

  const card = db.prepare("SELECT code, is_active FROM gift_cards WHERE id = ?").get(id) as
    | { code: string; is_active: number }
    | undefined;
  if (!card) { res.status(404).json({ error: "Gift card not found." }); return; }

  const next = card.is_active ? 0 : 1;
  db.prepare("UPDATE gift_cards SET is_active = ? WHERE id = ?").run(next, id);

  audit(req, {
    action: next ? "gift_card.activate" : "gift_card.deactivate",
    targetType: "gift_card",
    targetId: card.code,
  });
  res.json({ ok: true, is_active: !!next });
});

giftCardsRouter.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad card id." }); return; }
  db.prepare("UPDATE gift_cards SET is_active = 0 WHERE id = ?").run(id);
  audit(req, { action: "gift_card.deactivate", targetType: "gift_card", targetId: id });
  res.json({ ok: true });
});

/**
 * Debits a card and returns the amount actually taken.
 *
 * The balance is re-read and conditionally updated inside one write
 * transaction, so two requests racing on the same card cannot both spend it:
 * the second sees the balance the first left behind.
 *
 * Callers must not already hold a transaction.
 */
export function redeemGiftCard(code: string, amountFcfa: number, ref?: { type: string; id: string | number }): number {
  if (!code || !Number.isFinite(amountFcfa) || amountFcfa <= 0) return 0;

  return transaction(() => {
    const card = db
      .prepare("SELECT id, remaining_value_fcfa FROM gift_cards WHERE code = ? AND is_active = 1")
      .get(code) as { id: number; remaining_value_fcfa: number } | undefined;

    if (!card || card.remaining_value_fcfa <= 0) return 0;

    const deduct = Math.min(card.remaining_value_fcfa, Math.floor(amountFcfa));
    if (deduct <= 0) return 0;

    const info = db
      .prepare(
        "UPDATE gift_cards SET remaining_value_fcfa = remaining_value_fcfa - ? WHERE id = ? AND remaining_value_fcfa >= ?"
      )
      .run(deduct, card.id, deduct);

    if (info.changes !== 1) return 0;

    db.prepare(
      "INSERT INTO gift_card_ledger (gift_card_id, amount_fcfa, ref_type, ref_id) VALUES (?, ?, ?, ?)"
    ).run(card.id, deduct, ref?.type ?? "", ref?.id != null ? String(ref.id) : null);

    return deduct;
  });
}

/**
 * Returns value to a card after a payment it was held against failed or was
 * abandoned. Capped at the card's face value so a replayed refund cannot
 * inflate the balance past what was originally issued.
 */
export function refundGiftCard(code: string, amountFcfa: number, ref?: { type: string; id: string | number }): number {
  if (!code || !Number.isFinite(amountFcfa) || amountFcfa <= 0) return 0;

  return transaction(() => {
    const card = db
      .prepare("SELECT id, initial_value_fcfa, remaining_value_fcfa FROM gift_cards WHERE code = ?")
      .get(code) as { id: number; initial_value_fcfa: number; remaining_value_fcfa: number } | undefined;
    if (!card) return 0;

    const headroom = card.initial_value_fcfa - card.remaining_value_fcfa;
    const credit = Math.min(headroom, Math.floor(amountFcfa));
    if (credit <= 0) return 0;

    db.prepare("UPDATE gift_cards SET remaining_value_fcfa = remaining_value_fcfa + ? WHERE id = ?")
      .run(credit, card.id);
    db.prepare(
      "INSERT INTO gift_card_ledger (gift_card_id, amount_fcfa, ref_type, ref_id) VALUES (?, ?, ?, ?)"
    ).run(card.id, -credit, ref?.type ?? "refund", ref?.id != null ? String(ref.id) : null);

    return credit;
  });
}

/** Reads a card's spendable balance without touching it. */
export function giftCardBalance(code: string): number {
  if (!code) return 0;
  const card = db
    .prepare("SELECT remaining_value_fcfa FROM gift_cards WHERE code = ? AND is_active = 1")
    .get(code) as { remaining_value_fcfa: number } | undefined;
  return card?.remaining_value_fcfa ?? 0;
}
