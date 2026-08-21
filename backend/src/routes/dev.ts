import { Router } from "express";
import { db } from "../db.js";
import {
  COOKIE_NAME,
  requireAuth,
  requireDeveloper,
  sessionCookieOptions,
  signSession,
} from "../auth.js";
import { audit } from "../lib/audit.js";
import { clearErrors, errorCount, recentErrors } from "../lib/errorLog.js";
import { openUserSession } from "../lib/userSessions.js";
import { messagingAvailable } from "../lib/notify.js";
import { CRON_SECRET, FRONTEND_URL, IS_PROD } from "../config.js";
import { walletFor } from "../lib/wallets.js";

export const devRouter = Router();

/**
 * The developer tier.
 *
 * Everything here answers a question the owner should never have to think about
 * and nobody else can answer from the outside: is the database up, what broke
 * five minutes ago, what is actually in the config blob, how big are the tables.
 *
 * Every route is `requireDeveloper`, which is exactly one role and not "owner or
 * above". The owner runs a restaurant and has no business being handed a
 * database console or an impersonation button.
 */
devRouter.use(requireAuth, requireDeveloper);

/* ── Is everything up ───────────────────────────────────────────────────────*/

devRouter.get("/health", async (_req, res) => {
  const startedAt = Date.now();

  let database: "up" | "down" = "up";
  let latencyMs: number | null = null;
  try {
    const began = Date.now();
    await db.prepare("SELECT 1").get();
    latencyMs = Date.now() - began;
  } catch {
    database = "down";
  }

  const memory = process.memoryUsage();

  /*
   * Which optional integrations are actually configured.
   *
   * This is the screen that answers "why did nobody get a text": the answer is
   * almost always that the credentials are not set in this environment, and
   * there is no way to see that from the outside.
   */
  const mtn = walletFor("mtn_momo");
  const orange = walletFor("orange_money");

  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: database === "up",
    environment: IS_PROD ? "production" : "development",
    database,
    database_latency_ms: latencyMs,
    uptime_seconds: Math.round(process.uptime()),
    node: process.version,
    memory: {
      rss_mb: Math.round(memory.rss / 1024 / 1024),
      heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
    },
    integrations: {
      mtn_momo: mtn?.configured() ?? false,
      orange_money: orange?.configured() ?? false,
      messaging: messagingAvailable(),
      reminders: CRON_SECRET.length > 0,
    },
    frontend_url: FRONTEND_URL,
    errors_held: errorCount(),
    checked_in_ms: Date.now() - startedAt,
  });
});

/* ── What broke ─────────────────────────────────────────────────────────────*/

devRouter.get("/errors", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    errors: recentErrors(limit),
    /* Said out loud because it changes how the screen should be read: this is
       "what just went wrong", not a permanent record. */
    volatile: true,
  });
});

devRouter.delete("/errors", (req, res) => {
  clearErrors();
  audit(req, { action: "dev.errors_cleared", targetType: "system" });
  res.json({ ok: true });
});

/* ── The config blob, raw ───────────────────────────────────────────────────*/

devRouter.get("/flags", async (_req, res) => {
  const row = (await db.prepare("SELECT value FROM site_settings WHERE key = 'site_config_json'").get()) as
    | { value: string }
    | undefined;

  let parsed: unknown = null;
  let valid = true;
  try {
    parsed = row?.value ? JSON.parse(row.value) : null;
  } catch {
    valid = false;
  }

  res.setHeader("Cache-Control", "no-store");
  res.json({ raw: row?.value ?? "", parsed, valid });
});

/**
 * Writing the blob back as raw JSON.
 *
 * Site control is the screen for changing these normally, and it is safer
 * because it can only produce shapes the parser understands. This exists for the
 * case Site control cannot reach: a blob that is already malformed, or a key the
 * console has no switch for yet.
 *
 * It refuses anything that is not valid JSON, which is the one mistake that
 * would take the customer site down, since every page reads this on load.
 */
devRouter.put("/flags", async (req, res) => {
  const raw = String(req.body?.raw ?? "");
  if (raw.length > 20_000) {
    res.status(400).json({ error: "That is larger than the column allows." });
    return;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      res.status(400).json({ error: "The config has to be a JSON object." });
      return;
    }
  } catch {
    res.status(400).json({ error: "That is not valid JSON, so it was not saved." });
    return;
  }

  await db
    .prepare(
      "INSERT INTO site_settings (key, value) VALUES ('site_config_json', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
    )
    .run(raw);

  audit(req, { action: "dev.flags_written", targetType: "site_settings", targetId: "site_config_json" });
  res.json({ ok: true });
});

/* ── What is in the database ────────────────────────────────────────────────*/

/**
 * Row counts per table.
 *
 * The table names come from Postgres's own catalogue rather than from anything a
 * request said, which is what makes interpolating them into the count query
 * safe. Nothing here takes input.
 */
devRouter.get("/database", async (_req, res) => {
  const tables = (await db
    .prepare(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'camchop' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    )
    .all()) as { table_name: string }[];

  const counts: { table: string; rows: number }[] = [];
  for (const { table_name } of tables) {
    /* Identifier from the catalogue, never from a request. Quoted regardless. */
    const row = (await db.prepare(`SELECT COUNT(*)::int AS n FROM "${table_name}"`).get()) as
      | { n: number }
      | undefined;
    counts.push({ table: table_name, rows: row?.n ?? 0 });
  }

  const size = (await db
    .prepare("SELECT pg_size_pretty(pg_database_size(current_database())) AS size")
    .get()) as { size: string } | undefined;

  res.setHeader("Cache-Control", "no-store");
  res.json({ tables: counts, database_size: size?.size ?? "unknown" });
});

/* ── Becoming somebody else ─────────────────────────────────────────────────*/

/**
 * Signing in as another account, to see exactly what they see.
 *
 * The most useful debugging tool in a product like this and the most dangerous
 * thing in the console, so it is fenced in four ways:
 *
 *   1. Developer only.
 *   2. It refuses to impersonate any member of staff. A developer stepping into
 *      an owner would be a developer with the owner's powers and none of the
 *      audit trail that implies. Guests only.
 *   3. It is audited unconditionally, before the cookie is issued, naming both
 *      accounts.
 *   4. The session it opens is an ordinary one, so it expires, appears in that
 *      guest's own device list, and can be revoked by them.
 *
 * There is no way back except signing in again, which is deliberate: a reversible
 * impersonation is one somebody forgets they are inside.
 */
devRouter.post("/impersonate", async (req, res) => {
  const id = Number(req.body?.user_id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Bad account id." });
    return;
  }

  const target = (await db
    .prepare("SELECT id, name, email, role, session_version, deleted_at FROM users WHERE id = ?")
    .get(id)) as
    | { id: number; name: string; email: string; role: string; session_version: number; deleted_at: string | null }
    | undefined;

  if (!target || target.deleted_at) {
    res.status(404).json({ error: "No such account." });
    return;
  }

  if (target.role !== "user") {
    res.status(403).json({ error: "Only guest accounts can be impersonated." });
    return;
  }

  /* Before the cookie, so a failure between the two leaves a record of the
     attempt rather than a session nobody wrote down. */
  audit(req, {
    action: "dev.impersonate",
    targetType: "user",
    targetId: String(target.id),
    detail: `${req.user?.email ?? "unknown"} became ${target.email}`,
  });

  const sid = await openUserSession(target.id, req);
  res.cookie(COOKIE_NAME, signSession(target.id, target.session_version, sid), sessionCookieOptions());

  res.json({
    ok: true,
    user: { id: target.id, name: target.name, email: target.email, role: target.role },
  });
});
