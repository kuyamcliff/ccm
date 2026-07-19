import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

export const reviewsRouter = Router();

reviewsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.rating, r.text, r.created_at, r.updated_at, r.user_id, u.name AS author
       FROM reviews r JOIN users u ON u.id = r.user_id
       ORDER BY r.updated_at DESC LIMIT 100`
    )
    .all();
  res.json({ reviews: rows });
});

reviewsRouter.post("/", requireAuth, (req, res) => {
  const rating = Number(req.body?.rating);
  const text = String(req.body?.text ?? "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be 1 to 5." });
    return;
  }
  if (text.length < 3 || text.length > 600) {
    res.status(400).json({ error: "Write a few words (3 to 600 characters)." });
    return;
  }

  db.prepare(
    `INSERT INTO reviews (user_id, rating, text) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, text = excluded.text, updated_at = datetime('now')`
  ).run(req.user!.id, rating, text);

  const row = db
    .prepare(
      `SELECT r.id, r.rating, r.text, r.created_at, r.updated_at, r.user_id, u.name AS author
       FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.user_id = ?`
    )
    .get(req.user!.id);
  res.status(201).json({ review: row });
});

reviewsRouter.delete("/mine", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM reviews WHERE user_id = ?").run(req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: "You have no review to delete." });
    return;
  }
  res.json({ ok: true });
});
