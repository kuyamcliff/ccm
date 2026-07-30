import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ReceiptSummary } from "../api";
import { useAuth } from "../auth";
import { ConfirmModal } from "../components/ConfirmModal";

type Tab = "receipts" | "profile" | "security";

export function Account() {
  const { user, loading, logout, refetch } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("receipts");

  if (loading) {
    return (
      <section className="section">
        <div className="section-inner narrow center">
          <p style={{ color: "var(--text-muted)" }}>One moment…</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section">
        <div className="section-inner narrow">
          <h1 className="page-title">Account</h1>
          <p className="notice"><Link to="/login">Sign in</Link> to access your account.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="acct-wrap">
        {/* Header */}
        <div className="acct-header">
          <div className="acct-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="acct-header-info">
            <p className="acct-name">{user.name}</p>
            <p className="acct-email">{user.email}</p>
          </div>
          <Link to="/my-tables" className="btn btn-outline btn-sm acct-header-cta">
            My tables
          </Link>
        </div>

        {/* Tabs become a side rail from 900px; a scrollable row below that. */}
        <div className="acct-layout">
          <div className="acct-tabs" role="tablist">
            {([
              ["receipts", "Receipts"],
              ["profile",  "Profile"],
              ["security", "Security"],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                className={`acct-tab${tab === t ? " active" : ""}`}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="acct-panel-wrap">
            {tab === "receipts" && <TabReceipts />}
            {tab === "profile"  && <TabProfile user={user} refetch={refetch} onDeleted={async () => { await logout(); navigate("/"); }} />}
            {tab === "security" && <TabSecurity />}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Receipts ─────────────────────────────────────────────

function TabReceipts() {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.myReceipts()
      .then((r) => setReceipts(r.receipts))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function downloadReceipt(r: ReceiptSummary) {
    setDownloading(r.id);
    try {
      const res = await api.downloadReceipt(r.id);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.ccm_code ? `${r.ccm_code}-receipt.pdf` : `receipt-${r.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download receipt.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="acct-panel">
      <div className="acct-panel-head">
        <h2 className="acct-section-title">Receipts</h2>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loaded && receipts.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          No paid receipts yet. After a confirmed payment your receipt appears here and is available to download as PDF.
        </p>
      )}
      {receipts.length > 0 && (
        <div className="receipt-list">
          {receipts.map((r) => (
            <div key={r.id} className="receipt-row">
              <div className="receipt-info">
                <span className="receipt-code">{r.ccm_code ?? `REC-${String(r.id).padStart(4, "0")}`}</span>
                <span className="receipt-meta">
                  {r.date} at {r.time} · {r.party_size} {r.party_size === 1 ? "person" : "people"}
                  {r.table_label ? ` · ${r.table_label}` : ""}
                  {r.amount_fcfa ? ` · ${r.amount_fcfa.toLocaleString()} FCFA` : ""}
                  {r.pay_method ? ` · ${r.pay_method === "orange_money" ? "Orange Money" : "MTN MoMo"}` : ""}
                </span>
              </div>
              <button
                className="btn btn-outline btn-sm"
                disabled={downloading === r.id}
                onClick={() => downloadReceipt(r)}
              >
                {downloading === r.id ? "Downloading…" : "Download PDF"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────

function TabProfile({
  user,
  refetch,
  onDeleted,
}: {
  user: { name: string; email: string };
  refetch?: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [nameVal, setNameVal] = useState(user.name);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [email, setEmail] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [passMsg, setPassMsg] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePass, setDeletePass] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameBusy(true); setNameMsg("");
    try {
      await api.changeName(nameVal);
      await refetch?.();
      setNameMsg("Name updated.");
    } catch (err) {
      setNameMsg(err instanceof Error ? err.message : "Could not update name.");
    } finally {
      setNameBusy(false);
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true); setEmailMsg("");
    try {
      await api.changeEmail(email, emailPass);
      await refetch?.();
      setEmail(""); setEmailPass("");
      setEmailMsg("Email updated successfully.");
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : "Could not update email.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass !== newPass2) { setPassMsg("New passwords do not match."); return; }
    setPassBusy(true); setPassMsg("");
    try {
      await api.changePassword(curPass, newPass);
      setCurPass(""); setNewPass(""); setNewPass2("");
      setPassMsg("Password changed. Any other device signed in to this account has been signed out.");
    } catch (err) {
      setPassMsg(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setPassBusy(false);
    }
  }

  async function doDelete() {
    if (!deletePass) { setDeleteMsg("Enter your password to confirm."); return; }
    setDeleteBusy(true);
    setDeleteMsg("");
    try {
      await api.deleteAccount(deletePass);
      setDeleteOpen(false);
      onDeleted();
    } catch (err) {
      // Kept open with the reason visible — closing on failure would look like
      // the account had been deleted when it had not.
      setDeleteMsg(err instanceof Error ? err.message : "Could not delete your account.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function closeDelete() {
    setDeleteOpen(false);
    setDeletePass("");
    setDeleteMsg("");
  }

  return (
    <div className="acct-panel">
      {/* Display name */}
      <div className="acct-profile-card">
        <h3 className="acct-card-title">Display name</h3>
        <form className="form" style={{ gap: "0.75rem" }} onSubmit={saveName}>
          <label>
            Name
            <input type="text" value={nameVal} onChange={(e) => setNameVal(e.target.value)} required minLength={2} />
          </label>
          {nameMsg && <p className={nameMsg.includes("updated") ? "form-success" : "form-error"} role="status">{nameMsg}</p>}
          <div className="form-footer">
            <button className="btn btn-amber btn-sm" disabled={nameBusy}>{nameBusy ? "Saving…" : "Save name"}</button>
          </div>
        </form>
      </div>

      {/* Change email */}
      <div className="acct-profile-card">
        <h3 className="acct-card-title">Change email</h3>
        <p className="acct-card-sub">Current: <strong>{user.email}</strong></p>
        <form className="form" style={{ gap: "0.75rem" }} onSubmit={saveEmail}>
          <label>New email address
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>Current password (to confirm)
            <input type="password" value={emailPass} onChange={(e) => setEmailPass(e.target.value)} required autoComplete="current-password" />
          </label>
          {emailMsg && <p className={emailMsg.includes("success") ? "form-success" : "form-error"} role="status">{emailMsg}</p>}
          <div className="form-footer">
            <button className="btn btn-amber btn-sm" disabled={emailBusy}>{emailBusy ? "Saving…" : "Update email"}</button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="acct-profile-card">
        <h3 className="acct-card-title">Change password</h3>
        <form className="form" style={{ gap: "0.75rem" }} onSubmit={savePassword}>
          <label>Current password
            <input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} required autoComplete="current-password" />
          </label>
          <label>New password
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <label>Confirm new password
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} required autoComplete="new-password" />
          </label>
          {passMsg && <p className={passMsg.includes("changed") ? "form-success" : "form-error"} role="status">{passMsg}</p>}
          <div className="form-footer">
            <button className="btn btn-amber btn-sm" disabled={passBusy}>{passBusy ? "Saving…" : "Change password"}</button>
          </div>
        </form>
      </div>

      {/* Danger zone */}
      <div className="acct-profile-card danger-zone">
        <h3 className="acct-card-title" style={{ color: "var(--amber)" }}>Delete account</h3>
        <p className="acct-card-sub">Removes your account and all personal data. Booking history stays on file for restaurant operations. This cannot be undone.</p>
        <button className="btn btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>Delete my account</button>
      </div>

      <ConfirmModal
        open={deleteOpen}
        title="Delete your account?"
        body="This cannot be undone. Your profile, reviews and saved details are removed permanently."
        confirmLabel={deleteBusy ? "Deleting…" : "Delete my account"}
        confirmClass="btn-danger"
        confirmDisabled={deleteBusy || !deletePass}
        onConfirm={doDelete}
        onCancel={closeDelete}
      >
        <label className="modal-field">
          Confirm with your password
          <input
            type="password"
            value={deletePass}
            onChange={(e) => setDeletePass(e.target.value)}
            autoComplete="current-password"
            data-autofocus
          />
        </label>
        {deleteMsg && <p className="form-error" role="alert">{deleteMsg}</p>}
      </ConfirmModal>
    </div>
  );
}

// ── Security ──────────────────────────────────────────────

function TabSecurity() {
  const [tfaEnabled, setTfaEnabled] = useState<boolean | null>(null);
  const [tfaLoading, setTfaLoading] = useState(true);

  // Setup state
  const [setting, setSetting] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [setupMsg, setSetupMsg] = useState("");

  // Disable state
  const [disabling, setDisabling] = useState(false);
  const [disablePass, setDisablePass] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableMsg, setDisableMsg] = useState("");

  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    setTfaLoading(true);
    try {
      const r = await api.get2faStatus();
      setTfaEnabled(r.enabled);
    } catch { setTfaEnabled(false); }
    finally { setTfaLoading(false); }
  }

  async function startSetup() {
    setSetting(true);
    setSetupMsg("");
    setVerifyCode("");
    try {
      const r = await api.setup2fa();
      setSetupData({ secret: r.secret, qrDataUrl: r.qrDataUrl });
    } catch (e) {
      setSetupMsg(e instanceof Error ? e.message : "Setup failed.");
      setSetting(false);
    }
  }

  async function doEnable(e: React.FormEvent) {
    e.preventDefault();
    setVerifyBusy(true); setSetupMsg("");
    try {
      await api.enable2fa(verifyCode);
      setTfaEnabled(true);
      setSetting(false);
      setSetupData(null);
      setVerifyCode("");
      setSetupMsg("");
    } catch (err) {
      setSetupMsg(err instanceof Error ? err.message : "Could not verify code.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function doDisable(e: React.FormEvent) {
    e.preventDefault();
    setDisableBusy(true); setDisableMsg("");
    try {
      await api.disable2fa(disablePass);
      setTfaEnabled(false);
      setDisabling(false);
      setDisablePass("");
    } catch (err) {
      setDisableMsg(err instanceof Error ? err.message : "Could not disable 2FA.");
    } finally {
      setDisableBusy(false);
    }
  }

  function copySecret() {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="acct-panel">

      {/* 2FA section */}
      <div className="acct-profile-card">
        <div className="acct-card-head-row">
          <h3 className="acct-card-title">Two-factor authentication</h3>
          {tfaEnabled !== null && (
            <span className={`badge ${tfaEnabled ? "badge-green" : "badge-muted"}`}>
              {tfaEnabled ? "Enabled" : "Disabled"}
            </span>
          )}
        </div>
        <p className="acct-card-sub">
          Use an authenticator app (Google Authenticator, Authy, 1Password) to generate one-time codes when signing in.
        </p>

        {tfaLoading && <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Loading…</p>}

        {/* Setup flow */}
        {!tfaLoading && !tfaEnabled && !setting && (
          <button className="btn btn-amber btn-sm" onClick={startSetup}>Enable 2FA</button>
        )}

        {setting && setupData && (
          <div className="tfa-setup">
            <p className="tfa-step">Step 1: Scan the QR code with your authenticator app</p>
            <div className="tfa-qr-wrap">
              <img src={setupData.qrDataUrl} alt="2FA QR code" className="tfa-qr" />
            </div>
            <p className="tfa-step">Or enter this code manually:</p>
            <div className="tfa-secret-row">
              <span ref={codeRef} className="tfa-secret">{setupData.secret}</span>
              <button className="btn btn-outline btn-sm" onClick={copySecret}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="tfa-step" style={{ marginTop: "1.25rem" }}>Step 2: Enter the 6-digit code from your app</p>
            <form className="form" style={{ gap: "0.75rem" }} onSubmit={doEnable}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]{6,7}"
                placeholder="000 000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="tfa-code-input"
                maxLength={7}
                required
                autoComplete="one-time-code"
              />
              {setupMsg && <p className="form-error" role="alert">{setupMsg}</p>}
              <div className="form-footer">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSetting(false); setSetupData(null); }}>Cancel</button>
                <button className="btn btn-amber btn-sm" disabled={verifyBusy}>{verifyBusy ? "Verifying…" : "Activate 2FA"}</button>
              </div>
            </form>
          </div>
        )}

        {/* Disable flow */}
        {!tfaLoading && tfaEnabled && !disabling && (
          <button className="btn btn-danger btn-sm" onClick={() => setDisabling(true)}>Disable 2FA</button>
        )}

        {disabling && (
          <form className="form" style={{ gap: "0.75rem", marginTop: "1rem" }} onSubmit={doDisable}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Enter your password to confirm disabling 2FA.</p>
            <label>
              Current password
              <input type="password" value={disablePass} onChange={(e) => setDisablePass(e.target.value)} required autoComplete="current-password" />
            </label>
            {disableMsg && <p className="form-error" role="alert">{disableMsg}</p>}
            <div className="form-footer">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDisabling(false); setDisablePass(""); }}>Cancel</button>
              <button className="btn btn-danger btn-sm" disabled={disableBusy}>{disableBusy ? "Disabling…" : "Disable 2FA"}</button>
            </div>
          </form>
        )}
      </div>

      {/* Passkeys section */}
      <div className="acct-profile-card">
        <div className="acct-card-head-row">
          <h3 className="acct-card-title">Passkeys</h3>
          <span className="badge badge-muted">Coming soon</span>
        </div>
        <p className="acct-card-sub">
          Sign in without a password using Face ID, fingerprint, or a hardware security key. Passkey support is coming in a future update.
        </p>
      </div>
    </div>
  );
}

