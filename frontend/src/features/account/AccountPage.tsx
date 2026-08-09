import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import { dayLabel, money, stampLabel, timeLabel } from "~/lib/format";
import { useAction, useResource } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Avatar, Badge, Money } from "~/ui/Bits";
import { EmptyState, ErrorState, Notice, Skeleton, SkeletonCards } from "~/ui/Feedback";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { PasswordField } from "~/ui/PasswordField";
import { checkPassword } from "~/lib/passwordStrength";
import { PasskeyError, addPasskey, passkeysSupported } from "~/lib/passkey";
import { Icon } from "~/ui/Icon";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";

/**
 * The account: who you are, how it is protected, and what it has earned.
 *
 * Anything that ends access — signing out everywhere, closing the account —
 * is kept at the bottom and asks for the password, well away from the fields
 * people come here to edit.
 */

function Profile() {
  const { user, refresh } = useSession();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const saveName = useAction(api.me.changeName);
  const saveEmail = useAction(api.me.changeEmail);
  const savePassword = useAction(api.me.changePassword);

  return (
    <div className="stack stack--loose">
      <section className="card stack">
        <h2 className="card__title">Your details</h2>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!(await saveName.run(name.trim()))) {
              toast.failed(saveName.readError());
              return;
            }
            await refresh();
            toast.done("Name updated.");
          }}
        >
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          <div className="row">
            <Button type="submit" busy={saveName.busy} disabled={name.trim() === user?.name}>
              Save name
            </Button>
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2 className="card__title">Email</h2>
        <p className="fine muted">Changing it needs your password, because this address can reset the account.</p>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!(await saveEmail.run(email.trim(), emailPassword))) {
              toast.failed(saveEmail.readError());
              return;
            }
            setEmailPassword("");
            await refresh();
            toast.done("Email updated.");
          }}
        >
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <TextField
            label="Current password"
            type="password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="row">
            <Button type="submit" busy={saveEmail.busy} disabled={!emailPassword || email.trim() === user?.email}>
              Change email
            </Button>
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2 className="card__title">Password</h2>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const weak = checkPassword(next, { name: user?.name, email: user?.email });
            if (weak) {
              toast.failed(weak);
              return;
            }
            if (!(await savePassword.run(current, next))) {
              toast.failed(savePassword.readError());
              return;
            }
            setCurrent("");
            setNext("");
            toast.done("Password changed.");
          }}
        >
          <TextField
            label="Current password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
          <PasswordField
            label="New password"
            value={next}
            onChange={setNext}
            identity={{ name: user?.name, email: user?.email }}
            required
          />
          <div className="row">
            <Button
              type="submit"
              busy={savePassword.busy}
              disabled={!current || checkPassword(next, { name: user?.name, email: user?.email }) !== null}
            >
              Change password
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Security() {
  const toast = useToast();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const { confirm, confirmElement } = useConfirm();

  const status = useResource(() => api.me.twoFactorStatus(), []);
  const passkeys = useResource(() => api.me.passkeys(), []);

  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [closing, setClosing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [addingKey, setAddingKey] = useState(false);
  const [keyProblem, setKeyProblem] = useState<string | null>(null);
  const canUsePasskeys = passkeysSupported();

  const begin = useAction(api.me.beginTwoFactor);
  const confirmCode = useAction(api.me.confirmTwoFactor);
  const disable = useAction(api.me.disableTwoFactor);
  const close = useAction(api.me.closeAccount);

  return (
    <div className="stack stack--loose">
      {confirmElement}

      <section className="card stack">
        <div className="row row--between">
          <h2 className="card__title">Two step sign in</h2>
          {status.loading ? null : (
            <Badge tone={status.data?.enabled ? "good" : "neutral"}>{status.data?.enabled ? "On" : "Off"}</Badge>
          )}
        </div>
        <p className="fine muted">
          With this on, your password alone is not enough to get in. You also type a code from an authenticator app on
          your phone.
        </p>

        {status.data?.enabled ? (
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!(await disable.run(password))) {
                toast.failed(disable.readError());
                return;
              }
              setPassword("");
              status.reload();
              toast.done("Two step sign in switched off.");
            }}
          >
            <TextField
              label="Your password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div className="row">
              <Button type="submit" tone="danger" busy={disable.busy} disabled={!password}>
                Switch it off
              </Button>
            </div>
          </form>
        ) : (
          <div className="row">
            <Button
              icon="shield"
              busy={begin.busy}
              onClick={async () => {
                const result = await begin.run();
                if (!result) {
                  toast.failed(begin.readError());
                  return;
                }
                setSetup({ secret: result.secret, qrDataUrl: result.qrDataUrl });
              }}
            >
              Set it up
            </Button>
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row row--between">
          <h2 className="card__title">Passkeys</h2>
          {canUsePasskeys ? (
            <Button
              size="sm"
              icon="key"
              busy={addingKey}
              onClick={async () => {
                setAddingKey(true);
                setKeyProblem(null);
                try {
                  const name = await addPasskey();
                  passkeys.reload();
                  toast.done(`${name} can now sign you in.`);
                } catch (err) {
                  /* Cancelling the fingerprint prompt is a decision, not an
                     error, and it should not paint the screen red. */
                  if (err instanceof PasskeyError && err.cancelled) return;
                  setKeyProblem(err instanceof Error ? err.message : "That did not work.");
                } finally {
                  setAddingKey(false);
                }
              }}
            >
              Add
            </Button>
          ) : null}
        </div>

        <p className="fine muted">
          Sign in with your fingerprint, your face or your screen lock instead of a password. The key stays on this
          device.
        </p>

        {keyProblem ? <Notice tone="bad">{keyProblem}</Notice> : null}
        {!canUsePasskeys ? <p className="fine faint">This browser does not support passkeys.</p> : null}

        {passkeys.loading ? (
          <Skeleton height="3rem" />
        ) : (passkeys.data ?? []).length === 0 ? (
          <p className="fine muted">No passkeys on this account yet.</p>
        ) : (
          <ul className="stack stack--tight">
            {(passkeys.data ?? []).map((key) => (
              <li key={key.id} className="row row--between">
                <span className="fine">
                  <Icon name="key" size={15} /> {key.display_name}
                  <span className="faint"> added {stampLabel(key.created_at)}</span>
                </span>
                <Button
                  size="sm"
                  tone="danger"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Remove this passkey?",
                      body: "You will not be able to sign in with it again.",
                      confirmLabel: "Remove",
                    });
                    if (!ok) return;
                    try {
                      await api.me.removePasskey(key.id);
                      passkeys.reload();
                      toast.done("Passkey removed.");
                    } catch (err) {
                      toast.failed(err);
                    }
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack">
        <h2 className="card__title">Need a hand</h2>
        <p className="fine muted">Message the restaurant about a booking, an order, or anything else.</p>
        <div className="row">
          <LinkButton to="/help" icon="message">
            Message us
          </LinkButton>
        </div>
      </section>

      <section className="card stack">
        <h2 className="card__title">Sessions</h2>
        <p className="fine muted">
          Signs you out on every device, including this one. Use it if you have signed in somewhere you should not have.
        </p>
        <div className="row">
          <Button
            icon="logout"
            onClick={async () => {
              const ok = await confirm({
                title: "Sign out everywhere?",
                body: "Every device will need to sign in again.",
                confirmLabel: "Sign out everywhere",
              });
              if (!ok) return;
              try {
                await api.me.signOutEverywhere();
                await signOut();
                navigate("/signin", { replace: true });
              } catch (err) {
                toast.failed(err);
              }
            }}
          >
            Sign out everywhere
          </Button>
        </div>
      </section>

      <section className="card stack card--hot">
        <h2 className="card__title">Close this account</h2>
        <p className="fine muted">
          Your bookings and orders stay in the restaurant's records, which we are required to keep. Everything that
          identifies you goes.
        </p>
        <div className="row">
          <Button tone="danger" onClick={() => setClosing(true)}>
            Close my account
          </Button>
        </div>
      </section>

      <Sheet
        open={Boolean(setup)}
        onClose={() => setSetup(null)}
        title="Scan this"
        description="Open your authenticator app, scan the square, then type the code it shows."
        footer={
          <>
            <Button tone="ghost" onClick={() => setSetup(null)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              busy={confirmCode.busy}
              onClick={async () => {
                if (!(await confirmCode.run(code.trim()))) {
                  setProblem("That code was not accepted. Try the next one it shows.");
                  return;
                }
                setSetup(null);
                setCode("");
                setProblem(null);
                status.reload();
                toast.done("Two step sign in is on.");
              }}
            >
              Turn it on
            </Button>
          </>
        }
      >
        {setup ? (
          <>
            <img className="qr" src={setup.qrDataUrl} alt="" width={200} height={200} />
            <div className="fine faint">
              Cannot scan? Type this key instead:
              <code className="secret">{setup.secret}</code>
            </div>
            <TextField
              label="Code from the app"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
            />
            {problem ? <Notice tone="bad">{problem}</Notice> : null}
          </>
        ) : null}
      </Sheet>

      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title="Close this account"
        description="This cannot be undone."
        footer={
          <>
            <Button tone="ghost" onClick={() => setClosing(false)}>
              Keep it
            </Button>
            <Button
              tone="danger"
              busy={close.busy}
              disabled={!password}
              onClick={async () => {
                if (!(await close.run(password))) {
                  toast.failed(close.readError());
                  return;
                }
                await signOut();
                navigate("/", { replace: true });
                toast.say("Your account is closed.");
              }}
            >
              Close it
            </Button>
          </>
        }
      >
        <TextField
          label="Your password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </Sheet>
    </div>
  );
}

function Rewards() {
  const loyalty = useResource(() => api.me.loyalty(), []);
  const receipts = useResource(() => api.me.receipts(), []);

  return (
    <div className="stack stack--loose">
      <section className="card stack">
        <h2 className="card__title">Points</h2>
        {loyalty.loading ? (
          <Skeleton height="4rem" />
        ) : loyalty.error ? (
          <ErrorState error={loyalty.error} onRetry={loyalty.reload} />
        ) : (
          <>
            <p className="points mono">{loyalty.data?.points_balance ?? 0}</p>
            {/* The balance in money, because a point is a number nobody can
                value on sight, and the rules underneath so the figure is not a
                claim the guest has to take on trust. */}
            <p className="fine muted">
              {loyalty.data && loyalty.data.value_fcfa > 0 ? (
                <>
                  Worth <Money value={loyalty.data.value_fcfa} /> off a bill.{" "}
                </>
              ) : null}
              One point for every {money(loyalty.data?.rules.fcfa_per_point ?? 100)} FCFA you spend.
              {loyalty.data && !loyalty.data.spendable
                ? ` They can be used once you have ${loyalty.data.rules.min_redeem_points}.`
                : " They come off when you book a table or pay for an order."}
            </p>
            {(loyalty.data?.ledger ?? []).length > 0 ? (
              <ul className="stack stack--tight" style={{ marginTop: "var(--s-3)" }}>
                {(loyalty.data?.ledger ?? []).slice(0, 8).map((entry, index) => (
                  <li key={index} className="row row--between fine">
                    <span className="muted">{entry.reason}</span>
                    <span className="mono">{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <section className="stack">
        <h2 className="card__title">Receipts</h2>
        {receipts.loading ? (
          <SkeletonCards count={2} height="4rem" />
        ) : (receipts.data ?? []).length === 0 ? (
          <EmptyState icon="receipt" title="No receipts yet">
            Once you pay a deposit or an order, the receipt shows up here.
          </EmptyState>
        ) : (
          <ul className="stack stack--tight">
            {(receipts.data ?? []).map((receipt) => (
              <li key={receipt.id} className="card card--tight row row--between row--wrap">
                <span>
                  <strong>{dayLabel(receipt.date)}</strong> at {timeLabel(receipt.time)}
                  <span className="fine faint"> {receipt.ccm_code}</span>
                </span>
                {receipt.amount_fcfa ? <Money value={receipt.amount_fcfa} /> : <span className="fine faint">Unpaid</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function AccountPage() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"profile" | "security" | "rewards">("profile");

  return (
    <div className="page section account">
      <div className="account-head">
        <Avatar name={user?.name ?? ""} large />
        <div>
          <h1 className="display display--lg">{user?.name}</h1>
          <p className="fine faint">{user?.email}</p>
        </div>
        <Button
          className="push"
          tone="ghost"
          icon="logout"
          onClick={async () => {
            await signOut();
            navigate("/");
          }}
        >
          Sign out
        </Button>
      </div>

      <div className="tabs" role="tablist" aria-label="Account sections">
        <button type="button" role="tab" className="tab" aria-selected={tab === "profile"} onClick={() => setTab("profile")}>
          Details
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "security"}
          onClick={() => setTab("security")}
        >
          Security
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "rewards"}
          onClick={() => setTab("rewards")}
        >
          Points and receipts
        </button>
      </div>

      <div style={{ marginTop: "var(--s-5)", maxWidth: "40rem" }}>
        {tab === "profile" ? <Profile /> : tab === "security" ? <Security /> : <Rewards />}
      </div>
    </div>
  );
}
