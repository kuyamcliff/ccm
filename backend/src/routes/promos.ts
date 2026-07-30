import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";

export const promosRouter = Router();

export type PromoRow = {
  id: number;
  code: string;
  type: string;
  value: number;
  description: string;
  min_spend_fcfa: number;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  is_active: number;
};

/** Codes are guessable by design (they are short and shared), so the lookup is
 *  throttled to stop a dictionary sweep finding the active ones. */
const validateLimit = rateLimit("promo-validate", {
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Too many code checks. Wait a few minutes and try again.",
});

/**
 * Single source of truth for whether a code may be used and what it is worth.
 * Both the reservation deposit flow and takeaway checkout call this, so the two
 * can never drift apart on the rules.
 */
export function evaluatePromo(
  code: string,
  spendFcfa: number
): { ok: true; promo: PromoRow; discount: number } | { ok: false; status: number; error: string } {
  const normalised = String(code ?? "").trim().toUpperCase();
  if (!normalised) return { ok: false, status: 400, error: "Enter a promo code." };

  const promo = db
    .prepare("SELECT * FROM promo_codes WHERE code = ? AND is_active = 1")
    .get(normalised) as PromoRow | undefined;

  if (!promo) return { ok: false, status: 404, error: "That code doesn't exist or is inactive." };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { ok: false, status: 410, error: "This code has expired." };
  }
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
    return { ok: false, status: 410, error: "This code has reached its usage limit." };
  }
  if (spendFcfa > 0 && spendFcfa < promo.min_spend_fcfa) {
    return {
      ok: false,
      status: 400,
      error: `Minimum spend of ${promo.min_spend_fcfa.toLocaleString()} FCFA required.`,
    };
  }

  const discount =
    promo.type === "percent"
      ? Math.round((spendFcfa * promo.value) / 100)
      : Math.min(promo.value, spendFcfa);

  // Never let a discount exceed the amount being charged.
  return { ok: true, promo, discount: Math.max(0, Math.min(discount, spendFcfa)) };
}

promosRouter.post("/validate", requireAuth, validateLimit, (req, res) => {
  const spendFcfa = Math.max(0, Number(req.body?.spend_fcfa ?? 0) || 0);
  const result = evaluatePromo(String(req.body?.code ?? ""), spendFcfa);

  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

  res.json({
    valid: true,
    code: result.promo.code,
    type: result.promo.type,
    value: result.promo.value,
    description: result.promo.description,
    discount_fcfa: result.discount,
  });
});

// ── Admin ────────────────────────────────────────────────

promosRouter.get("/", requireAdmin, (_req, res) => {
  res.json({ codes: db.prepare("SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 500").all() });
});

promosRouter.post("/", requireAdmin, (req, res) => {
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  const type = String(req.body?.type ?? "");
  const value = Number(req.body?.value);
  const description = String(req.body?.description ?? "").slice(0, 200);
  const minSpend = Math.max(0, Number(req.body?.min_spend_fcfa ?? 0) || 0);
  const maxUses = req.body?.max_uses ? Number(req.body.max_uses) : null;
  const expiresAt = req.body?.expires_at ? String(req.body.expires_at) : null;

  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
    res.status(400).json({ error: "Code must be 3 to 24 letters, numbers, dashes or underscores." });
    return;
  }
  if (!["percent", "flat"].includes(type)) {
    res.status(400).json({ error: "Type must be percent or flat." });
    return;
  }
  if (!Number.isInteger(value) || value < 1) {
    res.status(400).json({ error: "Value must be a whole number of at least 1." });
    return;
  }
  if (type === "percent" && value > 100) {
    res.status(400).json({ error: "A percentage discount cannot exceed 100." });
    return;
  }
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    res.status(400).json({ error: "Usage limit must be a whole number of at least 1." });
    return;
  }

  try {
    db.prepare(
      "INSERT INTO promo_codes (code, type, value, description, min_spend_fcfa, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(code, type, value, description, minSpend, maxUses, expiresAt);
  } catch {
    res.status(409).json({ error: "That code already exists." });
    return;
  }

  audit(req, {
    action: "promo.create",
    targetType: "promo_code",
    targetId: code,
    detail: `${value}${type === "percent" ? "%" : " FCFA"}`,
  });
  res.status(201).json({ ok: true });
});

promosRouter.patch("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad code id." }); return; }

  const existing = db.prepare("SELECT code FROM promo_codes WHERE id = ?").get(id) as
    | { code: string }
    | undefined;
  if (!existing) { res.status(404).json({ error: "Promo code not found." }); return; }

  const active = req.body?.is_active ? 1 : 0;
  db.prepare("UPDATE promo_codes SET is_active = ? WHERE id = ?").run(active, id);

  audit(req, {
    action: active ? "promo.enable" : "promo.disable",
    targetType: "promo_code",
    targetId: existing.code,
  });
  res.json({ ok: true });
});

promosRouter.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad code id." }); return; }

  const existing = db.prepare("SELECT code FROM promo_codes WHERE id = ?").get(id) as
    | { code: string }
    | undefined;
  db.prepare("DELETE FROM promo_codes WHERE id = ?").run(id);

  audit(req, { action: "promo.delete", targetType: "promo_code", targetId: existing?.code ?? id });
  res.json({ ok: true });
});

/**
 * Increments the use counter, refusing to go past max_uses.
 * Returns false when the code was already exhausted, which lets the caller
 * treat an over-subscribed code as unredeemed rather than silently overselling.
 */
export function usePromoCode(code: string): boolean {
  if (!code) return false;
  const info = db
    .prepare(
      `UPDATE promo_codes SET uses_count = uses_count + 1
       WHERE code = ? AND is_active = 1
         AND (max_uses IS NULL OR uses_count < max_uses)`
    )
    .run(code);
  return info.changes === 1;
}

/**
 * Gives a use back when the payment it was claimed for never completed.
 * Clamped at zero so a duplicate release cannot drive the counter negative and
 * hand out extra redemptions.
 */
export function releasePromoCode(code: string): void {
  if (!code) return;
  db.prepare("UPDATE promo_codes SET uses_count = MAX(0, uses_count - 1) WHERE code = ?").run(code);
}
