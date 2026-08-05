import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin, requireScope } from "../auth.js";
import { audit } from "../lib/audit.js";
import { clientIp, rateLimit } from "../middleware/security.js";
import {
  addClient,
  broadcastPresence,
  broadcastVisitorPresence,
  clearTyping,
  isThreadWatched,
  onlineAdmins,
  presenceSnapshot,
  setTyping,
  toAdmins,
  toEveryone,
  toThread,
  typingIn,
  watchThread,
} from "../lib/realtime.js";

export const supportRouter = Router();

const MAX_BODY = 2000;
const MAX_MESSAGES_PER_THREAD = 500;
const MAX_OPEN_THREADS = 5;

interface ThreadRow {
  id: number;
  user_id: number | null;
  guest_token: string | null;
  display_name: string;
  subject: string;
  status: string;
  assigned_admin_id: number | null;
  last_message_at: string;
  unread_for_admin: number;
  unread_for_user: number;
  created_at: string;
}

/* Visitors can be chatty, but not floods. Keyed on the account when signed in
   so one shared network does not throttle everyone behind it. */
const sendLimit = rateLimit("support-send", {
  windowMs: 60 * 1000,
  max: 30,
  message: "You are sending messages very quickly. Give us a moment to reply.",
  key: (req) => (req.user ? `u${req.user.id}` : `ip${clientIp(req)}`),
});

const startLimit = rateLimit("support-start", {
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many new conversations from here. Try again later.",
});

/* Typing fires on almost every keystroke, so its ceiling is high and its
   handler does no database work. */
const typingLimit = rateLimit("support-typing", {
  windowMs: 10 * 1000,
  max: 40,
  message: "Slow down.",
  key: (req) => (req.user ? `u${req.user.id}` : `ip${clientIp(req)}`),
});

/** Reads the guest token from the header the widget sends. */
function guestToken(req: { get(name: string): string | undefined }): string | null {
  const raw = req.get("x-support-token");
  if (!raw) return null;
  const token = raw.trim();
  // Tokens we issue are 32 hex characters; anything else is not one of ours.
  return /^[a-f0-9]{32}$/.test(token) ? token : null;
}

/** Identifies the caller for thread ownership. */
function callerKey(userId: number | null, token: string | null): string | null {
  if (userId) return `u${userId}`;
  if (token) return `g${token}`;
  return null;
}

/** Every thread belonging to the caller, newest activity first. */
async function listThreads(userId: number | null, token: string | null): Promise<ThreadRow[]> {
  if (userId) {
    return (await db
      .prepare("SELECT * FROM support_threads WHERE user_id = ? ORDER BY last_message_at DESC LIMIT 50")
      .all(userId)) as unknown as ThreadRow[];
  }
  if (token) {
    return (await db
      .prepare("SELECT * FROM support_threads WHERE guest_token = ? ORDER BY last_message_at DESC LIMIT 50")
      .all(token)) as unknown as ThreadRow[];
  }
  return [];
}

/** Loads a thread only if the caller owns it. */
async function ownedThread(id: number, userId: number | null, token: string | null): Promise<ThreadRow | undefined> {
  const row = (await db.prepare("SELECT * FROM support_threads WHERE id = ?").get(id)) as ThreadRow | undefined;
  if (!row) return undefined;
  if (userId && row.user_id === userId) return row;
  if (token && row.guest_token === token) return row;
  return undefined;
}

async function messagesFor(threadId: number) {
  return db
    .prepare(
      "SELECT id, thread_id, sender, author_name, body, kind, created_at FROM support_messages WHERE thread_id = ? ORDER BY id"
    )
    .all(threadId);
}

/** Shape sent to the visitor. The assignee's identity stays on the admin side. */
function publicThread(t: ThreadRow) {
  return {
    id: t.id,
    subject: t.subject || "Conversation",
    status: t.status,
    last_message_at: t.last_message_at,
    unread_for_user: t.unread_for_user,
    created_at: t.created_at,
  };
}

/** Writes one of the desk's own lines into the transcript. */
async function systemLine(threadId: number, body: string) {
  const info = await db
    .prepare("INSERT INTO support_messages (thread_id, sender, author_name, body, kind) VALUES (?, 'system', '', ?, 'system')")
    .run(threadId, body);
  return db
    .prepare("SELECT id, thread_id, sender, author_name, body, kind, created_at FROM support_messages WHERE id = ?")
    .get(Number(info.lastInsertRowid));
}

