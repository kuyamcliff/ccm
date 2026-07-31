import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";

export const loyaltyRouter = Router();

loyaltyRouter.get("/", requireAuth, async (req, res) => {
  const user = (await db.prepare("SELECT points_balance FROM users WHERE id = ?").get(req.user!.id)) as { points_balance: number };
  const ledger = await db.prepare(
    "SELECT amount, reason, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(req.user!.id);
  res.json({ points_balance: user.points_balance, ledger });
});

// Admin: adjust points for a user
loyaltyRouter.post("/adjust", requireAdmin, async (req, res) => {
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

export async function awardPoints(userId: number, amountFcfa: number, reason: string, refType: string, refId: number) {
  const pts = Math.floor(amountFcfa / 100);
  if (pts <= 0) return;
  await db.prepare("UPDATE users SET points_balance = points_balance + ? WHERE id = ?").run(pts, userId);
  await db.prepare("INSERT INTO points_ledger (user_id, amount, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)").run(userId, pts, reason, refType, refId);
}
