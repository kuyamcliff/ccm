import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { IconThumbDown, IconThumbUp } from "../components/Icons";
import { api } from "../api";
import type { Review, ReviewReply } from "../api";
import { useAuth } from "../auth";
import { Stars } from "../components/Stars";
import { useT } from "../i18n/context";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function MediaGrid({ urls, onRemove }: { urls: string[]; onRemove?: (i: number) => void }) {
  const t = useT("reviews");
  if (urls.length === 0) return null;
  return (
    <div className="rv-media-grid">
      {urls.map((url, i) => (
        <div key={i} className={`rv-media-item${url.startsWith("data:video") || url.includes(".mp4") || url.includes(".webm") ? " rv-media-video-item" : ""}`}>
          {url.startsWith("data:video") ? (
            <video src={url} controls className="rv-media-el" />
          ) : (
            <img src={url} alt="" className="rv-media-el" loading="lazy" />
          )}
          {onRemove && (
            <button className="rv-media-remove" type="button" onClick={() => onRemove(i)} aria-label={t("removeMedia")}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

function VoteBar({ review, userId, onChange }: {
  review: Review;
  userId?: number;
  onChange: (id: number, likes: number, dislikes: number, vote: "like" | "dislike" | null) => void;
}) {
  const t = useT("reviews");
  const [busy, setBusy] = useState(false);

  async function cast(v: "like" | "dislike") {
    if (!userId || busy) return;
    setBusy(true);
    try {
      if (review.user_vote === v) {
        const r = await api.unvoteReview(review.id);
        onChange(review.id, r.likes, r.dislikes, null);
      } else {
        const r = await api.voteReview(review.id, v);
        onChange(review.id, r.likes, r.dislikes, v);
      }
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  const tip = userId ? undefined : t("signInToVote");

  return (
    <div className="rv-vote-bar">
      <button
        className={`rv-vote-btn${review.user_vote === "like" ? " rv-vote-active-like" : ""}`}
        onClick={() => cast("like")}
        disabled={busy || !userId}
        title={tip ?? (review.user_vote === "like" ? t("removeLike") : t("like"))}
      >
        <span className="rv-vote-icon"><IconThumbUp size={15} /></span>
        <span className="rv-vote-count">{review.likes}</span>
      </button>
      <button
        className={`rv-vote-btn${review.user_vote === "dislike" ? " rv-vote-active-dislike" : ""}`}
        onClick={() => cast("dislike")}
        disabled={busy || !userId}
        title={tip ?? (review.user_vote === "dislike" ? t("removeDislike") : t("dislike"))}
      >
        <span className="rv-vote-icon"><IconThumbDown size={15} /></span>
        <span className="rv-vote-count">{review.dislikes}</span>
      </button>
      {!userId && <span className="rv-vote-hint"><Link to="/login">{t("signInToReply")}</Link> {t("toVote")}</span>}
    </div>
  );
}

function RepliesSection({ review, userId, onAdded, onDeleted }: {
  review: Review;
  userId?: number;
  onAdded: (reviewId: number, reply: ReviewReply) => void;
  onDeleted: (reviewId: number, replyId: number) => void;
}) {
  const t = useT("reviews");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const count = review.replies.length;

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await api.addReviewReply(review.id, text.trim());
      onAdded(review.id, r.reply);
      setText("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t("errPostReply"));
    } finally { setBusy(false); }
  }

  async function del(replyId: number) {
    try {
      await api.deleteReviewReply(replyId);
      onDeleted(review.id, replyId);
    } catch { /* ignore */ }
  }

  return (
    <div className="rv-replies">
      <button className="rv-replies-toggle" onClick={() => setOpen((v) => !v)}>
        {count === 0
          ? (open ? t("close") : t("reply"))
          : `${open ? t("hide") : t("show")} ${count} ${count === 1 ? t("replySingular") : t("replyPlural")}`}
        <span className="rv-replies-caret">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="rv-replies-body">
          {review.replies.map((rp) => (
            <div key={rp.id} className="rv-reply">
              <div className="rv-reply-header">
                <div className="rv-reply-avatar" aria-hidden="true">{rp.author.charAt(0).toUpperCase()}</div>
                <span className="rv-reply-author">{rp.author}</span>
                <span className="rv-reply-date">{formatDate(rp.created_at)}</span>
                {userId === rp.user_id && (
                  <button className="rv-reply-del" onClick={() => del(rp.id)}>{t("delete")}</button>
                )}
              </div>
              <p className="rv-reply-text">{rp.text}</p>
            </div>
          ))}

          {userId ? (
            <form className="rv-reply-form" onSubmit={post}>
              {err && <p className="form-error" style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>{err}</p>}
              <div className="rv-reply-row">
                <textarea
                  className="rv-reply-input"
                  rows={2}
                  maxLength={500}
                  placeholder={t("replyPlaceholder")}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="btn btn-amber btn-sm" disabled={busy || !text.trim()}>
                  {busy ? t("posting") : t("post")}
                </button>
              </div>
            </form>
          ) : (
            <p className="rv-reply-signin"><Link to="/login">{t("signInToReply")}</Link> {t("toReply")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Reviews() {
  const t = useT("reviews");
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaErr, setMediaErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const mine = user ? reviews.find((r) => r.user_id === user.id) : undefined;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const breakdown = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: reviews.filter((r) => r.rating === n).length,
  }));
  const maxBreakdown = Math.max(1, ...breakdown.map((b) => b.count));

  async function refresh() {
    const r = await api.reviews();
    setReviews(r.reviews);
    setLoaded(true);
  }

  useEffect(() => { refresh().catch(() => setLoaded(true)); }, []);

  useEffect(() => {
    if (mine) { setRating(mine.rating); setText(mine.text); setMediaUrls(mine.media_urls ?? []); }
  }, [mine?.id]);

  useEffect(() => {
    if (!formOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFormOpen(false); };
    window.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => modalRef.current?.querySelector<HTMLElement>("textarea, input, button")?.focus());
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
    };
  }, [formOpen]);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setMediaErr("");

    const imgs = mediaUrls.filter((u) => !u.startsWith("data:video"));
    const vids = mediaUrls.filter((u) => u.startsWith("data:video"));
    let imgSlots = MAX_IMAGES - imgs.length;
    let vidSlots = 1 - vids.length;

    const queue: File[] = [];
    for (const f of files) {
      if (f.type.startsWith("image/")) {
        if (imgSlots <= 0) { setMediaErr(t("errMaxImages").replace("{max}", String(MAX_IMAGES))); break; }
        if (f.size > MAX_IMAGE_BYTES) { setMediaErr(t("errImageSize").replace("{name}", f.name)); break; }
        queue.push(f); imgSlots--;
      } else if (f.type.startsWith("video/")) {
        if (vidSlots <= 0) { setMediaErr(t("errOneVideo")); break; }
        if (f.size > MAX_VIDEO_BYTES) { setMediaErr(t("errVideoSize")); break; }
        queue.push(f); vidSlots--;
      } else {
        setMediaErr(t("errUnsupported"));
        break;
      }
    }

    if (!queue.length) { if (fileRef.current) fileRef.current.value = ""; return; }

    const newUrls: string[] = new Array(queue.length);
    let remaining = queue.length;
    queue.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        newUrls[i] = reader.result as string;
        if (--remaining === 0) {
          setMediaUrls((prev) => [...prev, ...newUrls]);
          if (fileRef.current) fileRef.current.value = "";
        }
      };
      reader.readAsDataURL(f);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      await api.saveReview(rating, text, mediaUrls);
      await refresh();
      setFormOpen(false);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : t("errSave"));
    } finally { setBusy(false); }
  }

  async function removeMine() {
    setBusy(true);
    try {
      await api.deleteMyReview();
      setText(""); setRating(5); setMediaUrls([]);
      await refresh();
      setFormOpen(false);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : t("errDelete"));
    } finally { setBusy(false); }
  }

  function openForm() {
    setError("");
    setFormOpen(true);
  }

  function onVote(id: number, likes: number, dislikes: number, vote: "like" | "dislike" | null) {
    setReviews((rs) => rs.map((r) => r.id === id ? { ...r, likes, dislikes, user_vote: vote } : r));
  }

  function onReplyAdded(reviewId: number, reply: ReviewReply) {
    setReviews((rs) => rs.map((r) => r.id === reviewId ? { ...r, replies: [...r.replies, reply] } : r));
  }

  function onReplyDeleted(reviewId: number, replyId: number) {
    setReviews((rs) => rs.map((r) => r.id === reviewId ? { ...r, replies: r.replies.filter((rp) => rp.id !== replyId) } : r));
  }

  return (
    <section className="section rv2">
      <div className="rv-wrap">
        <header className="rv2-head">
          <div>
            <p className="eyebrow animate-up">{t("eyebrow")}</p>
            <h1 className="page-title animate-up delay-1" style={{ marginBottom: 0 }}>{t("title")}</h1>
          </div>
          <div className="rv2-head-cta animate-up delay-1">
            {user ? (
              <button className="btn btn-amber" onClick={openForm}>
                {mine ? t("editReview") : t("writeReview")}
              </button>
            ) : (
              <p className="rv2-signin-hint">
                <Link to="/login">{t("signInPrefix")}</Link> {t("signInOr")} <Link to="/register">{t("createAccount")}</Link> {t("signInSuffix")}
              </p>
            )}
          </div>
        </header>

        {loaded && reviews.length > 0 && (
          <div className="review-summary-bar rv2-summary animate-up delay-2">
            <div className="review-summary-lead">
              <span className="review-summary-avg">{avgRating.toFixed(1)}</span>
              <div>
                <Stars value={Math.round(avgRating)} />
                <span className="review-summary-count">{reviews.length} {reviews.length !== 1 ? t("reviewPlural") : t("reviewSingular")}</span>
              </div>
            </div>
            {reviews.length >= 3 && (
              <div className="review-breakdown">
                {breakdown.map((b) => (
                  <div className="review-breakdown-row" key={b.n}>
                    <span className="review-breakdown-n">{b.n}★</span>
                    <span className="review-breakdown-track">
                      <span
                        className="review-breakdown-fill"
                        style={{ width: `${(b.count / maxBreakdown) * 100}%` }}
                      />
                    </span>
                    <span className="review-breakdown-count">{b.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loaded && reviews.length === 0 && (
          <div className="empty-state">
            <p className="empty-mark" aria-hidden="true">✶</p>
            <p>{t("emptyTitle")}</p>
          </div>
        )}

        <div className="rv2-grid">
          {reviews.map((r) => (
            <article key={r.id} className="review-card">
              <div className="review-card-header">
                <div className="review-avatar" aria-hidden="true">{r.author.charAt(0).toUpperCase()}</div>
                <div className="review-card-meta">
                  <Stars value={r.rating} />
                  <p className="review-author">
                    {r.author}
                    {r.is_verified_diner && <span className="verified-diner-badge">✓ Verified Diner</span>}
                    {" · "}{formatDate(r.updated_at)}
                  </p>
                </div>
              </div>
              <p className="review-text">&ldquo;{r.text}&rdquo;</p>
              {(r.media_urls?.length ?? 0) > 0 && <MediaGrid urls={r.media_urls} />}
              {r.admin_reply && (
                <div className="admin-reply-block">
                  <p className="admin-reply-label">{t("adminReplied")}</p>
                  <p className="admin-reply-text">{r.admin_reply}</p>
                  {r.admin_reply_at && <span className="admin-reply-date">{formatDate(r.admin_reply_at)}</span>}
                </div>
              )}
              <VoteBar review={r} userId={user?.id} onChange={onVote} />
              <RepliesSection review={r} userId={user?.id} onAdded={onReplyAdded} onDeleted={onReplyDeleted} />
            </article>
          ))}
        </div>
      </div>

      {formOpen && (
        <div className="modal-backdrop" onMouseDown={() => setFormOpen(false)}>
          <div
            className="modal-box modal-wide"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rv2-form-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="rv2-form-title" className="modal-title">{mine ? t("editReview") : t("leaveReview")}</h2>
            <form className="form" onSubmit={submit}>
              <label>
                {t("yourRating")}
                <div className="rating-picker" role="radiogroup" aria-label={t("rating")}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n}
                      aria-label={`${n} ${n > 1 ? t("stars") : t("star")}`}
                      className={n <= rating ? "star-btn on" : "star-btn"}
                      onClick={() => setRating(n)}>★</button>
                  ))}
                </div>
              </label>
              <label>
                {t("howWasIt")}
                <textarea rows={4} required minLength={3} maxLength={600}
                  placeholder={t("reviewPlaceholder")}
                  value={text} onChange={(e) => setText(e.target.value)} />
                {text.length > 0 && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "-0.25rem" }}>
                    {text.length}/600
                  </span>
                )}
              </label>

              <div className="rv-upload-section">
                <p className="rv-upload-label">
                  {t("photosVideo")}
                  <span className="rv-upload-hint">, {t("photosVideoHint").replace("{max}", String(MAX_IMAGES))}</span>
                </p>
                <MediaGrid urls={mediaUrls} onRemove={(i) => setMediaUrls((p) => p.filter((_, idx) => idx !== i))} />
                {mediaErr && <p className="form-error" style={{ fontSize: "0.8rem", margin: "0.35rem 0" }}>{mediaErr}</p>}
                <button type="button" className="rv-upload-btn" onClick={() => fileRef.current?.click()}>
                  {t("addPhotos")}
                </button>
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple
                  style={{ display: "none" }} onChange={handleFiles} />
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="modal-actions" style={{ justifyContent: "space-between" }}>
                <div>
                  {mine && (
                    <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={removeMine}>
                      {t("deleteMine")}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button type="button" className="btn btn-outline" onClick={() => setFormOpen(false)}>{t("cancel")}</button>
                  <button className="btn btn-amber" disabled={busy}>
                    {busy ? t("saving") : mine ? t("updateReview") : t("postReview")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
