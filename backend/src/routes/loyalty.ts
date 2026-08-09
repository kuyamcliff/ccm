import { Router } from "express";
import { db, transaction } from "../db.js";
import { requireAuth, requireAdmin, requireScope } from "../auth.js";
import { readSetting } from "../lib/pricing.js";
import {
  DEFAULT_MAX_REDEEM_PERCENT,
  DEFAULT_MIN_REDEEM_POINTS,
  DEFAULT_POINT_VALUE_FCFA,
  FCFA_PER_POINT,
  MAX_SHARE_KEY,
  MIN_REDEEM_KEY,
  NO_POINTS,
  POINT_VALUE_KEY,
  quotePoints,
} from "../lib/loyalty.js";
import type { LoyaltyRules, PointsQuote } from "../lib/loyalty.js";

/*
 * Points.
 *
 * They were earned and could never be spent. `awardPoints` had one caller — an
 * admin marking a reservation complete — nothing was given for a takeaway
 * order, and no checkout could turn a balance into money off, so
 * `points_balance` was a number the guest could look at in Account and nothing
 * else. That is worse than having no scheme at all, because the account page
 * makes a promise the rest of the product does not keep.
 *
 * What follows is the other half: rules the owner can set, a spend that is
 * deducted like a gift card rather than trusted from the request body, and a
 * refund for when the payment it was held against does not complete.
 *
 * Shaped deliberately like `giftcards.ts`. Both are stored value being put
 * against a bill, both have to survive a payment that fails halfway, and a
 * second shape for the same problem is a second set of bugs.
 */

export const loyaltyRouter = Router();

/* The numbers themselves live in `lib/loyalty.ts`, which touches no database
   and so can be checked on its own. Re-exported here because this is where the
   rest of the server has always imported loyalty from. */
export * from "../lib/loyalty.js";

/**
 * The scheme's numbers, from `site_settings` so the owner can change them in
 * Desk > Details without a deploy. Same reasoning as the deposit in
 * `lib/pricing.ts`, and the same defensive read: a corrupted row falls back
 * rather than stopping a checkout.
 */
export async function getLoyaltyRules(): Promise<LoyaltyRules> {
  const [value, min, share] = await Promise.all([
    readSetting(POINT_VALUE_KEY, DEFAULT_POINT_VALUE_FCFA, 1000),
    readSetting(MIN_REDEEM_KEY, DEFAULT_MIN_REDEEM_POINTS, 1_000_000),
    readSetting(MAX_SHARE_KEY, DEFAULT_MAX_REDEEM_PERCENT, 100),
  ]);
  return {
    point_value_fcfa: Math.max(1, value),
    min_redeem_points: min,
    max_redeem_percent: Math.min(100, share),
    fcfa_per_point: FCFA_PER_POINT,
  };
}

/**
 * What a spend or a refund was for.
 *
 * `id` is a row id or nothing, never a word. `points_ledger.ref_id` is written
 * as a number by `awardPoints` and has been since the table was made, so a
 * placeholder string here would be a failed insert at the till rather than a
 * tidier log line. Takeaway has no order id to give at the moment it spends —
 * the total depends on the discount, so the discount is taken first — and it
 * stamps the row afterwards with `attachPointsRef`.
 */
export interface PointsRef {
  type: string;
  id: number | null;
}

export interface PointsSpend extends PointsQuote {
  /** The ledger row, so a caller that learns its own id later can fill it in. */
  ledger_id?: number | null;
}

/**
 * Names the thing a spend was for, once it exists.
 *
 * Best effort on purpose: a ledger row that never gets its order number is a
 * worse support conversation, not a wrong balance, and it must not be able to
 * fail an order that has already been placed and paid for.
 */
export async function attachPointsRef(ledgerId: number | null | undefined, refId: number): Promise<void> {
  if (!ledgerId) return;
  try {
    await db.prepare("UPDATE points_ledger SET ref_id = ? WHERE id = ?").run(refId, ledgerId);
  } catch (err) {
    console.error("[loyalty] could not label a points ledger row:", err instanceof Error ? err.message : err);
  }
}

/**
 * Takes points off a balance and returns what came off the bill.
 *
 * The deduction is conditional on the balance still being there, inside a
 * transaction, for the reason the gift card deduction is: two checkouts open on
 * two devices must not both spend the same points. A caller that gets
 * `{ points: 0 }` back has had nothing taken and owes the full amount.
 */
