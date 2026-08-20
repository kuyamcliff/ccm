import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { IS_PROD, PORT } from "./config.js";
import { attachUser } from "./auth.js";
import { db, loadIdColumns, pool } from "./db.js";
import { UPLOAD_DIR } from "./lib/media.js";
import { migrateInlineMedia } from "./lib/migrate-media.js";
import { migrateSchema } from "./lib/migrate-schema.js";
import { newErrorReference } from "./lib/errorReference.js";
import { migrateUxControls } from "./lib/migrate-ux-controls.js";
import { backfillLegacyBookingCodes } from "./lib/bookingCode.js";
import { rateLimit, sameOriginOnly, securityHeaders } from "./middleware/security.js";
import { maintenanceGate, requireSiteService } from "./middleware/siteFeatures.js";
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
import { takeawayPaymentsRouter } from "./routes/takeawayPayments.js";
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
app.use((req, res, next) => { const start = Date.now(); res.on("finish", () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`)); next(); });
app.use("/uploads", express.static(UPLOAD_DIR, { immutable: true, maxAge: "365d", index: false, dotfiles: "deny", setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff") }));
app.use(express.json({ limit: "12mb", verify: (req, _res, buf) => { if (req.url?.startsWith("/api/payments/webhook/")) (req as express.Request & { rawBody?: Buffer }).rawBody = buf; } }));
app.use(cookieParser());
app.use(attachUser);
app.use(sameOriginOnly);
app.use("/api", rateLimit("global", { windowMs: 60 * 1000, max: 300, message: "You are sending requests very quickly. Slow down and try again." }));
/* After attachUser, so staff are recognised and let through, and after the
   rate limit, so a closed site cannot be used to hammer the database with
   config reads. */
app.use("/api", maintenanceGate);

app.get("/api/health", async (_req, res) => { res.setHeader("Cache-Control", "no-store"); try { await db.prepare("SELECT 1").get(); res.json({ ok: true, database: "up", uptime_seconds: Math.round(process.uptime()) }); } catch (err) { console.error("[health] database check failed", err); res.status(503).json({ ok: false, database: "down" }); } });
app.use("/api/auth", authRouter);
app.post("/api/reservations", requireSiteService("booking"));
app.use("/api/reservations", reservationsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/menu", menuRouter);
app.use("/api/site-settings", settingsRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/account", accountRouter);
app.use("/api/popular", popularRouter);
app.use("/api/loyalty", loyaltyRouter);
app.use("/api/promos", promosRouter);
app.use("/api/offers", offersRouter);
app.post("/api/waitlist", requireSiteService("waitlist"));
app.use("/api/waitlist", waitlistRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/events", eventsRouter);
app.use("/api/gift-cards", giftCardsRouter);
app.post("/api/takeaway", requireSiteService("ordering"));
app.use("/api/takeaway", takeawayPaymentsRouter);
app.use("/api/takeaway", takeawayRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/legal", legalRouter);
app.use("/api/support", supportRouter);
app.use("/api/recovery", recoveryRouter);
app.use("/api/admin", adminRouter);
app.use("/api/access", accessRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && typeof err === "object" && "type" in err) { const type = (err as { type: string }).type; if (type === "entity.too.large") { res.status(413).json({ error: "That file is too large. Keep uploads under 6 MB." }); return; } if (type === "entity.parse.failed") { res.status(400).json({ error: "That request was malformed." }); return; } }
  if (err && typeof err === "object" && "code" in err) { const code = String((err as { code: unknown }).code); if (code === "ECONNABORTED" || code === "ECONNRESET" || code === "EPIPE") return; if (["55P03", "40001", "40P01", "53300"].includes(code)) { res.setHeader("Retry-After", "2"); res.status(503).json({ error: "We are very busy right now. Try that again in a moment." }); return; } }
  /* One code, printed beside the customer's apology and logged next to the
     stack, so "it said CCM-7F42" is enough for support to find the exact
     failure instead of asking what time it happened. */
  const reference = newErrorReference();
  console.error(`[error] ${reference} ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) { next(err); return; }
  res.status(500).json({ error: "Something broke on our side. Try again.", reference });
});
const server = app.listen(PORT, () => console.log(`Camchop backend listening on http://localhost:${PORT}`));
server.requestTimeout = 60_000; server.headersTimeout = 20_000; server.keepAliveTimeout = 65_000; server.timeout = 0;
async function shutdown(signal: string) { console.log(`\n[${signal}] shutting down`); server.close(async () => { await flushTelegramLogs(); pool.end().finally(() => process.exit(0)); }); setTimeout(() => process.exit(1), 10_000).unref(); }
process.on("SIGTERM", () => shutdown("SIGTERM")); process.on("SIGINT", () => shutdown("SIGINT")); process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason)); process.on("uncaughtException", (err) => { console.error("[uncaughtException]", err); shutdown("uncaughtException"); });
