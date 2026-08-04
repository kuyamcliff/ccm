import { useState } from "react";
import { api } from "~/lib/api";
import { timeAgo } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Avatar, Badge, Stars } from "~/ui/Bits";
import { TextAreaField } from "~/ui/Field";
import { Photo } from "~/ui/Photo";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, Stat } from "./parts";

/**
 * Reviews, and the restaurant's replies to them.
 *
 * A reply from here is signed as the restaurant and shown under the review to
 * everybody, which is worth saying on the screen: staff write differently when
 * they know the whole town reads it.
 *
 * Deleting is available but sits behind a confirmation that says plainly it is
 * someone's honest opinion.
 */
export function ReviewsAdmin() {
  const reviews = useResource(() => api.desk.reviews.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [replying, setReplying] = useState<number | null>(null);
  const [text, setText] = useState("");

  const rows = reviews.data ?? [];
  const average = rows.length > 0 ? rows.reduce((sum, review) => sum + review.rating, 0) / rows.length : 0;
  const unanswered = rows.filter((review) => !review.admin_reply).length;

  return (
    <DeskPage title="Reviews">
      {confirmElement}

      <div className="stat-grid">
        <Stat label="Reviews" value={rows.length} icon="message" />
        <Stat label="Average" value={rows.length ? average.toFixed(1) : "No reviews"} icon="star" />
        <Stat label="Without a reply" value={unanswered} icon="alert" />
      </div>

      <Loaded resource={reviews} skeletonHeight="8rem">
        {(list) =>
          list.length === 0 ? (
            <Nothing>Nobody has left a review yet.</Nothing>
          ) : (
            <div className="stack">
              {list.map((review) => (
                <article key={review.id} className="card stack">
                  <div className="row">
                    <Avatar name={review.author} />
                    <div>
                      <p className="row" style={{ gap: "var(--s-2)" }}>
                        <strong>{review.author}</strong>
                        {review.is_verified_diner ? <Badge tone="good">Ate here</Badge> : null}
                      </p>
                      <p className="fine faint">{timeAgo(review.updated_at || review.created_at)}</p>
                    </div>
                    <span className="push">
                      <Stars value={review.rating} showValue={false} />
                    </span>
                  </div>

                  <p className="muted">{review.text}</p>

                  {review.media_urls.length > 0 ? (
                    <div className="review__photos">
                      {review.media_urls.map((url) => (
                        <Photo key={url} src={url} alt="" />
                      ))}
                    </div>
                  ) : null}

                  {review.admin_reply ? (
                    <div className="review__owner">
                      <p className="label">Your reply</p>
                      <p>{review.admin_reply}</p>
                    </div>
                  ) : null}

                  <div className="row row--wrap">
                    <Button
                      size="sm"
                      tone={review.admin_reply ? "ghost" : "primary"}
                      icon="message"
                      onClick={() => {
                        setText(review.admin_reply ?? "");
                        setReplying(review.id);
                      }}
                    >
                      {review.admin_reply ? "Change the reply" : "Reply"}
                    </Button>

                    {review.admin_reply ? (
                      <Button
                        size="sm"
                        tone="quiet"
                        onClick={async () => {
                          try {
                            await api.desk.reviews.removeReply(review.id);
                            reviews.reload();
                            toast.done("Reply removed.");
                          } catch (err) {
                            toast.failed(err);
                          }
                        }}
                      >
                        Remove the reply
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      tone="danger"
                      className="push"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete this review?",
                          body: "It is somebody's honest opinion and deleting it cannot be undone. Replying is usually the better answer.",
                          confirmLabel: "Delete it",
                        });
                        if (!ok) return;
                        try {
                          await api.desk.reviews.remove(review.id);
                          reviews.reload();
                          toast.done("Review deleted.");
                        } catch (err) {
                          toast.failed(err);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )
        }
      </Loaded>

      <Sheet
        open={replying !== null}
        onClose={() => setReplying(null)}
        title="Reply as the restaurant"
        description="Shown publicly under the review, signed as Cam Chop Meat."
        footer={
          <>
            <Button tone="ghost" onClick={() => setReplying(null)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              onClick={async () => {
                if (replying === null) return;
                try {
                  await api.desk.reviews.reply(replying, text.trim());
                  setReplying(null);
                  reviews.reload();
                  toast.done("Reply posted.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Post the reply
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Your reply"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          placeholder="Thank them, or explain what happened and what you have changed."
        />
      </Sheet>
    </DeskPage>
  );
}
