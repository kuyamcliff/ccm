import { Router } from "express";
import { db } from "../db.js";

export const menuRouter = Router();

menuRouter.get("/", async (_req, res) => {
  const items = await db
    .prepare("SELECT * FROM menu_items WHERE is_active = 1 ORDER BY category, position, id")
    .all();
  res.json({ menu: items });
});
