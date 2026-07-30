import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { IS_PROD, PORT } from "./config.js";
import { attachUser } from "./auth.js";
import { db } from "./db.js";
import { UPLOAD_DIR } from "./lib/media.js";
import { migrateInlineMedia } from "./lib/migrate-media.js";
import { backfillLegacyBookingCodes } from "./lib/bookingCode.js";
import { rateLimit, sameOriginOnly, securityHeaders } from "./middleware/security.js";
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

migrateInlineMedia();
backfillLegacyBookingCodes();

const app = express();

// Rate limits and cookie `secure` depend on the real client address, which only
// arrives correctly when Express is told to trust the proxy in front of it.
app.set("trust proxy", IS_PROD ? 1 : false);
app.disable("x-powered-by");
app.set("etag", "strong");

app.use(securityHeaders);
app.use(compression());

/* Uploads are content-addressed, so a given URL always names the same bytes and
   can be cached in the browser indefinitely. */
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    immutable: true,
    maxAge: "365d",
    index: false,
    dotfiles: "deny",
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

/* Uploads travel as base64, which inflates them by about a third; 12 MB of body
   covers a 6 MB image with headroom without inviting memory-exhaustion. */
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use(attachUser);
app.use(sameOriginOnly);

/* Blanket ceiling. Individual routes that are more expensive or more sensitive
   set their own tighter limits on top of this. */
app.use(
  "/api",
  rateLimit("global", {
    windowMs: 60 * 1000,
    max: 300,
    message: "You are sending requests very quickly. Slow down and try again.",
  })
);

/* Touches the database, so a monitor gets told when the process is up but the
   store underneath it is not. A health check that only proves Express is
   listening will happily report green through a total outage. */
app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    db.prepare("SELECT 1").get();
    res.json({ ok: true, database: "up", uptime_seconds: Math.round(process.uptime()) });
  } catch (err) {
    console.error("[health] database check failed", err);
    res.status(503).json({ ok: false, database: "down" });
  }
});

app.use("/api/auth", authRouter);
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
app.use("/api/waitlist", waitlistRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/events", eventsRouter);
app.use("/api/gift-cards", giftCardsRouter);
app.use("/api/takeaway", takeawayRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/legal", legalRouter);
app.use("/api/support", supportRouter);
app.use("/api/recovery", recoveryRouter);
app.use("/api/admin", adminRouter);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Body-parser rejections are the caller's fault, not ours.
  if (err && typeof err === "object" && "type" in err) {
    const type = (err as { type: string }).type;
    if (type === "entity.too.large") {
      res.status(413).json({ error: "That file is too large. Keep uploads under 6 MB." });
      return;
    }
    if (type === "entity.parse.failed") {
      res.status(400).json({ error: "That request was malformed." });
      return;
    }
  }

  /* A client that hung up mid-response is normal on a flaky mobile connection
     and is not worth a stack trace in the logs. */
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: unknown }).code);
    if (code === "ECONNABORTED" || code === "ECONNRESET" || code === "EPIPE") return;

    /* Every writer is queued behind busy_timeout, so reaching here means the
       database was locked for five full seconds. Tell the caller to retry
       rather than presenting it as a permanent failure. */
    if (code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED")) {
      console.error(`[db-busy] ${req.method} ${req.originalUrl}`);
      res.setHeader("Retry-After", "2");
      res.status(503).json({ error: "We are very busy right now. Try that again in a moment." });
      return;
    }
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  // Once the response has started, the only correct move is to destroy it;
  // writing a JSON body on top of a partial response corrupts it.
  if (res.headersSent) { next(err); return; }

  res.status(500).json({ error: "Something broke on our side. Try again." });
});

const server = app.listen(PORT, () =>
  console.log(`Camchop backend listening on http://localhost:${PORT}`)
);

/*
 * Connection deadlines.
 *
 * On a slow mobile connection a request can legitimately take a while, so the
 * ceilings are generous; what they stop is a stalled or deliberately trickled
 * connection holding a socket open forever. Without these a handful of clients
 * that connect and then send nothing can occupy every available socket.
 *
 * keepAliveTimeout sits above the usual 60s proxy idle timeout so the proxy,
 * not the app, is the one that closes an idle connection. Closing from this end
 * first is what produces sporadic 502s behind a load balancer.
 */
server.requestTimeout = 60_000;    // whole request, including a slow upload
server.headersTimeout = 20_000;    // must finish sending headers within this
server.keepAliveTimeout = 65_000;
server.timeout = 0;                // no blanket socket timeout; the above govern

/* Finish in-flight requests and close the database cleanly rather than being
   killed mid-write. */
function shutdown(signal: string) {
  console.log(`\n[${signal}] shutting down`);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

/*
 * A rejected promise nobody handled would otherwise take the whole process down
 * in current Node, dropping every in-flight request with it. One bad request
 * should not end the server, so these are logged loudly and survived.
 */
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

/* An uncaught exception leaves the process in an unknown state, so this one
   does exit, but only after finishing the requests already in flight. */
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  shutdown("uncaughtException");
});
