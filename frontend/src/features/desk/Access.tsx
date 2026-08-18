import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { AdminAction, AdminScope, StaffAccess } from "~/lib/api";
import { http } from "~/lib/http";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Avatar, Badge } from "~/ui/Bits";
import { Switch } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { useSession } from "~/state/session";
import { DeskPage, Loaded, Nothing, Stat, TableWrap } from "./parts";

const ROLE_TEMPLATES: { key: string; label: string; hint: string; scopes: AdminScope[] }[] = [
  { key: "manager", label: "Manager", hint: "Runs the restaurant: bookings, orders, queue, floor, menu, people and money.", scopes: ["door", "bookings", "takeaway", "queue", "floor", "menu", "offers", "gallery", "reviews", "events", "payments", "promos", "giftcards", "messages", "guests", "insights", "settings", "legal"] },
  { key: "frontdesk", label: "Front desk", hint: "Check guests in and keep tonight moving.", scopes: ["door", "bookings", "takeaway", "queue", "floor", "messages", "guests"] },
  { key: "kitchen", label: "Kitchen", hint: "See takeaway work without exposing customer administration.", scopes: ["takeaway"] },
  { key: "marketing", label: "Marketing", hint: "Manage what customers discover on the site.", scopes: ["menu", "offers", "gallery", "reviews", "events", "insights"] },
  { key: "support", label: "Support", hint: "Handle guest conversations and basic guest lookup.", scopes: ["messages", "guests", "bookings", "takeaway"] },
];
const ACTIONS: { key: AdminAction; label: string }[] = [
  { key: "view", label: "View" }, { key: "create", label: "Create" }, { key: "edit", label: "Edit" }, { key: "delete", label: "Delete" },
  { key: "cancel", label: "Cancel" }, { key: "refund", label: "Refund" }, { key: "export", label: "Export" }, { key: "manage", label: "Manage" },
];

export function Access() {
  const { isTopOwner } = useSession();
  const access = useResource(() => api.desk.access.list(), []);
  const toast = useToast(); const { confirm, confirmElement } = useConfirm();
  const [editing, setEditing] = useState<StaffAccess | null>(null); const [templateBusy, setTemplateBusy] = useState<number | null>(null);
  const staff = access.data?.staff ?? []; const superAdmins = staff.filter((s) => s.role === "super_admin").length; const restricted = staff.filter((s) => s.role === "admin" && Object.values(s.scopes).some((v) => !v)).length;
  if (!isTopOwner) return <DeskPage title="Access"><Notice tone="warn">This page is for the owner only.</Notice></DeskPage>;

  async function applyTemplate(staffer: StaffAccess, templateIndex: number) {
    const template = ROLE_TEMPLATES[templateIndex]; if (!template) return;
    const confirmed = await confirm({ title: `Apply ${template.label} to ${staffer.name}?`, body: `${template.hint} This changes the page access immediately and replaces the current access map.`, confirmLabel: `Apply ${template.label}`, destructive: true }); if (!confirmed) return;
    setTemplateBusy(staffer.id); try { const wanted = new Set(template.scopes); for (const scope of Object.keys(staffer.scopes) as AdminScope[]) { const next = wanted.has(scope); if (staffer.scopes[scope] !== next) await api.desk.access.setScope(staffer.id, scope, next); } access.reload(); toast.done(`${template.label} access applied to ${staffer.name}.`); } catch (err) { toast.failed(err); access.reload(); } finally { setTemplateBusy(null); }
  }
  return <DeskPage title="Access" lead="The owner decides who can enter the Desk, which pages they can reach, and which actions they can perform.">
    {confirmElement}
    <div className="stat-grid"><Stat label="Staff" value={staff.length} icon="users" /><Stat label="Super admins" value={superAdmins} icon="shield" hint="Unrestricted. Demote them rather than trying to lock individual pages." /><Stat label="Restricted" value={restricted} icon="lock" hint="Admins locked out of at least one page." /></div>
    <Loaded resource={access}>{(data) => data.staff.length === 0 ? <Nothing>Nobody has staff access yet.</Nothing> : <TableWrap><thead><tr><th>Who</th><th>Role</th><th>Access</th><th>Joined</th><th /></tr></thead><tbody>{data.staff.map((row) => { const lockedCount = Object.values(row.scopes).filter((v) => !v).length; return <tr key={row.id}><td><span className="row"><Avatar name={row.name} /><span><strong>{row.name}</strong><p className="fine faint">{row.email}</p></span></span></td><td>{row.role === "super_admin" ? <Badge tone="hot">Super admin</Badge> : <Badge tone="good">Staff</Badge>}</td><td>{row.role === "super_admin" ? <span className="fine faint">Unrestricted</span> : lockedCount === 0 ? <span className="fine faint">Full page access</span> : <Badge tone="warn">{lockedCount} pages locked</Badge>}</td><td className="fine faint">{stampLabel(row.created_at)}</td><td><div className="table__actions">{row.role === "admin" ? <Button size="sm" tone="quiet" busy={templateBusy === row.id} onClick={() => setEditing(row)}>Permissions</Button> : null}{row.role === "admin" ? <select className="select" aria-label={`Role template for ${row.name}`} disabled={templateBusy === row.id} value="" onChange={(event) => { const index = ROLE_TEMPLATES.findIndex((item) => item.key === event.target.value); if (index >= 0) void applyTemplate(row, index); }}><option value="">Apply role…</option>{ROLE_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}</select> : null}<Button size="sm" tone="ghost" onClick={async () => { const promoting = row.role === "admin"; const ok = await confirm({ title: promoting ? `Make ${row.name} a super admin?` : `Demote ${row.name} to admin?`, body: promoting ? "They get every page and every action. Only the owner outranks them." : "They go back to a plain admin with their current page restrictions retained.", confirmLabel: promoting ? "Make super admin" : "Demote", destructive: !promoting }); if (!ok) return; try { await api.desk.access.setRole(row.id, promoting ? "super_admin" : "admin"); access.reload(); toast.done(promoting ? "Now a super admin." : "Demoted to admin."); } catch (err) { toast.failed(err); } }}>{row.role === "admin" ? "Make super admin" : "Demote"}</Button></div></td></tr>; })}</tbody></TableWrap>}</Loaded>
    <PermissionsSheet staffer={editing} scopes={access.data?.scopes ?? []} onClose={() => setEditing(null)} onChanged={() => access.reload()} />
  </DeskPage>;
}

