import { Router } from "express";
import { db } from "../db.js";

export const tablesRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

tablesRouter.get("/", (req, res) => {
  const date = String(req.query.date ?? "");
  const time = String(req.query.time ?? "");

  const tables = db
    .prepare("SELECT id, label, capacity, zone, pos_x, pos_y FROM restaurant_tables WHERE active = 1 ORDER BY zone, id")
    .all() as { id: number; label: string; capacity: number; zone: string; pos_x: number; pos_y: number }[];

  if (!DATE_RE.test(date) || !time) {
    return res.json({ tables: tables.map((t) => ({ ...t, available: true })) });
  }

  const reserved = db
    .prepare(
      `SELECT table_id FROM reservations
       WHERE date = ? AND time = ? AND table_id IS NOT NULL
         AND (status = 'confirmed'
           OR (status = 'pending_payment' AND created_at > datetime('now', '-30 minutes')))`
    )
    .all(date, time) as { table_id: number }[];

  const reservedIds = new Set(reserved.map((r) => r.table_id));

  res.json({
    tables: tables.map((t) => ({ ...t, available: !reservedIds.has(t.id) })),
  });
});
