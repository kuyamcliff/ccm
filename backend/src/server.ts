import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { IS_PROD, PORT } from "./config.js";
import { attachUser } from "./auth.js";
import { db, loadIdColumns, pool } from "./db.js";
import { UPLOAD_DIR } from "./lib/media.js";
import { migrateInlineMedia } from "./lib/migrate-media.js";
import { migrateSchema } from "./lib/migrate-schema.js";
import { migrateUxControls } from "./lib/migrate-ux-controls.js";
import { backfillLegacyBookingCodes } from "./lib/bookingCode.js";
import { rateLimit, sameOriginOnly, securityHeaders } from "./middleware/security.js";
import { initTelegramLogger, flushTelegramLogs } from "./lib/telegramLogger.js";
import { authRouter } from "./routes/auth.js";
import { reservationsRouter } from "./routes/reservations.js";
import { reviewsRouter } from "./routes/reviews.js";
import { tablesRouter } from "./routes/tables.js";
import { paymentsRouter } from "./routes/payments.js";
import { adminRouter } from "./routes/admin.js";
import { menuRouter } from "./routes/menu.js";
import { settingsRouter } from "./routes/settings.js";
import { receiptsRouter } from "./routes/receipts.js";
import { accountRouter } from "./routes/account.js";
import { popularRouter } from "./routes/popular.js";
import { loyaltyRouter } from "./routes/loyalty.js";
import { promosRouter } from "./routes/promos.js";
import { offersRouter } from "./routes/offers.js";
import { waitlistRouter } from "./routes/waitlist.js";
import { galleryRouter } from "./routes/gallery.js";
import { eventsRouter } from "./routes/events.js";
import { giftCardsRouter } from "./routes/giftcards.js";
import { takeawayRouter } from "./routes/takeaway.js";
import { verifyRouter } from "./routes/verify.js";
import { legalRouter } from "./routes/legal.js";
import { supportRouter } from "./routes/support.js";
import { recoveryRouter } from "./routes/recovery.js";
import { accessRouter } from "./routes/access.js";

initTelegramLogger();

await migrateSchema();
await migrateUxControls();
await migrateInlineMedia();
await backfillLegacyBookingCodes();
await loadIdColumns();

const app = express();
app.set("trust proxy", IS_PROD ? 1 : false);
app.disable("x-powered-by");
app.set("etag", "strong");
app.use(securityHeaders);
app.use(compression());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use("/uploads", express.static(UPLOAD_DIR, { immutable: true, maxAge: "1y", index: false, fallthrough: false }));
app.use(cookieParser());
app.use(express.json({ limit: "8mb", type: ["application/json", "application/vnd.api+json"] }));
app.use(attachUser);
app.use(sameOriginOnly);

app.use("/api/auth", authRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/menu", menuRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/account", accountRouter);
app.use("/api/popular", popularRouter);
app.use("/api/loyalty", loyaltyRouter);
app.use("/api/promos", promosRouter);
app.use("/api/offers", offersRouter);
app.use("/api/waitlist", waitlistRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/events", eventsRouter);
app.use("/api/giftcards", giftCardsRouter);
app.use("/api/takeaway", takeawayRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/legal", legalRouter);
app.use("/api/support", supportRouter);
app.use("/api/recovery", recoveryRouter);
app.use("/api/access", accessRouter);

app.get("/api/health", rateLimit("health", { windowMs: 60_000, max: 120 }), async (_req, res) => {
  try {
    await db.prepare("SELECT 1 AS ok").get();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

const server = app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));

async function shutdown(signal: string) {
  console.log(`[server] ${signal} received; shutting down`);
  server.close(async () => {
    try { await flushTelegramLogs(); } catch {}
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException", err);
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => console.error("[server] unhandledRejection", reason));
