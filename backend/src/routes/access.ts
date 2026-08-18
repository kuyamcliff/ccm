import { Router } from "express";
import { db } from "../db.js";
import { ADMIN_ACTIONS, ADMIN_SCOPES, isAdminAction, isAdminScope, requireAuth, requireOwner, revokeSessions, scopeMapForUser, actionMapForUser } from "../auth.js";
import { audit } from "../lib/audit.js";
export const accessRouter = Router();

accessRouter.get("/mine", requireAuth, async (req, res) => {
  const role = req.user!.role;
  if (!["admin", "super_admin", "owner"].includes(role)) { res.json({ role, scopes: {}, actions: {} }); return; }
  res.json({ role, scopes: await scopeMapForUser(req.user!.id, role), actions: await actionMapForUser(req.user!.id, role) });
});
accessRouter.use(requireAuth, requireOwner);

accessRouter.get("/", async (_req, res) => {
  const staff = (await db.prepare(`SELECT id, name, email, role, banned_at, created_at FROM users WHERE role IN ('admin', 'super_admin') ORDER BY role DESC, name`).all()) as { id: number; name: string; email: string; role: "admin" | "super_admin"; banned_at: string | null; created_at: string }[];
  const rows = await Promise.all(staff.map(async (person) => ({ ...person, scopes: await scopeMapForUser(person.id, person.role), actions: await actionMapForUser(person.id, person.role) })));
  res.json({ scopes: ADMIN_SCOPES, actions: ADMIN_ACTIONS, staff: rows });
});

accessRouter.patch("/:id/scope", async (req, res) => {
  const id = Number(req.params.id); const scope = req.body?.scope; const granted = !!req.body?.granted;
  if (!Number.isInteger(id) || !isAdminScope(scope)) { res.status(400).json({ error: "Not a real permission." }); return; }
  const target = (await db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(id)) as { id: number; name: string; role: string } | undefined;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "Only a plain admin can be restricted this way." }); return; }
  await db.prepare(`INSERT INTO admin_permissions (user_id, scope, granted, updated_at, updated_by) VALUES (?, ?, ?, now_text(), ?) ON CONFLICT (user_id, scope) DO UPDATE SET granted = EXCLUDED.granted, updated_at = now_text(), updated_by = EXCLUDED.updated_by`).run(id, scope, granted ? 1 : 0, req.user!.id);
  audit(req, { action: granted ? "access.unlock" : "access.lock", targetType: "user", targetId: id, detail: `${target.name}: ${scope}` }); res.json({ ok: true });
});

accessRouter.patch("/:id/action", async (req, res) => {
  const id = Number(req.params.id); const scope = req.body?.scope; const action = req.body?.action; const granted = !!req.body?.granted;
  if (!Number.isInteger(id) || !isAdminScope(scope) || !isAdminAction(action)) { res.status(400).json({ error: "Not a real action permission." }); return; }
  const target = (await db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(id)) as { id: number; name: string; role: string } | undefined;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "Only a plain admin can be restricted this way." }); return; }
  await db.prepare(`INSERT INTO admin_action_permissions (user_id, scope, action, granted, updated_at, updated_by) VALUES (?, ?, ?, ?, now_text(), ?) ON CONFLICT (user_id, scope, action) DO UPDATE SET granted = EXCLUDED.granted, updated_at = now_text(), updated_by = EXCLUDED.updated_by`).run(id, scope, action, granted ? 1 : 0, req.user!.id);
  audit(req, { action: granted ? "access.action.unlock" : "access.action.lock", targetType: "user", targetId: id, detail: `${target.name}: ${scope}.${action}` }); res.json({ ok: true });
});

accessRouter.patch("/:id/role", async (req, res) => {
  const id = Number(req.params.id); const role = String(req.body?.role ?? "");
  if (!Number.isInteger(id) || (role !== "admin" && role !== "super_admin")) { res.status(400).json({ error: "Role must be 'admin' or 'super_admin'." }); return; }
  if (id === req.user!.id) { res.status(400).json({ error: "You cannot change your own role." }); return; }
  const target = (await db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(id)) as { id: number; name: string; role: string } | undefined;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.role === "owner") { res.status(403).json({ error: "There is only one owner." }); return; }
  if (target.role !== "admin" && target.role !== "super_admin") { res.status(400).json({ error: "Only existing staff can be promoted or demoted here." }); return; }
  if (target.role === role) { res.json({ ok: true }); return; }
  await db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  if (role === "super_admin") { await db.prepare("DELETE FROM admin_permissions WHERE user_id = ?").run(id); await db.prepare("DELETE FROM admin_action_permissions WHERE user_id = ?").run(id); }
  await revokeSessions(id);
  audit(req, { action: "access.role", targetType: "user", targetId: id, detail: `${target.name}: ${target.role} → ${role}` }); res.json({ ok: true });
});
