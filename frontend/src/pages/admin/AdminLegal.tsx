import { useEffect, useState } from "react";
import { api } from "../../api";
import type { LegalPage } from "../../api";

type Slug = "terms" | "privacy";

const TABS: { slug: Slug; label: string }[] = [
  { slug: "terms", label: "Terms of use" },
  { slug: "privacy", label: "Privacy policy" },
];

export default function AdminLegal() {
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
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the legal pages."))
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
      setToast("Published. The public page is updated.");
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
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
          <h1 className="admin-page-title">Legal pages</h1>
          <p className="admin-page-sub">
            Edit your terms and privacy policy. Changes go live as soon as you publish.
          </p>
        </div>
        <a className="btn btn-sm btn-outline" href={`/${slug === "terms" ? "terms" : "privacy"}`} target="_blank" rel="noopener noreferrer">
          View public page
        </a>
      </div>

      <div className="filter-chips" style={{ marginBottom: "1.5rem" }}>
        {TABS.map((t) => (
          <button
            key={t.slug}
            className={`filter-chip${slug === t.slug ? " active" : ""}`}
            onClick={() => setSlug(t.slug)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="empty-admin">Loading…</p>
      ) : !current ? (
        <p className="empty-admin">{error || "That page is missing from the database."}</p>
      ) : (
        <div className="legal-editor">
          <label className="legal-editor-field">
            Page title
            <input
              type="text"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="legal-editor-field">
            Page text
            <textarea
              rows={22}
              value={body}
              maxLength={40000}
              onChange={(e) => setBody(e.target.value)}
              spellCheck
            />
            <span className="settings-hint">
              Start a line with <code>## </code> for a heading. Blank line between paragraphs.
            </span>
          </label>

          <div className="legal-editor-meta">
            <span className="mono">{body.length.toLocaleString()} / 40,000 characters</span>
            {current.updated_at && (
              <span className="mono">
                Last saved {new Date(current.updated_at.replace(" ", "T") + "Z").toLocaleString("en-GB")}
              </span>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          {toast && <p style={{ color: "var(--green)", fontSize: "0.9rem" }}>{toast}</p>}

          <div className="legal-editor-actions">
            <button className="btn btn-amber" onClick={save} disabled={saving || !dirty}>
              {saving ? "Publishing…" : dirty ? "Publish changes" : "No changes"}
            </button>
            {dirty && (
              <button className="btn btn-outline" onClick={revert} disabled={saving}>
                Discard changes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
