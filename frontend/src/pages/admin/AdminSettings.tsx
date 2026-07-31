import { useEffect, useState } from "react";
import { api } from "../../api";
import type { SiteSettings } from "../../api";
import { useSettings } from "../../settings";
import { useLanguage } from "../../i18n/context";

export function AdminSettings() {
  const { t } = useLanguage();
  const ts = (key: string) => t("adminSettings", key);
  const FIELDS: { key: keyof SiteSettings; label: string; placeholder: string; type?: string; hint?: string }[] = [
    { key: "phone", label: ts("phoneLabel"), placeholder: "+237 6XX XXX XXX", hint: ts("phoneHint") },
    {
      key: "address",
      label: ts("addressLabel"),
      placeholder: "562V+C7V, Clerks Quarters, Buea",
      hint: ts("addressHint"),
    },
    {
      key: "city",
      label: ts("cityLabel"),
      placeholder: "Buea",
      hint: ts("cityHint"),
    },
    { key: "region", label: ts("regionLabel"), placeholder: "South West Region, Cameroon" },
    { key: "hours", label: ts("hoursLabel"), placeholder: ts("hoursPlaceholder") },
    { key: "tiktok_url", label: ts("tiktokLabel"), placeholder: "https://www.tiktok.com/@...", type: "url" },
    { key: "ig_url", label: ts("igLabel"), placeholder: "https://www.instagram.com/...", type: "url" },
    { key: "fb_url", label: ts("fbLabel"), placeholder: "https://www.facebook.com/...", type: "url" },
  ];
  const { refresh } = useSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.siteSettings()
      .then((r) => setValues(r.settings as Record<string, string>))
      .catch((e) => setError(e instanceof Error ? e.message : ts("errLoad")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.recoveryStatus()
      .then((r) => setEmailReady(r.self_service))
      .catch(() => setEmailReady(false));
  }, []);

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.admin.sendTestEmail(testTo.trim() || undefined);
      setTestResult({ ok: true, msg: ts("testSent").replace("{to}", r.to) });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : ts("errSend") });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.admin.updateSettings(values);
      // Re-read into the shared context so the header, footer, About page and
      // receipts pick the change up without a reload.
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("errSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">{ts("title")}</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        {ts("subtitle")}
      </p>

      {loading ? (
        <p className="empty-admin">{ts("loading")}</p>
      ) : (
        <form className="settings-form" onSubmit={handleSave}>
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={values[f.key as string] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.hint && <span className="settings-hint">{f.hint}</span>}
            </label>
          ))}

          {error && <p className="form-error" role="alert">{error}</p>}
          {saved && <p style={{ color: "var(--green)", fontSize: "0.9rem" }}>{ts("saved")}</p>}

          <button type="submit" className="btn btn-amber" disabled={saving}>
            {saving ? ts("saving") : ts("saveSettings")}
          </button>
        </form>
      )}

      {/* Email is configured on the server, not here, because an API key does
          not belong in a database the app can read back. This just reports
          whether it is working and lets you prove it. */}
      <section className="email-status">
        <h2 className="admin-section-title">{ts("emailSection")}</h2>

        {emailReady === null && <p className="muted">{ts("checking")}</p>}

        {emailReady === false && (
          <>
            <p className="settings-hint">
              {ts("emailOffPrefix")} <strong>{ts("emailOff")}</strong>. {ts("emailOffSuffixPre")} <code>RESEND_API_KEY</code> {ts("emailOffSuffixPost")}
            </p>
          </>
        )}

        {emailReady === true && (
          <>
            <p className="settings-hint">{ts("emailOn")}</p>
            <div className="email-test-row">
              <input
                type="email"
                placeholder={ts("testEmailPlaceholder")}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <button type="button" className="btn btn-outline btn-sm" onClick={sendTest} disabled={testing}>
                {testing ? ts("sending") : ts("sendTestEmail")}
              </button>
            </div>
          </>
        )}

        {testResult && (
          <p
            className={testResult.ok ? "" : "form-error"}
            style={{ marginTop: "0.75rem", fontSize: "0.88rem", color: testResult.ok ? "var(--green)" : undefined }}
            role={testResult.ok ? undefined : "alert"}
          >
            {testResult.msg}
          </p>
        )}
      </section>
    </div>
  );
}