export async function spendPoints(
  userId: number | null,
  amountFcfa: number,
  ref: PointsRef
): Promise<PointsSpend> {
  if (!userId || !Number.isFinite(amountFcfa) || amountFcfa <= 0) return NO_POINTS;

  const rules = await getLoyaltyRules();

  return transaction(async () => {
    const row = (await db.prepare("SELECT points_balance FROM users WHERE id = ?").get(userId)) as
      | { points_balance: number }
      | undefined;
    if (!row) return NO_POINTS;

    const quote = quotePoints(row.points_balance, amountFcfa, rules);
    if (quote.points <= 0) return NO_POINTS;

    const info = await db
      .prepare("UPDATE users SET points_balance = points_balance - ? WHERE id = ? AND points_balance >= ?")
      .run(quote.points, userId, quote.points);

    if (info.changes !== 1) return NO_POINTS;

    const entry = await db
      .prepare("INSERT INTO points_ledger (user_id, amount, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)")
      .run(userId, -quote.points, `Paid ${quote.value_fcfa} FCFA with points`, ref.type, ref.id);

    return { ...quote, ledger_id: Number(entry.lastInsertRowid) || null };
  });
}

/**
 * Puts points back after the payment they were held against failed, expired or
 * was cancelled.
 *
 * Every caller clears its record of the spend in the same breath, which is what
 * stops a redelivered webhook or a second cancellation crediting twice. There
 * is no cap to apply here the way there is on a gift card: points have no face
 * value to be inflated past, only the amount the caller recorded taking.
 */
export async function refundPoints(userId: number | null, points: number, ref: PointsRef): Promise<number> {
  if (!userId || !Number.isFinite(points) || points <= 0) return 0;
  const credit = Math.floor(points);

  await db.prepare("UPDATE users SET points_balance = points_balance + ? WHERE id = ?").run(credit, userId);
  await db
    .prepare("INSERT INTO points_ledger (user_id, amount, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)")
    .run(userId, credit, "Points returned", ref.type, ref.id);

  return credit;
}

/**
 * Gives points for money actually taken.
 *
 * The amount passed in is always what the guest paid after every discount, so
 * points spent on a bill cannot earn points back on the same bill.
 */
export async function awardPoints(userId: number, amountFcfa: number, reason: string, refType: string, refId: number) {
  const pts = Math.floor(amountFcfa / FCFA_PER_POINT);
  if (pts <= 0) return;
  await db.prepare("UPDATE users SET points_balance = points_balance + ? WHERE id = ?").run(pts, userId);
  await db.prepare("INSERT INTO points_ledger (user_id, amount, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)").run(userId, pts, reason, refType, refId);
}

// ── Routes ────────────────────────────────────────────────

loyaltyRouter.get("/", requireAuth, async (req, res) => {
  const user = (await db.prepare("SELECT points_balance FROM users WHERE id = ?").get(req.user!.id)) as { points_balance: number };
  const ledger = await db.prepare(
    "SELECT amount, reason, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(req.user!.id);
  const rules = await getLoyaltyRules();

  res.json({
    points_balance: user.points_balance,
    /* What the whole balance is worth, so the account page can say it in money
       rather than leaving a guest to work out what a point is. */
    value_fcfa: user.points_balance * rules.point_value_fcfa,
    spendable: user.points_balance >= rules.min_redeem_points,
    rules,
    ledger,
  });
});

// Admin: adjust points for a user
loyaltyRouter.post("/adjust", requireAdmin, requireScope("guests"), async (req, res) => {
  const userId = Number(req.body?.user_id);
  const amount = Number(req.body?.amount);
  const reason = String(req.body?.reason ?? "Admin adjustment").trim();
  if (!Number.isInteger(userId) || !Number.isInteger(amount) || amount === 0) {
    res.status(400).json({ error: "user_id and non-zero amount are required." }); return;
  }
  const user = await db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) { res.status(404).json({ error: "User not found." }); return; }

  await db.prepare("UPDATE users SET points_balance = GREATEST(0, points_balance + ?) WHERE id = ?").run(amount, userId);
  await db.prepare("INSERT INTO points_ledger (user_id, amount, reason, ref_type) VALUES (?, ?, ?, 'admin')").run(userId, amount, reason);
  const updated = (await db.prepare("SELECT points_balance FROM users WHERE id = ?").get(userId)) as { points_balance: number };
  res.json({ ok: true, points_balance: updated.points_balance });
});