/**
 * Picks the admin who should take a new conversation.
 *
 * Only someone with a live connection is eligible — handing a thread to an
 * admin who went home means the customer waits on a desk nobody is watching.
 * Among those online, the one carrying the fewest open threads wins, so a
 * busy shift spreads rather than piling onto whoever connected first.
 *
 * Returns null when nobody is online. The thread stays unassigned and is
 * picked up by `drainUnassigned` the moment an admin connects.
 */
async function pickAdmin(): Promise<{ id: number; name: string } | null> {
  const online = onlineAdmins();
  if (online.length === 0) return null;

  const loads = new Map<number, number>();
  for (const admin of online) loads.set(admin.id, 0);

  const rows = (await db
    .prepare(
      `SELECT assigned_admin_id AS id, COUNT(*) AS n
       FROM support_threads
       WHERE status = 'open' AND assigned_admin_id IS NOT NULL
       GROUP BY assigned_admin_id`
    )
    .all()) as { id: number; n: number }[];
  for (const row of rows) if (loads.has(row.id)) loads.set(row.id, row.n);

  let best = online[0];
  let bestLoad = loads.get(best.id) ?? 0;
  for (const admin of online) {
    const load = loads.get(admin.id) ?? 0;
    if (load < bestLoad) { best = admin; bestLoad = load; }
  }
  return best;
}

/** Assigns a thread and tells both sides. */
async function assign(threadId: number, admin: { id: number; name: string }): Promise<void> {
  await db.prepare(
    "UPDATE support_threads SET assigned_admin_id = ?, assigned_at = now_text() WHERE id = ?"
  ).run(admin.id, threadId);

  const line = await systemLine(threadId, `${admin.name} joined the conversation.`);
  toEveryone(threadId, "message", line);
  toAdmins("thread_assigned", { thread_id: threadId, admin_id: admin.id, admin_name: admin.name });
}

/**
 * Hands every waiting conversation to whoever is now online.
 *
 * Called when an admin connects. Without this, a conversation started while
 * the desk was empty would sit unassigned until the customer wrote again.
 */
export async function drainUnassigned(): Promise<void> {
  const waiting = (await db
    .prepare("SELECT id FROM support_threads WHERE status = 'open' AND assigned_admin_id IS NULL ORDER BY last_message_at")
    .all()) as { id: number }[];
  for (const row of waiting) {
    const admin = await pickAdmin();
    if (!admin) return;
    await assign(row.id, admin);
  }
}

/* ── Streams ─────────────────────────────────────────────────────────────
   Both sides hold one of these open. Everything the other party does arrives
   on it, which is what removes the refresh. */

function openStream(req: Request, res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Nginx buffers proxied responses by default, which would hold every
    // event until the buffer filled and defeat the whole point.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  req.socket.setNoDelay?.(true);
}

/** The visitor's stream: their own threads only. */
supportRouter.get("/stream", async (req, res) => {
  const userId = req.user?.id ?? null;
  const token = guestToken(req);
  const key = callerKey(userId, token);

  if (!key) {
    res.status(400).json({ error: "No conversation to follow." });
    return;
  }

  const threads = await listThreads(userId, token);
  openStream(req, res);

  const teardown = addClient(res, { kind: "visitor", threadKey: key }, threads.map((t) => t.id));

  res.write(`event: ready\ndata: ${JSON.stringify({ ...presenceSnapshot(), admins: undefined })}\n\n`);
  for (const t of threads) broadcastVisitorPresence(t.id, true);

  req.on("close", () => {
    teardown();
    for (const t of threads) broadcastVisitorPresence(t.id, false);
  });
});

/** The admin's stream: every thread. */
supportRouter.get("/admin/stream", requireAuth, requireAdmin, requireScope("messages"), async (req, res) => {
  const admin = { id: req.user!.id, name: req.user!.name };
  openStream(req, res);

  const teardown = addClient(res, { kind: "admin", adminId: admin.id, name: admin.name });

  res.write(`event: ready\ndata: ${JSON.stringify(presenceSnapshot())}\n\n`);
  broadcastPresence();
  await drainUnassigned();

  req.on("close", teardown);
});

/* ── Visitor side ────────────────────────────────────────────────────────── */

