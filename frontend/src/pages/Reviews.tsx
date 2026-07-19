import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Review } from "../api";
import { useAuth } from "../auth";
import { Stars } from "../components/Stars";

export function Reviews() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mine = user ? reviews.find((r) => r.user_id === user.id) : undefined;

  async function refresh() {
    const r = await api.reviews();
    setReviews(r.reviews);
    setLoaded(true);
  }

  useEffect(() => {
    refresh().catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setText(mine.text);
    }
  }, [mine?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.saveReview(rating, text);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMine() {
    setBusy(true);
    try {
      await api.deleteMyReview();
      setText("");
      setRating(5);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow">Word on the street</p>
        <h1 className="page-title">Reviews</h1>

        {user ? (
          <form className="form ticket" onSubmit={submit}>
            <p className="ticket-no">{mine ? "EDIT YOUR REVIEW" : "LEAVE A REVIEW"}</p>
            <label>
              Your rating
              <div className="rating-picker" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    className={n <= rating ? "star-btn on" : "star-btn"}
                    onClick={() => setRating(n)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </label>
            <label>
              How was it?
              <textarea
                rows={3}
                required
                minLength={3}
                maxLength={600}
                placeholder="Tell people about the pork..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="hero-actions">
              <button className="btn btn-red" disabled={busy}>
                {busy ? "Saving..." : mine ? "Update review" : "Post review"}
              </button>
              {mine && (
                <button type="button" className="btn btn-ink" disabled={busy} onClick={removeMine}>
                  Delete mine
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="notice">
            Been here? <Link to="/login">Sign in</Link> or{" "}
            <Link to="/register">create an account</Link> to leave a review.
          </p>
        )}

        {loaded && reviews.length === 0 && (
          <div className="empty-state">
            <p className="empty-mark" aria-hidden="true">✶</p>
            <p>No reviews yet. The grill is ready when you are; be the first to write one.</p>
          </div>
        )}

        <div className="review-stack">
          {reviews.map((r) => (
            <article key={r.id} className="review-card">
              <Stars value={r.rating} />
              <p className="review-text">{r.text}</p>
              <p className="review-author">
                {r.author} · {r.updated_at.slice(0, 10)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
