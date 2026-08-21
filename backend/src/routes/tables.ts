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

  /* Asked of the join table, not of `reservations.table_id`. A party sitting
     across three tables has one lead table and two more that only the join
     table knows about, and reading the lead alone would offer those two to
     somebody else. */
  const reserved = (await db
    .prepare(
      `SELECT rt.table_id FROM reservation_tables rt
         JOIN reservations r ON r.id = rt.reservation_id
        WHERE r.date = ? AND r.time = ?
          AND (r.status = 'confirmed'
            OR (r.status = 'pending_payment' AND r.created_at > now_text_offset(interval '-30 minutes')))`
    )
    .all(date, time)) as { table_id: number }[];

  /* Tables with somebody sitting at them right now, whichever sitting they
     were booked for. Different from "taken at this slot": a table can be free
     at eight and still have a party at it at six, and a guest choosing an
     eight o'clock table does not care. The console does, so it is sent either
     way and the customer's plan ignores it. */
  const inUse = (await db
    .prepare(
      `SELECT rt.table_id FROM reservation_tables rt
         JOIN reservations r ON r.id = rt.reservation_id
        WHERE r.status = 'confirmed' AND r.checked_in_at IS NOT NULL
          AND r.date = to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
    )
    .all()) as { table_id: number }[];

  const reservedIds = new Set(reserved.map((r) => r.table_id));
  const inUseIds = new Set(inUse.map((r) => r.table_id));

  res.json({
    tables: tables.map((t) => ({ ...t, available: !reservedIds.has(t.id), in_use: inUseIds.has(t.id) })),
    fixtures,
  });
});