/** The caller's conversations. Creates nothing. */
supportRouter.get("/threads/mine", async (req, res) => {
  const userId = req.user?.id ?? null;
  let token = guestToken(req);
  if (!userId && !token) token = randomBytes(16).toString("hex");

  const threads = await listThreads(userId, token);
  res.json({
    threads: threads.map(publicThread),
    guest_token: userId ? null : token,
    staffed: onlineAdmins().length > 0,
  });
});

/** One conversation's transcript. Opening it clears the caller's badge. */
supportRouter.get("/threads/mine/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }

  const userId = req.user?.id ?? null;
  const token = guestToken(req);
  const thread = await ownedThread(id, userId, token);
  if (!thread) { res.status(404).json({ error: "No such conversation." }); return; }

  if (thread.unread_for_user > 0) {
    await db.prepare("UPDATE support_threads SET unread_for_user = 0 WHERE id = ?").run(id);
  }

  res.json({
    thread: publicThread({ ...thread, unread_for_user: 0 }),
    messages: await messagesFor(id),
    typing: typingIn(id),
    staffed: onlineAdmins().length > 0,
  });
});

/**
 * Sends a message.
 *
 * Omitting `thread_id` starts a new conversation, which is what "start a new
 * chat" does. Passing one continues that conversation.
 */
supportRouter.post("/messages", startLimit, sendLimit, async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (body.length < 1) { res.status(400).json({ error: "Type a message first." }); return; }
  if (body.length > MAX_BODY) {
    res.status(400).json({ error: `Keep it under ${MAX_BODY} characters.` });
    return;
  }

  const userId = req.user?.id ?? null;
  let token = guestToken(req);
  const requestedId = req.body?.thread_id === undefined ? null : Number(req.body.thread_id);

  let thread: ThreadRow | undefined;
  let created = false;

  if (requestedId !== null && Number.isInteger(requestedId)) {
    thread = await ownedThread(requestedId, userId, token);
    if (!thread) { res.status(404).json({ error: "No such conversation." }); return; }
  } else {
    if (!userId && !token) token = randomBytes(16).toString("hex");

    const open = (await listThreads(userId, token)).filter((t) => t.status === "open").length;
    if (open >= MAX_OPEN_THREADS) {
      res.status(429).json({ error: "You already have several conversations open. Continue one of those." });
      return;
    }

    const name = req.user?.name ?? String(req.body?.name ?? "").trim().slice(0, 60);
    const info = await db
      .prepare(
        `INSERT INTO support_threads (user_id, guest_token, display_name, subject, unread_for_admin)
         VALUES (?, ?, ?, ?, 0)`
      )
      .run(userId, userId ? null : token, name || "Guest", body.slice(0, 80));
    thread = (await db
      .prepare("SELECT * FROM support_threads WHERE id = ?")
      .get(Number(info.lastInsertRowid))) as unknown as ThreadRow;
    created = true;

    const key = callerKey(userId, token);
    if (key) watchThread(key, thread.id);
  }

  const count = ((await db
    .prepare("SELECT COUNT(*) AS c FROM support_messages WHERE thread_id = ?")
    .get(thread.id)) as { c: number }).c;
  if (count >= MAX_MESSAGES_PER_THREAD) {
    res.status(429).json({ error: "This conversation is very long. Start a new one." });
    return;
  }

  const info = await db
    .prepare("INSERT INTO support_messages (thread_id, sender, author_name, body) VALUES (?, 'user', ?, ?)")
    .run(thread.id, req.user?.name ?? thread.display_name, body);

  await db.prepare(
    `UPDATE support_threads
     SET last_message_at = now_text(),
         unread_for_admin = unread_for_admin + 1,
         status = CASE WHEN status = 'closed' THEN 'open' ELSE status END
     WHERE id = ?`
  ).run(thread.id);

  const message = await db
    .prepare("SELECT id, thread_id, sender, author_name, body, kind, created_at FROM support_messages WHERE id = ?")
    .get(Number(info.lastInsertRowid));

  clearTyping(thread.id, "user");
  toEveryone(thread.id, "message", message);
  toAdmins("thread_touched", { thread_id: thread.id, created });

  // A brand new conversation goes straight to whoever is at the desk.
  if (created) {
    const admin = await pickAdmin();
    if (admin) await assign(thread.id, admin);
  }

  const fresh = (await db.prepare("SELECT * FROM support_threads WHERE id = ?").get(thread.id)) as unknown as ThreadRow;

  res.status(201).json({
    ok: true,
    thread: publicThread(fresh),
    message,
    messages: await messagesFor(thread.id),
    guest_token: userId ? null : (thread.guest_token ?? token),
    staffed: onlineAdmins().length > 0,
  });
});

