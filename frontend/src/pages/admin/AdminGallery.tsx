import { useEffect, useMemo, useRef, useState } from "react";
import { api, GalleryPhoto } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

type FilterTab = "all" | "pending" | "approved" | "featured";

export default function AdminGallery() {
  const { t } = useLanguage();
  const tg = (key: string) => t("adminGallery", key);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");
  const [toast, setToast] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.admin.galleryAll().then((d) => { setPhotos(d.photos); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function approve(id: number) {
    await api.admin.updatePhoto(id, { is_approved: true });
    load();
    showToast(tg("approvedToast"));
  }

  async function unapprove(id: number) {
    await api.admin.updatePhoto(id, { is_approved: false });
    load();
    showToast(tg("unapprovedToast"));
  }

  async function toggleFeatured(photo: GalleryPhoto) {
    await api.admin.updatePhoto(photo.id, { is_featured: !photo.is_featured });
    load();
  }

  async function doDelete() {
    if (deleteTarget === null) return;
    setDeleteTarget(null);
    await api.admin.deletePhoto(deleteTarget);
    load();
    showToast(tg("deletedToast"));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { showToast(tg("errTooBig")); return; }
    const reader = new FileReader();
    reader.onload = () => setUploadPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function closeUpload() {
    setUploadOpen(false);
    setUploadPreview(null);
    setUploadCaption("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submitUpload() {
    if (!uploadPreview) return;
    setUploading(true);
    try {
      await api.admin.uploadPhoto({ image_url: uploadPreview, caption: uploadCaption });
      showToast(tg("uploadedToast"));
      closeUpload();
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : tg("errUpload"));
    } finally {
      setUploading(false);
    }
  }

  const counts = useMemo(() => ({
    all: photos.length,
    pending: photos.filter((p) => !p.is_approved).length,
    approved: photos.filter((p) => p.is_approved).length,
    featured: photos.filter((p) => p.is_featured).length,
  }), [photos]);

  const display = useMemo(() => {
    switch (tab) {
      case "pending": return photos.filter((p) => !p.is_approved);
      case "approved": return photos.filter((p) => p.is_approved);
      case "featured": return photos.filter((p) => p.is_featured);
      default: return photos;
    }
  }, [photos, tab]);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{tg("title")}</h1>
          <p className="admin-page-sub">{tg("subtitle")}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setUploadOpen(true)}>{tg("uploadPhoto")}</button>
      </div>

      <div className="adash-stats">
        <div className="adash-stat">
          <p className="adash-stat-val">{counts.all}</p>
          <p className="adash-stat-lbl">{tg("totalPhotos")}</p>
        </div>
        <div className="adash-stat adash-stat-red">
          <p className="adash-stat-val">{counts.pending}</p>
          <p className="adash-stat-lbl">{tg("pendingReview")}</p>
        </div>
        <div className="adash-stat adash-stat-green">
          <p className="adash-stat-val">{counts.approved}</p>
          <p className="adash-stat-lbl">{tg("approved")}</p>
        </div>
        <div className="adash-stat">
          <p className="adash-stat-val">{counts.featured}</p>
          <p className="adash-stat-lbl">{tg("featured")}</p>
        </div>
      </div>

      <div className="filter-chips" style={{ marginBottom: "1.5rem" }}>
        <button className={`filter-chip${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>{tg("all")}</button>
        <button className={`filter-chip${tab === "pending" ? " active" : ""}`} onClick={() => setTab("pending")}>
          {tg("pending")} {counts.pending > 0 && <span className="badge-red">{counts.pending}</span>}
        </button>
        <button className={`filter-chip${tab === "approved" ? " active" : ""}`} onClick={() => setTab("approved")}>{tg("approved")}</button>
        <button className={`filter-chip${tab === "featured" ? " active" : ""}`} onClick={() => setTab("featured")}>★ {tg("featured")}</button>
      </div>

      {loading && <p className="muted">{tg("loading")}</p>}
      {!loading && display.length === 0 && <p className="muted">{tg("nothingHere")}</p>}

      <div className="admin-gallery-grid">
        {display.map((p) => (
          <div key={p.id} className="admin-gallery-item">
            <div className="admin-gallery-img-wrap">
              <img src={p.image_url} alt={p.caption || "Photo"} className="admin-gallery-img" />
              <span className={`badge admin-gallery-status ${p.is_approved ? "badge-green" : "badge-amber"}`}>
                {p.is_approved ? tg("approved") : tg("pending")}
              </span>
              {!!p.is_featured && <span className="admin-gallery-featured-tag" title={tg("featured")}>★</span>}
            </div>
            <div className="admin-gallery-info">
              <p className="admin-gallery-author">{p.submitter_name || tg("unknown")}</p>
              {p.caption && <p className="admin-gallery-caption">{p.caption}</p>}
              <p className="hint">{new Date(p.created_at + "Z").toLocaleDateString()}</p>
            </div>
            <div className="admin-gallery-actions">
              {!p.is_approved ? (
                <button className="btn btn-sm btn-primary" onClick={() => approve(p.id)}>{tg("approve")}</button>
              ) : (
                <button className="btn btn-sm btn-outline" onClick={() => unapprove(p.id)}>{tg("unapprove")}</button>
              )}
              <button className="btn btn-sm btn-outline" onClick={() => toggleFeatured(p)}>
                {p.is_featured ? tg("unfeature") : tg("feature")}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(p.id)}>{tg("delete")}</button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title={tg("deleteTitle")}
        body={tg("deleteBody")}
        confirmLabel={tg("delete")}
        confirmClass="btn-danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {uploadOpen && (
        <div className="modal-backdrop" onMouseDown={closeUpload}>
          <div className="modal-box" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{tg("uploadTitle")}</h2>

            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
              <span className="rv-upload-btn" style={{ display: "block", textAlign: "center" }}>
                {uploadPreview ? tg("changeImage") : tg("chooseImage")}
              </span>
            </label>

            {uploadPreview && (
              <img src={uploadPreview} alt="preview" style={{ width: "100%", borderRadius: 8, marginBottom: "0.75rem", maxHeight: 220, objectFit: "cover", display: "block" }} />
            )}

            <input
              className="form-input"
              style={{ marginBottom: "0.75rem" }}
              placeholder={tg("captionPlaceholder")}
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              maxLength={200}
            />

            <p className="hint" style={{ marginBottom: "1rem" }}>{tg("adminUploadHint")}</p>

            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={closeUpload}>{tg("cancel")}</button>
              <button className="btn btn-primary" onClick={submitUpload} disabled={uploading || !uploadPreview}>
                {uploading ? tg("uploading") : tg("publishPhoto")}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast toast-ok">{toast}</div>}
    </div>
  );
}
