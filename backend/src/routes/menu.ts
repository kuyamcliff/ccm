import { Router } from "express";
import { db } from "../db.js";

export const menuRouter = Router();

/* Only what a guest's screen reads. `position`, `is_active` and `created_at`
   exist for the console's own editor (see routes/admin.ts) and cost bytes on
   every menu load for nothing this page shows. */
const PUBLIC_COLUMNS = "id, category, name, description, price_fcfa, price_label, image_url, sold_out, dietary_tags";

menuRouter.get("/", async (_req, res) => {
  const items = await db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM menu_items WHERE is_active = 1 ORDER BY category, position, id`)
    .all();
  res.json({ menu: items });
});
