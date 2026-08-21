import { api } from "~/lib/api";
import type { AdminScope, StaffAccess } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { Action } from "~/ui/Button";
import { Switch } from "~/ui/Field";
import { useConfirm } from "~/ui/Sheet";
import { Avatar } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Loaded, Nothing, Section, State } from "./parts";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";

/**
 * Which member of staff can see which screen.
 *
 * Owner only, and the page says so rather than simply not appearing, because
 * somebody who was told "it is under Staff access" and cannot find it will ask.
 *
 * ── Default is allowed ─────────────────────────────────────────────────────
 *
 * A new admin can reach everything until somebody takes something away. That is
 * the server's model, not this screen's, and it is the right way round for a
 * restaurant: the alternative is hiring somebody on a Friday and spending the
 * evening ticking eighteen boxes before they can take a booking.
 *
 * Super admins are shown but cannot be restricted, because the server does not
 * restrict them. Pretending otherwise here would be a switch that does nothing.
 */
export function Access() {
  const toast = useToast();
  const { isTopOwner, user } = useSession();
  const { confirm, element } = useConfirm();

  const access = useQuery(K.desk.access, () => api.desk.access.list(), { enabled: isTopOwner, staleMs: 60_000 });

  const setScope = useMutation(async (input: { id: number; scope: AdminScope; granted: boolean }) => {
    await api.desk.access.setScope(input.id, input.scope, input.granted);
    invalidate("desk.access*");
    access.reload();
  });

  const setRole = useMutation(async (input: { id: number; role: "admin" | "super_admin" }) => {
    await api.desk.access.setRole(input.id, input.role);
    invalidate("desk.access*");
    access.reload();
    toast.done("Saved.");
  });

  if (!isTopOwner) {
    return (
      <DeskPage title="Staff access">
        <Notice tone="info" title="Owner only">
          Only the owner can change what other staff can see. Ask them if you need something opened up.
        </Notice>
      </DeskPage>
    );
  }

  return (
    <DeskPage
      title="Staff access"
      hint="Everybody can see everything until you take something away."
    >
      <Loaded query={access}>
        {(data) =>
          data.staff.length === 0 ? (
            <Nothing icon="shield">No staff yet. Make somebody staff under Guests first.</Nothing>
          ) : (
            data.staff.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                scopes={data.scopes}
                isSelf={member.id === user?.id}
                busy={setScope.pending}
                roleBusy={setRole.pending}
                onScope={(scope, granted) => void setScope.run({ id: member.id, scope, granted })}
                onRole={async (role) => {
                  const promoting = role === "super_admin";
                  const sure = await confirm({
                    title: promoting ? `Make ${member.name} a super admin?` : `Make ${member.name} an ordinary admin?`,
                    body: promoting
                      ? "A super admin can see everything, unblock accounts, make other people staff, and read the audit log. You cannot restrict them."
                      : "They keep the console but can be restricted again, and lose the audit log.",
                    confirmLabel: promoting ? "Make them super admin" : "Make them admin",
                    tone: promoting ? "primary" : "danger",
                  });
                  if (!sure) return;
                  await setRole.run({ id: member.id, role });
                }}
              />
            ))
          )
        }
      </Loaded>

      {element}
    </DeskPage>
  );
}

function StaffCard({
  member,
  scopes,
  isSelf,
  busy,
  roleBusy,
  onScope,
  onRole,
}: {
  member: StaffAccess;
  scopes: { key: AdminScope; label: string; hint: string }[];
  isSelf: boolean;
  busy: boolean;
  roleBusy: boolean;
  onScope: (scope: AdminScope, granted: boolean) => void;
  onRole: (role: "admin" | "super_admin") => void;
}) {
  const unrestricted = member.role === "super_admin";

  return (
    <Section title={member.name} hint={member.email}>
      <div className="bar bar--tight bar--wrap">
        <Avatar name={member.name} size={28} />
        <State tone={unrestricted ? "hot" : "neutral"}>{unrestricted ? "Super admin" : "Admin"}</State>
        {member.banned_at ? <State tone="bad">Blocked</State> : null}
        {isSelf ? <State tone="good">You</State> : null}

        <span className="push">
          <Action
            size="sm"
            tone="quiet"
            pending={roleBusy}
            pendingLabel="Saving"
            disabled={isSelf}
            onClick={() => onRole(unrestricted ? "admin" : "super_admin")}
          >
            {unrestricted ? "Make ordinary admin" : "Make super admin"}
          </Action>
        </span>
      </div>

      {isSelf ? (
        <p className="fine faint">
          You cannot change your own access. Ask another owner if you need to.
        </p>
      ) : null}

      {unrestricted ? (
        <p className="fine faint">
          A super admin is not restricted by these switches, so they are not shown. Make them an ordinary admin first if
          you need to limit what they see.
        </p>
      ) : (
        <div className="dk-scopes">
          {scopes.map((scope) => (
            <Switch
              key={scope.key}
              label={scope.label}
              hint={scope.hint}
              checked={member.scopes[scope.key] !== false}
              disabled={busy || isSelf}
              onChange={(granted) => onScope(scope.key, granted)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
