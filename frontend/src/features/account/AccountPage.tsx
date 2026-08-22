import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { checkPassword, passwordScore } from "~/lib/passwordStrength";
import { addPasskey, passkeysSupported } from "~/lib/passkey";
import { money, stampLabel, timeAgo } from "~/lib/format";
import { Icon, type IconName } from "~/ui/Icon";
import { Action, Button, IconButton, LinkButton } from "~/ui/Button";
import { TextField, PasswordField, Segmented } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Badge, Meter, Money } from "~/ui/Bits";
import { EmptyState, Notice, SkeletonRows } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

const SCORE_WORDS = ["Too weak", "Weak", "Getting there", "Good", "Strong"];

type Tab = "profile" | "security" | "rewards";

/**
 * The account.
 *
 * Three tabs, because these are three different jobs: who you are, how you get
 * in, and what you have earned. Rolling them into one scroll makes the security
 * settings, which are the ones somebody comes here deliberately to change, the
 * hardest to find.
 *
 * Everything destructive asks first, and asks in words that say what will
 * actually happen rather than "are you sure".
 */
export function AccountPage() {
  const { c } = useCopy();
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div className="page section stack">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.account.title}</h1>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        label={c.account.title}
        options={[
          { value: "profile", label: c.account.profile },
          { value: "security", label: c.account.security },
          { value: "rewards", label: c.account.rewards },
        ]}
      />

      {/* Above the tabs, because it is not one of the three jobs those tabs are
          for and because somebody signing in to work should not have to guess
          which tab their console is filed under. */}
      <StaffPanel />

      {tab === "profile" ? <Profile /> : tab === "security" ? <Security /> : <Rewards />}
    </div>
  );
}

/**
 * The way into the console, for whoever has one.
 *
 * Staff already get a Desk button in the top bar, which is right for somebody
 * mid-shift and useless for somebody who has just signed in on their own phone
 * and is looking at their account. This is where a person looks when they are
 * asking "what am I allowed to do here", so this is where it says so.
 *
 * The wording names the role rather than the place. "Desk" means nothing until
 * somebody has been shown it once; "Owner panel" tells them what they are, and
 * what they get is different enough between the tiers to be worth naming:
 * an admin sees a service console, an owner also sees the money and the staff,
 * a developer also sees the machinery.
 *
 * Nothing here is access control. Every one of these routes checks the role
 * again on the way in and the server checks it a third time; this only stops a
 * guest being shown a door that would not open.
 */
function StaffPanel() {
  const { c } = useCopy();
  const { isStaff, isTopOwner, isDeveloper } = useSession();

  if (!isStaff) return null;

  /* Ranked, so the highest role a person holds is the one named. `isTopOwner`
     is true for a developer too, hence the order. */
  const title = isDeveloper
    ? c.account.panelDeveloper
    : isTopOwner
      ? c.account.panelOwner
      : c.account.panelAdmin;

  const body = isDeveloper
    ? c.account.panelDeveloperBody
    : isTopOwner
      ? c.account.panelOwnerBody
      : c.account.panelAdminBody;

  return (
    <section className="carry panel-in">
      <div className="stack stack--tight">
        <span className="label hot">{title}</span>
        <p className="fine muted">{body}</p>
      </div>

      <div className="bar bar--tight bar--wrap">
        <LinkButton to="/desk" tone="primary" size="sm" block iconEnd="arrow-right">
          {c.account.panelEnter}
        </LinkButton>

        {/* Only a developer, and only as a second door: the console rail already
            carries this group for them. It is here because the machinery is the
            reason the role exists, and a developer signing in to look at an
            error should not have to go through Overview to get to it. */}
        {isDeveloper ? (
          <LinkButton to="/desk/dev" tone="quiet" size="sm" block icon="terminal">
            {c.account.devTools}
          </LinkButton>
        ) : null}
      </div>
    </section>
  );
}