/** Keystroke signal. Deliberately does no database work. */
supportRouter.post("/threads/:id/typing", typingLimit, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }

  const thread = await ownedThread(id, req.user?.id ?? null, guestToken(req));
  if (!thread) { res.status(404).json({ error: "No such conversation." }); return; }

  if (req.body?.stopped) clearTyping(id, "user");
  else setTyping(id, "user", thread.display_name || "Customer");

  res.json({ ok: true });
});

/* ── Admin side ──────────────────────────────────────────────────────────── */

supportRouter.get("/threads", requireAuth, requireAdmin, requireScope("messages"), async (req, res) => {
  const status = String(req.query.status ?? "");
  const mine = req.query.mine === "1";

  const rows = (await db
    .prepare(
      `SELECT t.id, t.display_name, t.subject, t.status, t.last_message_at, t.unread_for_admin,
              t.created_at, t.assigned_admin_id,
              u.email AS user_email, u.name AS user_name,
              a.name AS assigned_admin_name,
              (SELECT body FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
              (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id) AS message_count
       FROM support_threads t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN users a ON a.id = t.assigned_admin_id
       WHERE (? = '' OR t.status = ?)
         AND (? = 0 OR t.assigned_admin_id = ?)
       ORDER BY t.unread_for_admin > 0 DESC, t.last_message_at DESC
       LIMIT 200`
    )
    .all(status, status, mine ? 1 : 0, req.user!.id)) as Record<string, unknown>[];

  res.json({
    threads: rows.map((r) => ({
      ...r,
      visitor_online: isThreadWatched(Number(r.id)),
    })),
    online_admins: onlineAdmins(),
  });
});

supportRouter.get("/threads/:id", requireAuth, requireAdmin, requireScope("messages"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }

  const thread = await db
    .prepare(
      `SELECT t.*, u.email AS user_email, a.name AS assigned_admin_name
       FROM support_threads t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN users a ON a.id = t.assigned_admin_id
       WHERE t.id = ?`
    )
    .get(id);
  if (!thread) { res.status(404).json({ error: "No such conversation." }); return; }

  const transfers = await db
    .prepare(
      `SELECT tr.created_at, tr.note, f.name AS from_name, x.name AS to_name
       FROM support_transfers tr
       LEFT JOIN users f ON f.id = tr.from_admin_id
       LEFT JOIN users x ON x.id = tr.to_admin_id
       WHERE tr.thread_id = ? ORDER BY tr.id`
    )
    .all(id);

  await db.prepare("UPDATE support_threads SET unread_for_admin = 0 WHERE id = ?").run(id);

  res.json({
    thread,
    messages: await messagesFor(id),
    transfers,
    typing: typingIn(id),
    visitor_online: isThreadWatched(id),
    online_admins: onlineAdmins(),
  });
});

supportRouter.post("/threads/:id/reply", requireAuth, requireAdmin, requireScope("messages"), sendLimit, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }

  const body = String(req.body?.body ?? "").trim();
  if (!body) { res.status(400).json({ error: "Type a reply first." }); return; }
  if (body.length > MAX_BODY) {
    res.status(400).json({ error: `Keep it under ${MAX_BODY} characters.` });
    return;
  }

  const thread = (await db.prepare("SELECT * FROM support_threads WHERE id = ?").get(id)) as ThreadRow | undefined;
  if (!thread) { res.status(404).json({ error: "No such conversation." }); return; }

  const info = await db
    .prepare("INSERT INTO support_messages (thread_id, sender, author_name, body) VALUES (?, 'admin', ?, ?)")
    .run(id, req.user!.name, body);

  // Replying to an unclaimed thread claims it: the person answering is the
  // person who owns it, whatever the router decided earlier.
  const claim = thread.assigned_admin_id === null;
  await db.prepare(
    `UPDATE support_threads
     SET last_message_at = now_text(),
         unread_for_user = unread_for_user + 1,
         unread_for_admin = 0,
         assigned_admin_id = COALESCE(assigned_admin_id, ?),
         assigned_at = COALESCE(assigned_at, now_text())
     WHERE id = ?`
  ).run(req.user!.id, id);

  const message = await db
    .prepare("SELECT id, thread_id, sender, author_name, body, kind, created_at FROM support_messages WHERE id = ?")
    .get(Number(info.lastInsertRowid));

  clearTyping(id, "admin");
  toEveryone(id, "message", message);
  if (claim) {
    toAdmins("thread_assigned", { thread_id: id, admin_id: req.user!.id, admin_name: req.user!.name });
  }

  res.status(201).json({ ok: true, message, messages: await messagesFor(id) });
});

