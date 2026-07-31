import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import type { Review } from "~/lib/api";
import { timeAgo } from "~/lib/format";
import { readImageFile, IMAGE_ACCEPT, ImageError } from "~/lib/imageFile";
import { useAction, useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { TextAreaField } from "~/ui/Field";
import { Avatar, Badge, StarPicker, Stars } from "~/ui/Bits";
import { EmptyState, ErrorState, Notice, SkeletonCards } from "~/ui/Feedback";
import { useConfirm } from "~/ui/Sheet";
import { Icon } from "~/ui/Icon";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";

/**
 * What people said.
 *
 * One review per account, editable and deletable by its author, which is what
 * the server enforces. Votes and replies are open to any signed-in guest, so
 * the page has to work for a signed-out reader too: they can read everything
 * and are asked to sign in only at the point they try to join in.
 */

function ReviewCard({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const { user } = useSession();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [votes, setVotes] = useState({
    likes: review.likes,
    dislikes: review.dislikes,
    mine: review.user_vote,
  });

  async function vote(kind: "like" | "dislike") {
    if (!user) {
      toast.say("Sign in to vote on a review.");
      return;
    }
    try {
      // Optimistic: the count moves under the finger, and is corrected by the
      // server's answer a moment later.
      const clearing = votes.mine === kind;
      const result = clearing ? await api.site.clearReviewVote(review.id) : await api.site.voteReview(review.id, kind);
      setVotes({ likes: result.likes, dislikes: result.dislikes, mine: result.user_vote });
    } catch (err) {
      toast.failed(err);
    }
  }

  return (
    <article className="review">
      <header className="review__head">
        <Avatar name={review.author} />
        <div>
          <p className="review__author">
            {review.author}
            {review.is_verified_diner ? <Badge tone="good">Ate here</Badge> : null}
          </p>
          <p className="fine faint">{timeAgo(review.updated_at || review.created_at)}</p>
        </div>
        <Stars value={review.rating} showValue={false} />
      </header>

      <p className="review__text">{review.text}</p>

      {review.media_urls.length > 0 ? (
        <div className="review__photos">
          {review.media_urls.map((url) => (
            <img key={url} src={url} alt="" loading="lazy" decoding="async" />
          ))}
        </div>
      ) : null}

      {review.admin_reply ? (
        <div className="review__owner">
          <p className="label">From the restaurant</p>
          <p>{review.admin_reply}</p>
        </div>
      ) : null}

      {review.replies.length > 0 ? (
        <ul className="review__replies">
          {review.replies.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.author}</strong> {entry.text}
              {user && entry.user_id === user.id ? (
                <IconButton
                  name="trash"
                  label="Delete your reply"
                  size="sm"
                  onClick={async () => {
                    try {
                      await api.site.deleteReviewReply(entry.id);
                      onChanged();
                    } catch (err) {
                      toast.failed(err);
                    }
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="review__foot">
        <button type="button" className="vote" data-on={votes.mine === "like"} onClick={() => vote("like")}>
          <Icon name="thumb-up" size={16} />
          <span className="mono">{votes.likes}</span>
          <span className="sr-only">agree with this review</span>
        </button>
        <button type="button" className="vote" data-on={votes.mine === "dislike"} onClick={() => vote("dislike")}>
          <Icon name="thumb-down" size={16} />
          <span className="mono">{votes.dislikes}</span>
          <span className="sr-only">disagree with this review</span>
        </button>

        {user ? (
          <button type="button" className="btn btn--quiet btn--sm push" onClick={() => setReplying((open) => !open)}>
            Reply
          </button>
        ) : null}
      </footer>

      {replying ? (
        <form
          className="stack stack--tight"
          onSubmit={async (event) => {
            event.preventDefault();
            if (reply.trim().length < 2) return;
            try {
              await api.site.replyToReview(review.id, reply.trim());
              setReply("");
              setReplying(false);
              onChanged();
            } catch (err) {
              toast.failed(err);
            }
          }}
        >
          <TextAreaField
            label="Your reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={400}
            rows={2}
          />
          <div className="row">
            <Button type="submit" size="sm" tone="primary">
              Post reply
            </Button>
            <Button size="sm" tone="quiet" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function MyReview({ mine, onSaved }: { mine: Review | null; onSaved: () => void }) {
  const { user } = useSession();
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [text, setText] = useState(mine?.text ?? "");
  const [photo, setPhoto] = useState<string | null>(mine?.media_urls[0] ?? null);
  const [problem, setProblem] = useState<string | null>(null);

  const save = useAction(api.site.saveReview);

  if (!user) {
    return (
      <div className="card stack">
        <h2 className="card__title">Been in?</h2>
        <p className="fine muted">Sign in to leave a review. One per person, and you can change it whenever you like.</p>
        <div className="row">
          <Link to="/signin" state={{ from: "/reviews" }} className="btn btn--primary">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card stack">
      {confirmElement}
      <h2 className="card__title">{mine ? "Your review" : "Leave a review"}</h2>

      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setProblem(null);
          if (rating < 1) {
            setProblem("Pick a rating first.");
            return;
          }
          if (text.trim().length < 4) {
            setProblem("Say a little more than that.");
            return;
          }
          if (!(await save.run(rating, text.trim(), photo ? [photo] : []))) {
            setProblem("That did not save. Try again.");
            return;
          }
          toast.done(mine ? "Review updated." : "Thanks for the review.");
          onSaved();
        }}
      >
        <StarPicker value={rating} onChange={setRating} />

        <TextAreaField
          label="How was it"
          placeholder="The food, the wait, the music, whatever stood out."
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          required
        />

        <div className="row row--wrap">
          <label className="btn btn--ghost btn--sm">
            <Icon name="camera" size={16} />
            {photo ? "Change photo" : "Add a photo"}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  setPhoto(await readImageFile(file));
                } catch (err) {
                  setProblem(err instanceof ImageError ? err.message : "That photo could not be used.");
                }
              }}
            />
          </label>
          {photo ? (
            <Button size="sm" tone="quiet" onClick={() => setPhoto(null)}>
              Remove photo
            </Button>
          ) : null}
        </div>

        {photo ? <img className="review__preview" src={photo} alt="" /> : null}
        {problem ? <Notice tone="bad">{problem}</Notice> : null}

        <div className="row row--wrap">
          <Button type="submit" tone="primary" busy={save.busy}>
            {mine ? "Update review" : "Post review"}
          </Button>
          {mine ? (
            <Button
              tone="danger"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete your review?",
                  body: "It comes off the page for everyone.",
                  confirmLabel: "Delete",
                });
                if (!ok) return;
                try {
                  await api.site.deleteMyReview();
                  setRating(0);
                  setText("");
                  setPhoto(null);
                  onSaved();
                  toast.done("Review deleted.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export function ReviewsPage() {
  const { user } = useSession();
  const reviews = useResource(() => api.site.reviews(), []);
  const [sort, setSort] = useState<"recent" | "best">("recent");

  const rows = reviews.data ?? [];
  const mine = user ? rows.find((review) => review.user_id === user.id) ?? null : null;
  const others = rows.filter((review) => review.user_id !== user?.id);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const total = rows.reduce((sum, review) => sum + review.rating, 0);
    return { average: total / rows.length, count: rows.length };
  }, [rows]);

  const sorted = useMemo(
    () =>
      [...others].sort((a, b) =>
        sort === "best" ? b.rating - a.rating || b.likes - a.likes : (b.created_at > a.created_at ? 1 : -1)
      ),
    [others, sort]
  );

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Reviews</h1>
        {summary ? (
          <div className="row">
            <Stars value={summary.average} size={20} />
            <span className="muted">from {summary.count} people</span>
          </div>
        ) : null}
      </div>

      <div className="reviews-layout">
        <div className="stack">
          <div className="row row--between">
            <div className="tabs" role="tablist" aria-label="Sort reviews">
              <button
                type="button"
                role="tab"
                className="tab"
                aria-selected={sort === "recent"}
                onClick={() => setSort("recent")}
              >
                Newest
              </button>
              <button
                type="button"
                role="tab"
                className="tab"
                aria-selected={sort === "best"}
                onClick={() => setSort("best")}
              >
                Highest rated
              </button>
            </div>
          </div>

          {reviews.loading ? (
            <SkeletonCards count={3} height="9rem" />
          ) : reviews.error ? (
            <ErrorState error={reviews.error} onRetry={reviews.reload} />
          ) : sorted.length === 0 && !mine ? (
            <EmptyState icon="message" title="Nobody has written one yet">
              If you have eaten here, you could be the first.
            </EmptyState>
          ) : (
            <div className="stack">
              {mine ? <ReviewCard review={mine} onChanged={reviews.reload} /> : null}
              {sorted.map((review) => (
                <ReviewCard key={review.id} review={review} onChanged={reviews.reload} />
              ))}
            </div>
          )}
        </div>

        <aside className="reviews-aside">
          <MyReview mine={mine} onSaved={reviews.reload} />
        </aside>
      </div>
    </div>
  );
}
