import type { Request } from "express";
import { db } from "../db.js";

/**
 * Append-only log of privileged actions. Every admin mutation writes one row so
 * a destructive change can always be traced back to who made it and when.
 */

const insert = db.prepare(
  `INSERT INTO admin_audit_log (actor_id, actor_name, action, target_type, target_id, detail, ip)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string | number | null;
  detail?: string;
}

export function audit(req: Request, entry: AuditEntry): void {
  try {
    insert.run(
      req.user?.id ?? null,
      req.user?.name ?? "",
      entry.action,
      entry.targetType ?? "",
      entry.targetId != null ? String(entry.targetId) : null,
      (entry.detail ?? "").slice(0, 500),
      req.ip ?? req.socket?.remoteAddress ?? ""
    );
  } catch (err) {
    // Logging must never break the action it is recording.
    console.error("[audit] failed to write entry", err);
  }
}
