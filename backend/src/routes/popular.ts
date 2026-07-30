import { Router } from "express";
import { db } from "../db.js";

export const popularRouter = Router();

popularRouter.get("/", (_req, res) => {
  const topReview = db
    .prepare(
      `SELECT rv.id, rv.rating, rv.text, rv.updated_at, u.name as author
       FROM reviews rv JOIN users u ON rv.user_id = u.id
       ORDER BY rv.rating DESC, rv.updated_at DESC LIMIT 1`
    )
    .get() ?? null;

  const topItems = db
    .prepare(
      "SELECT * FROM menu_items WHERE is_active = 1 ORDER BY price_fcfa DESC LIMIT 3"
    )
    .all();

  res.json({ topReview, topItems });
});
