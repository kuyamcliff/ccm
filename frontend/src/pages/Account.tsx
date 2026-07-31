import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ReceiptSummary } from "../api";
import { useAuth } from "../auth";
import { ConfirmModal } from "../components/ConfirmModal";
import { useT } from "../i18n/context";

type Tab = "receipts" | "profile" | "security";

export function Account() {
  const t = useT("account");
  const { user, loading, logout, refetch } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("receipts");

  if (loading) {
    return (
      <section className="section">
        <div className="section-inner narrow center">
          <p style={{ color: "var(--text-muted)" }}>{t("oneMoment")}</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section">
        <div className="section-inner narrow">
          <h1 className="page-title">{t("title")}</h1>
          <p className="notice"><Link to="/login">{t("signInPrompt")}</Link> {t("signInSuffix")}</p>
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
            {t("myTables")}
          </Link>
        </div>

        {/* Tabs become a side rail from 900px; a scrollable row below that. */}
        <div className="acct-layout">
          <div className="acct-tabs" role="tablist">
            {([
              ["receipts", t("tabReceipts")],
              ["profile",  t("tabProfile")],
              ["security", t("tabSecurity")],
            ] as [Tab, string][]).map(([tabKey, label]) => (
              <button
                key={tabKey}
                className={`acct-tab${tab === tabKey ? " active" : ""}`}
                role="tab"
                aria-selected={tab === tabKey}
                onClick={() => setTab(tabKey)}
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
  const t = useT("account");
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
      setError(t("errDownload"));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="acct-panel">
      <div className="acct-panel-head">
        <h2 className="acct-section-title">{t("receiptsTitle")}</h2>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loaded && receipts.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          {t("noReceipts")}
        </p>
      )}
      {receipts.length > 0 && (
        <div className="receipt-list">
          {receipts.map((r) => (
            <div key={r.id} className="receipt-row">
              <div className="receipt-info">
                <span className="receipt-code">{r.ccm_code ?? `REC-${String(r.id).padStart(4, "0")}`}</span>
                <span className="receipt-meta">
                  {r.date} at {r.time}, {r.party_size} {r.party_size === 1 ? t("person") : t("people")}
                  {r.table_label ? `, ${r.table_label}` : ""}
                  {r.amount_fcfa ? `, ${r.amount_fcfa.toLocaleString()} FCFA` : ""}
                  {r.pay_method ? `, ${r.pay_method === "orange_money" ? t("orangeMoney") : t("mtnMomo")}` : ""}
                </span>
              </div>
              <button
                className="btn btn-outline btn-sm"
                disabled={downloading === r.id}
                onClick={() => downloadReceipt(r)}
              >
                {downloading === r.id ? t("downloading") : t("downloadPdf")}
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
  const t = useT("account");
  const [nameVal, setNameVal] = useState(user.name);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [email, setEmail] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [passMsg, setPassMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePass, setDeletePass] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameBusy(true); setNameMsg(null);
    try {
      await api.changeName(nameVal);
      await refetch?.();
      setNameMsg({ text: t("nameUpdated"), ok: true });
    } catch (err) {
      setNameMsg({ text: err instanceof Error ? err.message : t("errUpdateName"), ok: false });
    } finally {
      setNameBusy(false);
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true); setEmailMsg(null);
    try {
      await api.changeEmail(email, emailPass);
      await refetch?.();
      setEmail(""); setEmailPass("");
      setEmailMsg({ text: t("emailUpdated"), ok: true });
    } catch (err) {
      setEmailMsg({ text: err instanceof Error ? err.message : t("errUpdateEmail"), ok: false });
    } finally {
      setEmailBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass !== newPass2) { setPassMsg({ text: t("passwordMismatch"), ok: false }); return; }
    setPassBusy(true); setPassMsg(null);
    try {
      await api.changePassword(curPass, newPass);
      setCurPass(""); setNewPass(""); setNewPass2("");
      setPassMsg({ text: t("passwordChanged"), ok: true });
    } catch (err) {
      setPassMsg({ text: err instanceof Error ? err.message : t("errChangePassword"), ok: false });
    } finally {
      setPassBusy(false);
    }
  }

  async function doDelete() {
    if (!deletePass) { setDeleteMsg(t("enterPasswordConfirm")); return; }
    setDeleteBusy(true);
    setDeleteMsg("");
    try {
      await api.deleteAccount(deletePass);
      setDeleteOpen(false);
      onDeleted();
    } catch (err) {
      // Kept open with the reason visible, closing on failure would look like
      // the account had been deleted when it had not.
      setDeleteMsg(err instanceof Error ? err.message : t("errDeleteAccount"));
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
        <h3 className="acct-card-title">{t("displayName")}</h3>
        <form className="form" style={{ gap: "0.75rem" }} onSubmit={saveName}>
          <label>
            {t("name")}
            <input type="text" value={nameVal} onChange={(e) => setNameVal(e.target.value)} required minLength={2} />
          </label>
          {nameMsg && <p className={nameMsg.ok ? "form-success" : "form-error"} role="status">{nameMsg.text}</p>}
          <div className="form-footer">
            <button className="btn btn-amber btn-sm" disabled={nameBusy}>{nameBusy ? t("saving") : t("saveName")}</button>
          </div>
        </form>
      </div>

      {/* Change email */}
      <div className="acct-profile-card">
        <h3 className="acct-card-title">{t("changeEmail")}</h3>
        <p className="acct-card-sub">{t("current")} <strong>{user.email}</strong></p>
        <form className="form" style={{ gap: "0.75rem" }} onSubmit={saveEmail}>
          <label>{t("newEmail")}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>{t("currentPasswordConfirm")}
            <input type="password" value={emailPass} onChange={(e) => setEmailPass(e.target.value)} required autoComplete="current-password" />
          </label>
          {emailMsg && <p className={emailMsg.ok ? "form-success" : "form-error"} role="status">{emailMsg.text}</p>}
          <div className="form-footer">
            <button className="btn btn-amber btn-sm" disabled={emailBusy}>{emailBusy ? t("saving") : t("updateEmail")}</button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="acct-profile-card">
        <h3 className="acct-card-title">{t("changePassword")}</h3>
        <form className="form" style={{ gap: "0.75rem" }} onSubmit={savePassword}>
          <label>{t("currentPassword")}
            <input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} required autoComplete="current-password" />
          </label>
          <label>{t("newPassword")}
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <label>{t("confirmNewPassword")}
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} required autoComplete="new-password" />
          </label>
          {passMsg && <p className={passMsg.ok ? "form-success" : "form-error"} role="status">{passMsg.text}</p>}
          <div className="form-footer">
            <button className="btn btn-amber btn-sm" disabled={passBusy}>{passBusy ? t("saving") : t("changePassword")}</button>
          </div>
        </form>
      </div>

      {/* Danger zone */}
      <div className="acct-profile-card danger-zone">
        <h3 className="acct-card-title" style={{ color: "var(--amber)" }}>{t("deleteAccount")}</h3>
        <p className="acct-card-sub">{t("deleteAccountBody")}</p>
        <button className="btn btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>{t("deleteMyAccount")}</button>
      </div>

      <ConfirmModal
        open={deleteOpen}
        title={t("deleteTitle")}
        body={t("deleteBody")}
        confirmLabel={deleteBusy ? t("deleting") : t("deleteMyAccount")}
        confirmClass="btn-danger"
        confirmDisabled={deleteBusy || !deletePass}
        onConfirm={doDelete}
        onCancel={closeDelete}
      >
        <label className="modal-field">
          {t("confirmWithPassword")}
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
  const t = useT("account");
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
      setSetupMsg(e instanceof Error ? e.message : t("errSetupFailed"));
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
      setSetupMsg(err instanceof Error ? err.message : t("errVerifyCode"));
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
      setDisableMsg(err instanceof Error ? err.message : t("errDisable2fa"));
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
          <h3 className="acct-card-title">{t("twoFactor")}</h3>
          {tfaEnabled !== null && (
            <span className={`badge ${tfaEnabled ? "badge-green" : "badge-muted"}`}>
              {tfaEnabled ? t("enabled") : t("disabled")}
            </span>
          )}
        </div>
        <p className="acct-card-sub">
          {t("twoFactorBody")}
        </p>

        {tfaLoading && <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>{t("loading")}</p>}

        {/* Setup flow */}
        {!tfaLoading && !tfaEnabled && !setting && (
          <button className="btn btn-amber btn-sm" onClick={startSetup}>{t("enable2fa")}</button>
        )}

        {setting && setupData && (
          <div className="tfa-setup">
            <p className="tfa-step">{t("step1Scan")}</p>
            <div className="tfa-qr-wrap">
              <img src={setupData.qrDataUrl} alt="2FA QR code" className="tfa-qr" />
            </div>
            <p className="tfa-step">{t("orEnterManually")}</p>
            <div className="tfa-secret-row">
              <span ref={codeRef} className="tfa-secret">{setupData.secret}</span>
              <button className="btn btn-outline btn-sm" onClick={copySecret}>
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
            <p className="tfa-step" style={{ marginTop: "1.25rem" }}>{t("step2Enter")}</p>
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
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSetting(false); setSetupData(null); }}>{t("cancel")}</button>
                <button className="btn btn-amber btn-sm" disabled={verifyBusy}>{verifyBusy ? t("verifying") : t("activate2fa")}</button>
              </div>
            </form>
          </div>
        )}

        {/* Disable flow */}
        {!tfaLoading && tfaEnabled && !disabling && (
          <button className="btn btn-danger btn-sm" onClick={() => setDisabling(true)}>{t("disable2fa")}</button>
        )}

        {disabling && (
          <form className="form" style={{ gap: "0.75rem", marginTop: "1rem" }} onSubmit={doDisable}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>{t("enterPasswordDisable")}</p>
            <label>
              {t("currentPassword")}
              <input type="password" value={disablePass} onChange={(e) => setDisablePass(e.target.value)} required autoComplete="current-password" />
            </label>
            {disableMsg && <p className="form-error" role="alert">{disableMsg}</p>}
            <div className="form-footer">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDisabling(false); setDisablePass(""); }}>{t("cancel")}</button>
              <button className="btn btn-danger btn-sm" disabled={disableBusy}>{disableBusy ? t("disabling") : t("disable2fa")}</button>
            </div>
          </form>
        )}
      </div>

      {/* Passkeys section */}
      <div className="acct-profile-card">
        <div className="acct-card-head-row">
          <h3 className="acct-card-title">{t("passkeys")}</h3>
          <span className="badge badge-muted">{t("comingSoon")}</span>
        </div>
        <p className="acct-card-sub">
          {t("passkeysBody")}
        </p>
      </div>
    </div>
  );
}

