import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { GalleryPhoto } from "../api";
import { useAuth } from "../auth";

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export default function GalleryPage() {
  const { user } = useAuth();

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "featured">("all");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.gallery()
      .then((d) => setPhotos(d.photos))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const visible = filter === "featured" ? photos.filter((p) => p.is_featured) : photos;
  const featuredCount = photos.filter((p) => p.is_featured).length;

  const step = useCallback(
    (delta: number) =>
      setLightboxIdx((i) => (i === null ? null : (i + delta + visible.length) % visible.length)),
    [visible.length]
  );

  const closeLightbox = useCallback(() => {
    setLightboxIdx(null);
    returnFocusRef.current?.focus?.();
  }, []);

  /* Keyboard control for the viewer. */
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeLightbox(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, step, closeLightbox]);

  /* Lock the page behind any overlay. */
  useEffect(() => {
    const open = lightboxIdx !== null || addOpen;
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [lightboxIdx, addOpen]);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const frame = requestAnimationFrame(() => lightboxRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [lightboxIdx]);

  /* Keep the active filmstrip thumbnail in view as the viewer steps through photos. */
  useEffect(() => {
    if (lightboxIdx === null) return;
    activeThumbRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [lightboxIdx]);

  function openLightbox(i: number, e: React.MouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = e.currentTarget;
    setLightboxIdx(i);
  }

  /* Swipe between photos on a touch screen. */
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 55) step(dx > 0 ? -1 : 1);
    touchStartX.current = null;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast("That image is over 6 MB. Pick a smaller one.", "err");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.onerror = () => showToast("Could not read that file.", "err");
    reader.readAsDataURL(file);
  }

  function closeUpload() {
    setAddOpen(false);
    setPreview(null);
    setCaption("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!preview) return;
    setUploading(true);
    try {
      const result = await api.submitPhoto({ image_url: preview, caption });
      showToast(result.message, "ok");
      closeUpload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed.", "err");
    } finally {
      setUploading(false);
    }
  }

  const current = lightboxIdx !== null ? visible[lightboxIdx] : null;

  return (
    <div className="gal">
      <header className="gal-header">
        <div className="gal-inner">
          <div className="gal-header-top">
            <div>
              <p className="eyebrow animate-up">Straight from the grill</p>
              <h1 className="gal-title animate-up delay-1">Gallery</h1>
            </div>
            {user && (
              <button type="button" className="gal-add animate-up delay-1" onClick={() => setAddOpen(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Add yours</span>
              </button>
            )}
          </div>

          <p className="gal-lede animate-up delay-2">
            The plates, the smoke, the people who came back for seconds. Shared by us and by you.
          </p>

          {!loading && photos.length > 0 && (
            <div className="gal-meta-row animate-up delay-3">
              <div className="filter-chips gal-filters">
                <button className={`filter-chip${filter === "all" ? " active" : ""}`} onClick={() => { setFilter("all"); setLightboxIdx(null); }}>
                  All <span className="gal-filter-count">{photos.length}</span>
                </button>
                {featuredCount > 0 && (
                  <button className={`filter-chip${filter === "featured" ? " active" : ""}`} onClick={() => { setFilter("featured"); setLightboxIdx(null); }}>
                    ★ Featured <span className="gal-filter-count">{featuredCount}</span>
                  </button>
                )}
              </div>
              <p className="gal-count mono">
                {visible.length} photo{visible.length === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="gal-body">
        <div className="gal-inner">
          {loading && (
            <div className="route-fallback"><span className="route-fallback-dot" aria-hidden="true" /></div>
          )}

          {!loading && photos.length === 0 && (
            <p className="gal-empty">
              No photos up yet. {user ? "Be the first to add one." : "Sign in and be the first."}
            </p>
          )}

          {!loading && photos.length > 0 && visible.length === 0 && (
            <p className="gal-empty">No featured photos yet.</p>
          )}

          {visible.length > 0 && (
            <div className="gal-grid">
              {visible.map((p, i) => {
                /* A deliberate bento wall: featured shots earn a 2x2 showcase
                   block, and every fifth frame runs wide, so the grid reads as
                   composed rather than a uniform sheet of squares. */
                const span = p.is_featured ? " featured" : i % 5 === 2 ? " wide" : "";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`gal-tile${span}`}
                    onClick={(e) => openLightbox(i, e)}
                    aria-label={p.caption ? `View photo: ${p.caption}` : `View photo ${i + 1}`}
                  >
                    <img
                      src={p.image_url}
                      alt={p.caption || ""}
                      loading="lazy"
                      decoding="async"
                    />
                    {p.is_featured && <span className="gal-tile-star">Featured</span>}
                    {(p.caption || p.submitter_name) && (
                      <span className="gal-tile-meta">
                        {p.caption && <span className="gal-tile-caption">{p.caption}</span>}
                        {p.submitter_name && <span className="gal-tile-by">{p.submitter_name}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Viewer ── */}
      {current && (
        <div
          className="gal-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          tabIndex={-1}
          ref={lightboxRef}
          onClick={closeLightbox}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button type="button" className="gal-lb-close" onClick={closeLightbox} aria-label="Close viewer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {visible.length > 1 && (
            <button
              type="button"
              className="gal-lb-nav prev"
              onClick={(e) => { e.stopPropagation(); step(-1); }}
              aria-label="Previous photo"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}

          <figure className="gal-lb-stage" onClick={(e) => e.stopPropagation()}>
            <img
              key={current.id}
              src={current.image_url}
              alt={current.caption || "Gallery photo"}
              className="gal-lb-img"
            />
            <figcaption className="gal-lb-caption">
              {current.caption && <p className="gal-lb-text">{current.caption}</p>}
              <p className="gal-lb-by">
                {current.submitter_name && <span>{current.submitter_name}</span>}
                <span className="gal-lb-count mono">{lightboxIdx! + 1} / {visible.length}</span>
              </p>
            </figcaption>
          </figure>

          {visible.length > 1 && (
            <button
              type="button"
              className="gal-lb-nav next"
              onClick={(e) => { e.stopPropagation(); step(1); }}
              aria-label="Next photo"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          )}

          {visible.length > 1 && (
            <div className="gal-lb-strip" onClick={(e) => e.stopPropagation()}>
              {visible.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  ref={i === lightboxIdx ? activeThumbRef : undefined}
                  className={`gal-lb-thumb${i === lightboxIdx ? " active" : ""}`}
                  onClick={() => setLightboxIdx(i)}
                  aria-label={`Go to photo ${i + 1}`}
                  aria-current={i === lightboxIdx}
                >
                  <img src={p.image_url} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upload sheet ── */}
      {addOpen && (
        <div className="gal-sheet-backdrop" onMouseDown={closeUpload}>
          <div
            className="gal-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gal-upload-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="gal-sheet-head">
              <h2 id="gal-upload-title" className="gal-sheet-title">Add your photo</h2>
              <button type="button" className="gal-sheet-close" onClick={closeUpload} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <label className="gal-drop">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
              {preview ? (
                <img src={preview} alt="Your photo, ready to send" className="gal-drop-preview" />
              ) : (
                <span className="gal-drop-empty">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span className="gal-drop-label">Choose a photo</span>
                  <span className="gal-drop-hint">JPG, PNG or WebP · up to 6 MB</span>
                </span>
              )}
            </label>

            {preview && (
              <button type="button" className="link-btn gal-drop-change" onClick={() => fileRef.current?.click()}>
                Choose a different photo
              </button>
            )}

            <label className="gal-field">
              Caption <span className="optional">optional</span>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={200}
                placeholder="Saturday night, mixed grill"
              />
            </label>

            <button
              type="button"
              className="btn btn-amber gal-submit"
              onClick={submit}
              disabled={uploading || !preview}
            >
              {uploading ? "Sending…" : "Submit photo"}
            </button>
            <p className="gal-sheet-fine">Photos appear once we have had a look at them.</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