/* ── A labelled group of rows ───────────────────────────────────────────────*/

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="stack stack--snug">
      <div className="stack stack--tight">
        <h2 className="label">{title}</h2>
        {hint ? <p className="fine faint">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/* ── Profile ────────────────────────────────────────────────────────────────*/

function Profile() {
  const { c } = useCopy();
  const { user, refresh, signOut } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { confirm, element } = useConfirm();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closePassword, setClosePassword] = useState("");

  const saveName = useMutation(async () => {
    await api.me.changeName(name.trim());
    await refresh();
    toast.done("Name saved.");
  });

  const changeEmail = useMutation(async () => {
    const result = await api.me.changeEmail(email.trim(), password);
    setPassword("");
    if (result.pending) {
      setAwaitingCode(true);
      toast.say(c.account.emailCodeSent);
      return;
    }
    await refresh();
    toast.done("Email saved.");
  });

  const confirmEmail = useMutation(async () => {
    await api.me.confirmEmailChange(emailCode.trim());
    setEmailCode("");
    setAwaitingCode(false);
    await refresh();
    toast.done("Email saved.");
  });

  const leaving = useMutation(async () => {
    await signOut();
    navigate("/", { replace: true });
  });

  const close = useMutation(async () => {
    await api.me.closeAccount(closePassword);
    await signOut();
    navigate("/", { replace: true });
  });

  return (
    <div className="stack stack--loose">
      <Group title={c.account.name}>
        <form
          className="stack stack--snug"
          onSubmit={async (event) => {
            event.preventDefault();
            await saveName.run();
            const error = saveName.readError();
            if (error) toast.failed(error, "save");
          }}
        >
          <TextField label={c.account.name} value={name} onChange={(event) => setName(event.target.value)} required />
          <Action
            type="submit"
            size="sm"
            tone="primary"
            pending={saveName.pending}
            pendingLabel={c.pending.saving}
            disabled={name.trim() === user?.name || name.trim().length < 2}
          >
            {c.common.save}
          </Action>
        </form>
      </Group>

      <Group title={c.account.email} hint="Changing this sends a code to the new address to prove it is yours.">
        {awaitingCode ? (
          <form
            className="stack stack--snug"
            onSubmit={async (event) => {
              event.preventDefault();
              await confirmEmail.run();
              const error = confirmEmail.readError();
              if (error) toast.failed(error, "save");
            }}
          >
            <Notice tone="info">{c.account.emailCodeSent}</Notice>
            <TextField
              label={c.account.emailCode}
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={6}
              required
            />
            <Action
              type="submit"
              size="sm"
              tone="primary"
              pending={confirmEmail.pending}
              pendingLabel={c.pending.checking}
              disabled={emailCode.length < 6}
            >
              {c.auth.verify}
            </Action>
          </form>
        ) : (
          <form
            className="stack stack--snug"
            onSubmit={async (event) => {
              event.preventDefault();
              await changeEmail.run();
              const error = changeEmail.readError();
              if (error) toast.failed(error, "save");
            }}
          >
            <TextField
              label={c.account.email}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              inputMode="email"
              required
            />
            <PasswordField
              label={c.account.currentPassword}
              hint="To prove it is you."
              value={password}
              onChange={setPassword}
            />
            <Action
              type="submit"
              size="sm"
              tone="primary"
              pending={changeEmail.pending}
              pendingLabel={c.pending.saving}
              disabled={email.trim() === user?.email || !password}
            >
              {c.account.changeEmail}
            </Action>
          </form>
        )}
      </Group>

      <Group title="Signing out">
        {/* Signing out is a request to the server, not a local flag: the session
            cookie has to be cleared at the other end. On a slow connection that
            is a second or two of a button that used to look like it had not
            been pressed. */}
        <Action
          tone="ghost"
          size="sm"
          icon="logout"
          block
          pending={leaving.pending}
          pendingLabel={c.pending.signingOut}
          onClick={async () => {
            await leaving.run();
            const error = leaving.readError();
            if (error) toast.failed(error, "load");
          }}
        >
          {c.account.signOut}
        </Action>
      </Group>

      <Group title={c.account.closeAccount} hint={c.account.closeBody}>
        <Button tone="quiet" size="sm" icon="trash" onClick={() => setClosing(true)}>
          {c.account.closeAccount}
        </Button>
      </Group>

      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title={c.account.closeConfirm}
        footer={
          <Action
            tone="danger"
            block
            pending={close.pending}
            pendingLabel={c.pending.deleting}
            disabled={!closePassword}
            onClick={async () => {
              const sure = await confirm({
                title: c.account.closeConfirm,
                body: c.account.closeBody,
                confirmLabel: "Close it",
                cancelLabel: "Keep it",
              });
              if (!sure) return;
              await close.run();
              const error = close.readError();
              if (error) toast.failed(error, "delete");
            }}
          >
            {c.account.closeAccount}
          </Action>
        }
      >
        <div className="stack">
          <p className="lead">{c.account.closeBody}</p>
          <PasswordField label={c.account.currentPassword} value={closePassword} onChange={setClosePassword} />
        </div>
      </Sheet>

      {element}
    </div>
  );
}

