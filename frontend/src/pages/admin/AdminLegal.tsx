import { useEffect, useState } from "react";
import { api } from "../../api";
import type { LegalPage } from "../../api";
import { useLanguage } from "../../i18n/context";

type Slug = "terms" | "privacy";

export default function AdminLegal() {
  const { t } = useLanguage();
  const tl = (key: string) => t("adminLegal", key);
  const TABS: { slug: Slug; label: string }[] = [
    { slug: "terms", label: tl("termsTab") },
    { slug: "privacy", label: tl("privacyTab") },
  ];
  const [pages, setPages] = useState<Record<string, LegalPage>>({});
  const [slug, setSlug] = useState<Slug>("terms");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    api.admin.legalPages()
      .then((r) => {
        const map: Record<string, LegalPage> = {};
        for (const p of r.pages) map[p.slug] = p;
        setPages(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : tl("errLoad")))
      .finally(() => setLoading(false));
  }, []);

  /* Load the selected page into the editor whenever the tab or the data changes. */
  useEffect(() => {
    const p = pages[slug];
    if (p) { setTitle(p.title); setBody(p.body); }
  }, [slug, pages]);

  const current = pages[slug];
  const dirty = !!current && (title !== current.title || body !== current.body);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await api.admin.updateLegalPage(slug, { title, body });
      setPages((p) => ({ ...p, [slug]: r.page }));
      setToast(tl("published"));
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : tl("errSave"));
    } finally {
      setSaving(false);
    }
  }

  function revert() {
    if (!current) return;
    setTitle(current.title);
    setBody(current.body);
    setError("");
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{tl("title")}</h1>
          <p className="admin-page-sub">
            {tl("subtitle")}
          </p>
        </div>
        <a className="btn btn-sm btn-outline" href={`/${slug === "terms" ? "terms" : "privacy"}`} target="_blank" rel="noopener noreferrer">
          {tl("viewPublicPage")}
        </a>
      </div>

      <div className="filter-chips" style={{ marginBottom: "1.5rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            className={`filter-chip${slug === tab.slug ? " active" : ""}`}
            onClick={() => setSlug(tab.slug)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="empty-admin">{tl("loading")}</p>
      ) : !current ? (
        <p className="empty-admin">{error || tl("missing")}</p>
      ) : (
        <div className="legal-editor">
          <label className="legal-editor-field">
            {tl("pageTitle")}
            <input
              type="text"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="legal-editor-field">
            {tl("pageText")}
            <textarea
              rows={22}
              value={body}
              maxLength={40000}
              onChange={(e) => setBody(e.target.value)}
              spellCheck
            />
            <span className="settings-hint">
              {tl("headingHint")}
            </span>
          </label>

          <div className="legal-editor-meta">
            <span className="mono">{tl("characters").replace("{n}", body.length.toLocaleString())}</span>
            {current.updated_at && (
              <span className="mono">
                {tl("lastSaved").replace("{date}", new Date(current.updated_at.replace(" ", "T") + "Z").toLocaleString("en-GB"))}
              </span>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          {toast && <p style={{ color: "var(--green)", fontSize: "0.9rem" }}>{toast}</p>}

          <div className="legal-editor-actions">
            <button className="btn btn-amber" onClick={save} disabled={saving || !dirty}>
              {saving ? tl("publishing") : dirty ? tl("publishChanges") : tl("noChanges")}
            </button>
            {dirty && (
              <button className="btn btn-outline" onClick={revert} disabled={saving}>
                {tl("discardChanges")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
