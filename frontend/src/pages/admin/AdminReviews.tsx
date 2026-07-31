import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Review } from "../../api";
import { Stars } from "../../components/Stars";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

type AdminReview = Review & { author: string };

export function AdminReviews() {
  const { t } = useLanguage();
  const tr = (key: string) => t("adminReviews", key);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api.admin.reviews();
      setReviews(r.reviews);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("errLoad"));
    } finally {
      setLoading(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setBusy(id);
    try {
      await api.admin.deleteReview(id);
      setReviews((rs) => rs.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("errDelete"));
    } finally {
      setBusy(null);
    }
  }

  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const dist = [5, 4, 3, 2, 1].map((n) => ({
    rating: n,
    count: reviews.filter((r) => r.rating === n).length,
  }));

  return (
    <div>
      <h1 className="admin-page-title">{tr("title")}</h1>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {/* Summary */}
      {reviews.length > 0 && (
        <div className="review-admin-summary">
          <div className="review-admin-avg">
            <span className="review-admin-avg-num">{avg}</span>
            <Stars value={Math.round(Number(avg))} />
            <span className="review-admin-count">{reviews.length} {reviews.length !== 1 ? tr("reviewPlural") : tr("reviewSingular")}</span>
          </div>
          <div className="review-admin-dist">
            {dist.map((d) => (
              <div key={d.rating} className="review-dist-row">
                <span className="review-dist-label">{d.rating}★</span>
                <div className="review-dist-bar">
                  <div
                    className="review-dist-fill"
                    style={{ width: reviews.length ? `${(d.count / reviews.length) * 100}%` : "0%" }}
                  />
                </div>
                <span className="review-dist-count">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="empty-admin">{tr("loading")}</p>
      ) : reviews.length === 0 ? (
        <p className="empty-admin">{tr("noReviews")}</p>
      ) : (
        <div className="review-admin-list">
          {reviews.map((r) => (
            <div key={r.id} className="review-admin-card">
              <div className="review-admin-header">
                <div>
                  <Stars value={r.rating} />
                  <p className="review-admin-author">
                    {r.author}
                    <span className="review-admin-date"> , {r.updated_at.slice(0, 10)}</span>
                  </p>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busy === r.id}
                  onClick={() => setDeleteTarget(r)}
                >
                  {tr("delete")}
                </button>
              </div>
              <p className="review-admin-text">{r.text}</p>
              {(r.media_urls?.length ?? 0) > 0 && (
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {r.media_urls.filter((u: string) => !u.startsWith("data:video")).map((url: string, j: number) => (
                    <img key={j} src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6 }} loading="lazy" />
                  ))}
                  {r.media_urls.filter((u: string) => u.startsWith("data:video")).map((url: string, j: number) => (
                    <video key={`v${j}`} src={url} style={{ width: 120, height: 72, objectFit: "cover", borderRadius: 6 }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={tr("deleteTitle")}
        body={tr("deleteBody").replace("{author}", deleteTarget?.author ?? "")}
        confirmLabel={tr("deleteReview")}
        confirmClass="btn-danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
