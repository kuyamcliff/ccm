import type { Response } from "express";

/**
 * Server-sent events for the support desk.
 *
 * SSE rather than WebSockets: every message here travels server → client, the
 * transport survives a proxy that only understands HTTP, and the browser
 * reconnects on its own. The one client → server signal (typing) is a plain
 * POST, which is cheaper than holding a duplex socket open for it.
 *
 * Everything lives in this process's memory. That is the right trade for a
 * single-server deployment: presence and typing are worthless once stale, so
 * there is nothing here worth persisting or sharing across instances.
 */

export type Audience =
  | { kind: "admin"; adminId: number; name: string }
  | { kind: "visitor"; threadKey: string };

interface Client {
  id: number;
  res: Response;
  audience: Audience;
  /** Threads a visitor client is allowed to see. Admins see everything. */
  threadIds: Set<number>;
}

let nextClientId = 1;
const clients = new Map<number, Client>();

/** Admin id → last time one of their connections was seen. */
const adminSeen = new Map<number, { name: string; at: number }>();

/** thread id → who is typing and when they last said so. */
interface TypingState { who: "user" | "admin"; name: string; at: number }
const typing = new Map<number, TypingState>();

/** A typing flag older than this is treated as "stopped". */
export const TYPING_TTL_MS = 5000;

/** Heartbeat interval. Also keeps proxies from closing an idle connection. */
const PING_MS = 25_000;

function write(client: Client, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // A dead socket is dropped on its own 'close' event; nothing to do here.
  }
}

/**
 * Registers a connection and returns the teardown.
 *
 * The caller has already written the SSE headers.
 */
export function addClient(res: Response, audience: Audience, threadIds: number[] = []): () => void {
  const id = nextClientId++;
  const client: Client = { id, res, audience, threadIds: new Set(threadIds) };
  clients.set(id, client);

  if (audience.kind === "admin") {
    const wasOffline = !isAdminOnline(audience.adminId);
    adminSeen.set(audience.adminId, { name: audience.name, at: Date.now() });
    if (wasOffline) broadcastPresence();
  }

  const ping = setInterval(() => {
    // A comment frame is a valid SSE keep-alive and fires no client handler.
    try { res.write(`: ping\n\n`); } catch { /* closing */ }
    if (client.audience.kind === "admin") {
      adminSeen.set(client.audience.adminId, { name: client.audience.name, at: Date.now() });
    }
  }, PING_MS);

  return () => {
    clearInterval(ping);
    clients.delete(id);
    if (audience.kind === "admin" && !isAdminOnline(audience.adminId)) {
      adminSeen.delete(audience.adminId);
      broadcastPresence();
    }
  };
}

/** True while at least one connection for that admin is open. */
export function isAdminOnline(adminId: number): boolean {
  for (const c of clients.values()) {
    if (c.audience.kind === "admin" && c.audience.adminId === adminId) return true;
  }
  return false;
}

/** Every admin currently holding a connection, most recently seen first. */
export function onlineAdmins(): { id: number; name: string }[] {
  const seen = new Map<number, string>();
  for (const c of clients.values()) {
    if (c.audience.kind === "admin") seen.set(c.audience.adminId, c.audience.name);
  }
  return Array.from(seen, ([id, name]) => ({ id, name }));
}

/** True while the visitor side of that thread has a connection open. */
export function isThreadWatched(threadId: number): boolean {
  for (const c of clients.values()) {
    if (c.audience.kind === "visitor" && c.threadIds.has(threadId)) return true;
  }
  return false;
}

/** Lets a visitor client follow a thread created after it connected. */
export function watchThread(threadKey: string, threadId: number): void {
  for (const c of clients.values()) {
    if (c.audience.kind === "visitor" && c.audience.threadKey === threadKey) {
      c.threadIds.add(threadId);
    }
  }
}

/** Sends to every admin connection. */
export function toAdmins(event: string, data: unknown): void {
  for (const c of clients.values()) {
    if (c.audience.kind === "admin") write(c, event, data);
  }
}

/** Sends to the visitor side of one thread. */
export function toThread(threadId: number, event: string, data: unknown): void {
  for (const c of clients.values()) {
    if (c.audience.kind === "visitor" && c.threadIds.has(threadId)) write(c, event, data);
  }
}

/** Sends to both sides of a thread. */
export function toEveryone(threadId: number, event: string, data: unknown): void {
  toThread(threadId, event, data);
  toAdmins(event, data);
}

/* ── Typing ─────────────────────────────────────────────────────────────── */

export function setTyping(threadId: number, who: "user" | "admin", name: string): void {
  typing.set(threadId, { who, name, at: Date.now() });
  // The other side is the only one that needs to see it — echoing a typing
  // flag back to its author makes the author's own indicator flicker.
  const payload = { thread_id: threadId, who, name };
  if (who === "user") toAdmins("typing", payload);
  else toThread(threadId, "typing", payload);
}

export function clearTyping(threadId: number, who: "user" | "admin"): void {
  const current = typing.get(threadId);
  if (!current || current.who !== who) return;
  typing.delete(threadId);
  const payload = { thread_id: threadId, who, stopped: true };
  if (who === "user") toAdmins("typing", payload);
  else toThread(threadId, "typing", payload);
}

/** Who is typing in that thread, or null once the flag has gone stale. */
export function typingIn(threadId: number): { who: "user" | "admin"; name: string } | null {
  const state = typing.get(threadId);
  if (!state) return null;
  if (Date.now() - state.at > TYPING_TTL_MS) {
    typing.delete(threadId);
    return null;
  }
  return { who: state.who, name: state.name };
}

/* ── Presence ───────────────────────────────────────────────────────────── */

/**
 * Tells everyone whether the desk is staffed.
 *
 * Visitors are given a boolean, not the roster: which member of staff is at
 * the desk is none of a customer's business, and the count would leak how
 * small the team is.
 */
export function broadcastPresence(): void {
  const admins = onlineAdmins();
  toAdmins("presence", { admins, staffed: admins.length > 0 });
  for (const c of clients.values()) {
    if (c.audience.kind === "visitor") write(c, "presence", { staffed: admins.length > 0 });
  }
}

/** Announces a visitor arriving or leaving so the admin list can show it. */
export function broadcastVisitorPresence(threadId: number, online: boolean): void {
  toAdmins("visitor_presence", { thread_id: threadId, online });
}

/** Snapshot for a client that has just connected. */
export function presenceSnapshot() {
  const admins = onlineAdmins();
  return { admins, staffed: admins.length > 0 };
}

/** Sweeps typing flags that were never explicitly cleared. */
setInterval(() => {
  const now = Date.now();
  for (const [threadId, state] of typing) {
    if (now - state.at <= TYPING_TTL_MS) continue;
    typing.delete(threadId);
    const payload = { thread_id: threadId, who: state.who, stopped: true };
    if (state.who === "user") toAdmins("typing", payload);
    else toThread(threadId, "typing", payload);
  }
  for (const [adminId, entry] of adminSeen) {
    if (!isAdminOnline(adminId)) adminSeen.delete(adminId);
    else adminSeen.set(adminId, entry);
  }
}, 2000).unref();
