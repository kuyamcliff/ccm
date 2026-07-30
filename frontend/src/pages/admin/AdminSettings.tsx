import { useEffect, useState } from "react";
import { api } from "../../api";
import type { SiteSettings } from "../../api";
import { useSettings } from "../../settings";

const FIELDS: { key: keyof SiteSettings; label: string; placeholder: string; type?: string; hint?: string }[] = [
  { key: "phone", label: "Phone number", placeholder: "+237 6XX XXX XXX", hint: "Also used for the WhatsApp chat links." },
  {
    key: "address",
    label: "Address",
    placeholder: "562V+C7V, Clerks Quarters, Buea",
    hint: "Shown in the footer, About page, receipts and map links across the site.",
  },
  {
    key: "city",
    label: "Town",
    placeholder: "Buea",
    hint: "Leave blank to use the last part of the address automatically.",
  },
  { key: "region", label: "Region", placeholder: "South West Region, Cameroon" },
  { key: "hours", label: "Opening hours", placeholder: "Open daily · 9am till late" },
  { key: "tiktok_url", label: "TikTok URL", placeholder: "https://www.tiktok.com/@...", type: "url" },
  { key: "ig_url", label: "Instagram URL", placeholder: "https://www.instagram.com/...", type: "url" },
  { key: "fb_url", label: "Facebook URL", placeholder: "https://www.facebook.com/...", type: "url" },
];

export function AdminSettings() {
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
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load settings."))
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
      setTestResult({ ok: true, msg: `Sent to ${r.to}. Check the inbox, and the spam folder.` });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Could not send." });
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
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">Site settings</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        Changes here appear on the public website immediately after saving.
      </p>

      {loading ? (
        <p className="empty-admin">Loading...</p>
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
          {saved && <p style={{ color: "var(--green)", fontSize: "0.9rem" }}>Settings saved. The website now reflects your changes.</p>}

          <button type="submit" className="btn btn-amber" disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </button>
        </form>
      )}

      {/* Email is configured on the server, not here, because an API key does
          not belong in a database the app can read back. This just reports
          whether it is working and lets you prove it. */}
      <section className="email-status">
        <h2 className="admin-section-title">Email</h2>

        {emailReady === null && <p className="muted">Checking…</p>}

        {emailReady === false && (
          <>
            <p className="settings-hint">
              Outgoing email is <strong>off</strong>. Set <code>RESEND_API_KEY</code> on the
              server and restart to enable it.
            </p>
          </>
        )}

        {emailReady === true && (
          <>
            <p className="settings-hint">Outgoing email is on. Send a test to confirm your domain.</p>
            <div className="email-test-row">
              <input
                type="email"
                placeholder="Leave blank to send to your own address"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <button type="button" className="btn btn-outline btn-sm" onClick={sendTest} disabled={testing}>
                {testing ? "Sending…" : "Send test email"}
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
