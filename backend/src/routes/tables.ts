import { Router } from "express";
import { db } from "../db.js";
import { readFixtures } from "../lib/fixtures.js";

export const tablesRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

tablesRouter.get("/", async (req, res) => {
  const date = String(req.query.date ?? "");
  const time = String(req.query.time ?? "");

  const tables = (await db
    .prepare("SELECT id, label, capacity, zone, pos_x, pos_y FROM restaurant_tables WHERE active = 1 ORDER BY zone, id")
    .all()) as { id: number; label: string; capacity: number; zone: string; pos_x: number; pos_y: number }[];

  /* The rest of the room: the grill, the screen, the bar. None of it is
     bookable, which is why it lives in its own table — but without it the plan
     is a field of rectangles and a guest cannot tell which corner is which. */
  const fixtures = await readFixtures();

  if (!DATE_RE.test(date) || !time) {
    res.json({ tables: tables.map((t) => ({ ...t, available: true })), fixtures });
    return;
  }

  const reserved = (await db
    .prepare(
      `SELECT table_id FROM reservations
       WHERE date = ? AND time = ? AND table_id IS NOT NULL
         AND (status = 'confirmed'
           OR (status = 'pending_payment' AND created_at > now_text_offset(interval '-30 minutes')))`
    )
    .all(date, time)) as { table_id: number }[];

  const reservedIds = new Set(reserved.map((r) => r.table_id));

  res.json({
    tables: tables.map((t) => ({ ...t, available: !reservedIds.has(t.id) })),
    fixtures,
  });
});