function PermissionsSheet({ staffer, scopes, onClose, onChanged }: { staffer: StaffAccess | null; scopes: { key: AdminScope; label: string; hint: string }[]; onClose: () => void; onChanged: () => void; }) {
  const toast = useToast(); const [busy, setBusy] = useState<string | null>(null); const [scope, setScope] = useState<AdminScope>(scopes[0]?.key ?? "door");
  const lockedCount = useMemo(() => staffer ? Object.values(staffer.scopes).filter((v) => !v).length : 0, [staffer]);
  if (!staffer) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  return <Sheet open onClose={onClose} title={`${staffer.name}'s permissions`} description={lockedCount === 0 ? "All pages are on. You can still restrict individual actions below." : `${lockedCount} page${lockedCount === 1 ? "" : "s"} locked.`}>
    <div className="stack"><Notice tone="info">Page access controls the broad area. Action controls are narrower: for example, an admin can view Payments but be blocked from refunds.</Notice><div className="row row--wrap">{scopes.map((item) => <button key={item.key} type="button" className={`btn ${scope === item.key ? "btn--primary" : "btn--ghost"}`} onClick={() => setScope(item.key)}>{item.label}</button>)}</div><section className="stack"><Switch checked={staffer.scopes[scope] ?? true} label={<><strong>{scopes.find((item) => item.key === scope)?.label}</strong><span className="fine faint">{scopes.find((item) => item.key === scope)?.hint}</span></>} disabled={busy === `scope:${scope}`} onChange={async (next) => { setBusy(`scope:${scope}`); try { await api.desk.access.setScope(staffer.id, scope, next); onChanged(); } catch (err) { toast.failed(err); } finally { setBusy(null); } }} />{ACTIONS.map((action) => <Switch key={action.key} checked={staffer.actions[scope]?.[action.key] ?? true} label={`${action.label} ${scopes.find((item) => item.key === scope)?.label ?? scope}`} disabled={busy === `action:${action.key}`} onChange={async (next) => { setBusy(`action:${action.key}`); try { await http.patch<{ ok: true }>(`/api/access/${staffer.id}/action`, { scope, action: action.key, granted: next }); onChanged(); } catch (err) { toast.failed(err); } finally { setBusy(null); } }} />)}</section></div>
  </Sheet>;
}
