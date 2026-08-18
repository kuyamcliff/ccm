import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { AdminScope, StaffAccess } from "~/lib/api";
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

export function Access() {
  const { isTopOwner } = useSession();
  const access = useResource(() => api.desk.access.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const [editing, setEditing] = useState<StaffAccess | null>(null);
  const [templateBusy, setTemplateBusy] = useState<number | null>(null);

  const staff = access.data?.staff ?? [];
  const superAdmins = staff.filter((s) => s.role === "super_admin").length;
  const restricted = staff.filter((s) => s.role === "admin" && Object.values(s.scopes).some((v) => !v)).length;

  if (!isTopOwner) return <DeskPage title="Access"><Notice tone="warn">This page is for the owner only.</Notice></DeskPage>;

  async function applyTemplate(staffer: StaffAccess, templateIndex: number) {
    const template = ROLE_TEMPLATES[templateIndex];
    if (!template) return;
    const confirmed = await confirm({ title: `Apply ${template.label} to ${staffer.name}?`, body: `${template.hint} This changes the page access immediately and replaces the current access map.`, confirmLabel: `Apply ${template.label}`, destructive: true });
    if (!confirmed) return;
    setTemplateBusy(staffer.id);
    try {
      const wanted = new Set(template.scopes);
      for (const scope of Object.keys(staffer.scopes) as AdminScope[]) {
        const next = wanted.has(scope);
        if (staffer.scopes[scope] !== next) await api.desk.access.setScope(staffer.id, scope, next);
      }
      access.set((current) => current ? { ...current, staff: current.staff.map((s) => s.id === staffer.id ? { ...s, scopes: Object.fromEntries((Object.keys(s.scopes) as AdminScope[]).map((scope) => [scope, wanted.has(scope)])) as StaffAccess["scopes"] } : s) } : current);
      setEditing((current) => current && current.id === staffer.id ? { ...current, scopes: Object.fromEntries((Object.keys(staffer.scopes) as AdminScope[]).map((scope) => [scope, wanted.has(scope)])) as StaffAccess["scopes"] } : current);
      toast.done(`${template.label} access applied to ${staffer.name}.`);
    } catch (err) { toast.failed(err); access.reload(); }
    finally { setTemplateBusy(null); }
  }

  return (
    <DeskPage title="Access" lead="Decide who can enter the Desk and what each plain admin can reach. The owner controls this page.">
      {confirmElement}
      <div className="stat-grid"><Stat label="Staff" value={staff.length} icon="users" /><Stat label="Super admins" value={superAdmins} icon="shield" hint="Unrestricted like the owner, but cannot change owner access." /><Stat label="Restricted" value={restricted} icon="lock" hint="Admins locked out of at least one page." /></div>
      <Loaded resource={access}>
        {(data) => data.staff.length === 0 ? <Nothing>Nobody has staff access yet.</Nothing> : <TableWrap>
          <thead><tr><th>Who</th><th>Role</th><th>Access</th><th>Joined</th><th /></tr></thead>
          <tbody>{data.staff.map((row) => {
            const lockedCount = Object.values(row.scopes).filter((v) => !v).length;
            return <tr key={row.id}>
              <td><span className="row"><Avatar name={row.name} /><span><strong>{row.name}</strong><p className="fine faint">{row.email}</p></span></span></td>
              <td>{row.role === "super_admin" ? <Badge tone="hot">Super admin</Badge> : <Badge tone="good">Staff</Badge>}</td>
              <td>{row.role === "super_admin" ? <span className="fine faint">Unrestricted</span> : lockedCount === 0 ? <span className="fine faint">Full access</span> : <Badge tone="warn">{lockedCount} locked</Badge>}</td>
              <td className="fine faint">{stampLabel(row.created_at)}</td>
              <td><div className="table__actions">
                {row.role === "admin" ? <Button size="sm" tone="quiet" busy={templateBusy === row.id} onClick={() => setEditing(row)}>Permissions</Button> : null}
                {row.role === "admin" ? <select className="select" aria-label={`Role template for ${row.name}`} disabled={templateBusy === row.id} value="" onChange={(event) => { const index = ROLE_TEMPLATES.findIndex((item) => item.key === event.target.value); if (index >= 0) void applyTemplate(row, index); event.currentTarget.value = ""; }}><option value="">Apply role…</option>{ROLE_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}</select> : null}
                <Button size="sm" tone="ghost" onClick={async () => {
                  const promoting = row.role === "admin";
                  const ok = await confirm({ title: promoting ? `Make ${row.name} a super admin?` : `Demote ${row.name} to admin?`, body: promoting ? "They get every page and every action you have, with nothing locked. Only the owner outranks them." : "They go back to a plain admin with their previous page restrictions retained.", confirmLabel: promoting ? "Make super admin" : "Demote", destructive: !promoting });
                  if (!ok) return;
                  try { await api.desk.access.setRole(row.id, promoting ? "super_admin" : "admin"); access.reload(); toast.done(promoting ? "Now a super admin." : "Demoted to admin."); } catch (err) { toast.failed(err); }
                }}>{row.role === "admin" ? "Make super admin" : "Demote"}</Button>
              </div></td>
            </tr>;
          })}</tbody>
        </TableWrap>}
      </Loaded>
      <PermissionsSheet staffer={editing} scopes={access.data?.scopes ?? []} onClose={() => setEditing(null)} onChanged={(id, scope, granted) => { access.set((current) => current ? { ...current, staff: current.staff.map((s) => s.id === id ? { ...s, scopes: { ...s.scopes, [scope]: granted } } : s) } : current); setEditing((cur) => cur && cur.id === id ? { ...cur, scopes: { ...cur.scopes, [scope]: granted } } : cur); }} />
    </DeskPage>
  );
}

function PermissionsSheet({ staffer, scopes, onClose, onChanged }: { staffer: StaffAccess | null; scopes: { key: AdminScope; label: string; hint: string }[]; onClose: () => void; onChanged: (id: number, scope: AdminScope, granted: boolean) => void; }) {
  const toast = useToast();
  const [busy, setBusy] = useState<AdminScope | null>(null);
  const lockedCount = useMemo(() => staffer ? Object.values(staffer.scopes).filter((v) => !v).length : 0, [staffer]);
  return <Sheet open={staffer !== null} onClose={onClose} title={staffer ? `${staffer.name}'s access` : ""} description={staffer ? lockedCount === 0 ? "Every page is switched on." : `${lockedCount} page${lockedCount === 1 ? "" : "s"} locked.` : undefined}>
    {staffer ? <div className="stack">
      <Notice tone="info">These are page-level controls today. The server remains authoritative even when a page is hidden from the Desk.</Notice>
      {scopes.map((scope) => <Switch key={scope.key} label={<span>{scope.label}<span className="fine faint" style={{ display: "block" }}>{scope.hint}</span></span>} checked={staffer.scopes[scope.key] ?? true} disabled={busy === scope.key} onChange={async (next) => { setBusy(scope.key); try { await api.desk.access.setScope(staffer.id, scope.key, next); onChanged(staffer.id, scope.key, next); } catch (err) { toast.failed(err); } finally { setBusy(null); } }} />)}
    </div> : null}
  </Sheet>;
}