supportRouter.post("/threads/:id/typing", requireAuth, requireAdmin, requireScope("messages"), typingLimit, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }

  if (req.body?.stopped) clearTyping(id, "admin");
  else setTyping(id, "admin", req.user!.name);

  res.json({ ok: true });
});

/** Who a thread can be handed to. */
supportRouter.get("/admins", requireAuth, requireAdmin, requireScope("messages"), async (req, res) => {
  const rows = (await db
    .prepare(
      `SELECT id, name, email, role FROM users
       WHERE role IN ('admin', 'super_admin') AND id != ?
       ORDER BY role = 'super_admin' DESC, name`
    )
    .all(req.user!.id)) as { id: number; name: string; email: string; role: string }[];

  const online = new Set(onlineAdmins().map((a) => a.id));
  res.json({ admins: rows.map((a) => ({ ...a, online: online.has(a.id) })) });
});

/**
 * Hands a conversation to another admin.
 *
 * The transcript is untouched, so the receiving admin opens the thread and
 * reads everything that has already been said. A note travels with it and is
 * written into the transcript as a system line, visible to staff and to the
 * customer — a handover the customer cannot see reads as being ignored.
 */
supportRouter.post("/threads/:id/forward", requireAuth, requireAdmin, requireScope("messages"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }

  const toId = Number(req.body?.to_admin_id);
  const note = String(req.body?.note ?? "").trim().slice(0, 300);

  const thread = (await db.prepare("SELECT * FROM support_threads WHERE id = ?").get(id)) as ThreadRow | undefined;
  if (!thread) { res.status(404).json({ error: "No such conversation." }); return; }

  const target = (await db
    .prepare("SELECT id, name, role FROM users WHERE id = ? AND role IN ('admin', 'super_admin')")
    .get(toId)) as { id: number; name: string; role: string } | undefined;
  if (!target) { res.status(400).json({ error: "That is not an admin." }); return; }
  if (target.id === thread.assigned_admin_id) {
    res.status(400).json({ error: "That conversation is already theirs." });
    return;
  }

  await db.prepare(
    "INSERT INTO support_transfers (thread_id, from_admin_id, to_admin_id, note) VALUES (?, ?, ?, ?)"
  ).run(id, req.user!.id, target.id, note);

  await db.prepare(
    "UPDATE support_threads SET assigned_admin_id = ?, assigned_at = now_text(), unread_for_admin = unread_for_admin + 1 WHERE id = ?"
  ).run(target.id, id);

  const line = await systemLine(id, `${req.user!.name} passed this to ${target.name}.${note ? ` Note: ${note}` : ""}`);
  toEveryone(id, "message", line);
  toAdmins("thread_assigned", { thread_id: id, admin_id: target.id, admin_name: target.name });

  audit(req, { action: "support.forward", targetType: "support_thread", targetId: id, detail: `to ${target.name}` });
  res.json({ ok: true, assigned_admin_id: target.id, assigned_admin_name: target.name });
});

supportRouter.patch("/threads/:id", requireAuth, requireAdmin, requireScope("messages"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }

  const status = String(req.body?.status ?? "");
  if (status !== "open" && status !== "closed") {
    res.status(400).json({ error: "Status must be open or closed." });
    return;
  }

  await db.prepare("UPDATE support_threads SET status = ? WHERE id = ?").run(status, id);
  toThread(id, "thread_status", { thread_id: id, status });
  toAdmins("thread_touched", { thread_id: id });

  audit(req, { action: "support.status", targetType: "support_thread", targetId: id, detail: status });
  res.json({ ok: true });
});

supportRouter.delete("/threads/:id", requireAuth, requireAdmin, requireScope("messages"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad conversation id." }); return; }
  await db.prepare("DELETE FROM support_threads WHERE id = ?").run(id);
  toAdmins("thread_deleted", { thread_id: id });
  audit(req, { action: "support.delete", targetType: "support_thread", targetId: id });
  res.json({ ok: true });
});