/* ── Security ───────────────────────────────────────────────────────────────*/

function Security() {
  const { c } = useCopy();
  const toast = useToast();
  const { confirm, element } = useConfirm();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ uri: string; qrDataUrl: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);

  const twoFactor = useQuery(K.myTwoFactor, () => api.me.twoFactorStatus(), { staleMs: 60_000 });
  const passkeys = useQuery(K.myPasskeys, () => api.me.passkeys(), { staleMs: 60_000 });
  const sessions = useQuery(K.mySessions, () => api.me.sessions(), { staleMs: 30_000 });

  const strength = useMemo(() => {
    if (!next) return null;
    const complaint = checkPassword(next);
    return { score: passwordScore(next), label: SCORE_WORDS[passwordScore(next)] ?? "", problems: complaint ? [complaint] : [] };
  }, [next]);

  const changePassword = useMutation(async () => {
    const complaint = checkPassword(next);
    if (complaint) throw new Error(complaint);
    await api.me.changePassword(current, next);
    setCurrent("");
    setNext("");
    invalidate(K.mySessions);
    toast.done(c.account.passwordChanged);
  });

  const beginTwoFactor = useMutation(async () => {
    const setup = await api.me.beginTwoFactor();
    setTwoFactorSetup({ uri: setup.uri, qrDataUrl: setup.qrDataUrl });
  });

  const enableTwoFactor = useMutation(async () => {
    await api.me.confirmTwoFactor(twoFactorCode.trim());
    setTwoFactorSetup(null);
    setTwoFactorCode("");
    invalidate(K.myTwoFactor);
    twoFactor.reload();
    toast.done("Two-step sign in is on.");
  });

  const disableTwoFactor = useMutation(async () => {
    await api.me.disableTwoFactor(disablePassword);
    setDisablePassword("");
    setDisabling(false);
    invalidate(K.myTwoFactor);
    twoFactor.reload();
    toast.done("Two-step sign in is off.");
  });

  const enrolPasskey = useMutation(async () => {
    await addPasskey();
    invalidate(K.myPasskeys);
    passkeys.reload();
    toast.done("Passkey added.");
  });

  const dropPasskey = useMutation(async (id: number) => {
    await api.me.removePasskey(id);
    invalidate(K.myPasskeys);
    passkeys.reload();
  });

  const endSession = useMutation(async (id: string) => {
    await api.me.revokeSession(id);
    invalidate(K.mySessions);
    sessions.reload();
  });

  const signOutOthers = useMutation(async () => {
    await api.me.signOutEverywhere();
    invalidate(K.mySessions);
    sessions.reload();
    toast.done("Signed out everywhere else.");
  });

  return (
    <div className="stack stack--loose">
      {/* ── Password ───────────────────────────────────────────────────────*/}
      <Group title={c.account.password} hint="Changing it signs out every other device.">
        <form
          className="stack stack--snug"
          onSubmit={async (event) => {
            event.preventDefault();
            await changePassword.run();
            const error = changePassword.readError();
            if (error) toast.failed(error, "save");
          }}
        >
          <PasswordField label={c.account.currentPassword} value={current} onChange={setCurrent} />
          <PasswordField
            label={c.account.newPassword}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            strength={strength}
          />
          <Action
            type="submit"
            size="sm"
            tone="primary"
            pending={changePassword.pending}
            pendingLabel={c.pending.saving}
            disabled={!current || !next}
          >
            {c.common.save}
          </Action>
        </form>
      </Group>

      {/* ── Two step ───────────────────────────────────────────────────────*/}
      <Group title={c.account.twoStep} hint={c.account.twoStepBody}>
        <div className="rows">
          <div className="row">
            <Icon name="shield" size={17} className="row__lead" />
            <span className="grow">{c.account.twoStep}</span>
            <Badge tone={twoFactor.data?.enabled ? "good" : "neutral"}>
              {twoFactor.data?.enabled ? c.account.twoStepOn : c.account.twoStepOff}
            </Badge>
          </div>
        </div>

        {twoFactor.data?.enabled ? (
          disabling ? (
            <form
              className="stack stack--snug"
              onSubmit={async (event) => {
                event.preventDefault();
                await disableTwoFactor.run();
                const error = disableTwoFactor.readError();
                if (error) toast.failed(error, "save");
              }}
            >
              <PasswordField label={c.account.currentPassword} value={disablePassword} onChange={setDisablePassword} />
              <div className="bar bar--tight">
                <Button tone="quiet" size="sm" block onClick={() => setDisabling(false)}>
                  {c.common.cancel}
                </Button>
                <Action
                  type="submit"
                  size="sm"
                  tone="danger"
                  block
                  pending={disableTwoFactor.pending}
                  pendingLabel={c.pending.saving}
                  disabled={!disablePassword}
                >
                  Turn it off
                </Action>
              </div>
            </form>
          ) : (
            <Button tone="quiet" size="sm" onClick={() => setDisabling(true)}>
              Turn it off
            </Button>
          )
        ) : (
          <Action
            size="sm"
            tone="ghost"
            icon="shield"
            pending={beginTwoFactor.pending}
            pendingLabel={c.pending.checking}
            onClick={async () => {
              await beginTwoFactor.run();
              const error = beginTwoFactor.readError();
              if (error) toast.failed(error, "save");
            }}
          >
            Turn it on
          </Action>
        )}
      </Group>

      {/* ── Passkeys ───────────────────────────────────────────────────────*/}
      <Group title={c.account.passkeys} hint={c.account.passkeysBody}>
        {passkeys.loading ? (
          <SkeletonRows count={1} />
        ) : (passkeys.data?.length ?? 0) === 0 ? (
          <p className="fine faint">None yet.</p>
        ) : (
          <div className="rows">
            {passkeys.data?.map((key) => (
              <div key={key.id} className="row">
                <Icon name="key" size={17} className="row__lead" />
                <span className="grow stack stack--tight">
                  <span className="small">{key.display_name}</span>
                  <span className="fine faint">
                    {key.last_used_at ? `Last used ${timeAgo(key.last_used_at)}` : `Added ${stampLabel(key.created_at)}`}
                  </span>
                </span>
                <IconButton
                  name="trash"
                  label={`Remove ${key.display_name}`}
                  size="sm"
                  pending={dropPasskey.pendingFor(key.id)}
                  onClick={async () => {
                    const sure = await confirm({
                      title: "Remove this passkey?",
                      body: "You will not be able to sign in with it afterwards.",
                      confirmLabel: "Remove it",
                    });
                    if (!sure) return;
                    await dropPasskey.run(key.id);
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {passkeysSupported() ? (
          <Action
            size="sm"
            tone="ghost"
            icon="key"
            pending={enrolPasskey.pending}
            pendingLabel={c.pending.saving}
            onClick={async () => {
              await enrolPasskey.run();
              const error = enrolPasskey.readError();
              if (error) toast.failed(error, "save");
            }}
          >
            {c.account.addPasskey}
          </Action>
        ) : (
          <p className="fine faint">This device does not support passkeys.</p>
        )}
      </Group>

      {/* ── Devices ────────────────────────────────────────────────────────*/}
      <Group title={c.account.devices}>
        {sessions.loading ? (
          <SkeletonRows count={2} />
        ) : (
          <div className="rows">
            {sessions.data?.map((entry) => (
              <div key={entry.id} className="row">
                <Icon name={deviceIcon(entry.device_type)} size={17} className="row__lead" />
                <span className="grow stack stack--tight">
                  <span className="small">{entry.device_name}</span>
                  <span className="fine faint">
                    {entry.location ? `${entry.location} · ` : ""}
                    {timeAgo(entry.last_seen_at)}
                  </span>
                </span>
                {entry.current ? (
                  <Badge tone="good">{c.account.thisDevice}</Badge>
                ) : (
                  <IconButton
                    name="logout"
                    label={`Sign out ${entry.device_name}`}
                    size="sm"
                    pending={endSession.pendingFor(entry.id)}
                    onClick={() => void endSession.run(entry.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <Action
          size="sm"
          tone="quiet"
          icon="logout"
          pending={signOutOthers.pending}
          pendingLabel={c.pending.signingOut}
          onClick={async () => {
            const sure = await confirm({
              title: c.account.signOutOthers,
              body: "Every other phone and computer will have to sign in again. This one stays signed in.",
              confirmLabel: "Sign them out",
              tone: "primary",
            });
            if (!sure) return;
            await signOutOthers.run();
          }}
        >
          {c.account.signOutOthers}
        </Action>
      </Group>

      {/* ── Turning two step on ────────────────────────────────────────────*/}
      <Sheet
        open={twoFactorSetup !== null}
        onClose={() => setTwoFactorSetup(null)}
        title={c.account.twoStep}
        footer={
          <Action
            tone="primary"
            block
            pending={enableTwoFactor.pending}
            pendingLabel={c.pending.checking}
            disabled={twoFactorCode.length < 6}
            onClick={async () => {
              await enableTwoFactor.run();
              const error = enableTwoFactor.readError();
              if (error) toast.failed(error, "save");
            }}
          >
            {c.auth.verify}
          </Action>
        }
      >
        <div className="stack">
          <p className="lead">
            Scan this with your authenticator app, then type the six-digit code it gives you.
          </p>
          {twoFactorSetup ? (
            <img src={twoFactorSetup.qrDataUrl} alt="" width={180} height={180} className="qr" />
          ) : null}
          <TextField
            label={c.auth.code}
            value={twoFactorCode}
            onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={6}
          />
        </div>
      </Sheet>

      {element}
    </div>
  );
}

function deviceIcon(type: string): IconName {
  if (type === "tablet") return "tablet";
  if (type === "desktop") return "monitor";
  return "smartphone";
}

/* ── Rewards ────────────────────────────────────────────────────────────────*/

function Rewards() {
  const { c, fill } = useCopy();
  const { siteConfig } = useVenue();
  const loyalty = useQuery(K.myLoyalty, () => api.me.loyalty(), { staleMs: 60_000 });

  if (!siteConfig.features.loyalty) {
    return <EmptyState icon="sparkle" title="Points are switched off at the moment." />;
  }

  if (loyalty.loading) return <SkeletonRows count={3} />;

  const data = loyalty.data;
  if (!data) return <EmptyState icon="sparkle" title={c.common.nothingYet} />;

  const shortBy = Math.max(0, data.rules.min_redeem_points - data.points_balance);

  return (
    <div className="stack stack--loose">
      <div className="carry points">
        <p className="label">{c.account.pointsBalance}</p>
        <p className="display display--hero points__number">{data.points_balance}</p>
        <p className="lead">{fill(c.account.pointsWorth, { value: money(data.value_fcfa) })}</p>

        {shortBy > 0 ? (
          <>
            <Meter value={data.points_balance} max={data.rules.min_redeem_points} label={c.account.pointsBalance} />
            <p className="fine muted">{fill(c.account.pointsNeed, { n: shortBy })}</p>
          </>
        ) : (
          <Badge tone="good">Ready to spend</Badge>
        )}
      </div>

      <p className="fine faint">
        {fill(c.account.pointsBody, { per: money(data.rules.fcfa_per_point) })} Points cover at most{" "}
        {data.rules.max_redeem_percent}% of a bill, so the rest always arrives as money.
      </p>

      <Group title={c.account.pointsHistory}>
        {data.ledger.length === 0 ? (
          <p className="fine faint">{c.common.nothingYet}</p>
        ) : (
          <div className="rows">
            {data.ledger.map((entry, index) => (
              <div key={`${entry.created_at}-${index}`} className="row">
                <Icon name={entry.amount > 0 ? "plus" : "minus"} size={15} className="row__lead" />
                <span className="grow stack stack--tight">
                  <span className="small">{entry.reason}</span>
                  <span className="fine faint">{stampLabel(entry.created_at)}</span>
                </span>
                <span className={entry.amount > 0 ? "small strong" : "small muted"}>
                  {entry.amount > 0 ? "+" : ""}
                  {entry.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </Group>

      <Group title={c.mine.receipt}>
        <Receipts />
      </Group>
    </div>
  );
}

function Receipts() {
  const { c } = useCopy();
  const { data, loading } = useQuery(K.myReceipts, () => api.me.receipts(), { staleMs: 60_000 });

  if (loading) return <SkeletonRows count={2} />;
  if (!data || data.length === 0) return <p className="fine faint">{c.common.nothingYet}</p>;

  return (
    <div className="rows">
      {data.map((receipt) => (
        <div key={receipt.id} className="row">
          <Icon name="receipt" size={17} className="row__lead" />
          <span className="grow stack stack--tight">
            <span className="small">
              {receipt.date}, {receipt.time}
            </span>
            <span className="fine faint">{receipt.ccm_code ?? receipt.pay_method ?? ""}</span>
          </span>
          {receipt.amount_fcfa ? <Money value={receipt.amount_fcfa} size="fine" /> : null}
        </div>
      ))}
    </div>
  );
}
