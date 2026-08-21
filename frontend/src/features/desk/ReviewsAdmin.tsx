import { useState } from "react";
import { api } from "~/lib/api";
import type { Review } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { timeAgo } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { TextAreaField, Segmented } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Avatar, Stars } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, State, StatTile, Stats } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Guest reviews, and replying to them as the restaurant.
 *
 * Replying is the point of this screen. A public reply from the owner is worth
 * more than the review it answers, especially on a bad one, and it is the thing
 * most restaurants never get round to. So the unanswered ones come first and the
 * reply box is one tap away.
 *
 * Deleting is deliberately last and asks twice over. A review is somebody's
 * account of their evening, and deleting one because it stings is how a review
 * page stops being worth reading.
 */

type Tab = "unanswered" | "all";

export function ReviewsAdmin() {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const [tab, setTab] = useState<Tab>("unanswered");
  const [replying, setReplying] = useState<Review | null>(null);
  const [text, setText] = useState("");

  const reviews = useQuery(K.desk.reviews, () => api.desk.reviews.list(), { staleMs: 60_000 });

  function refresh() {
    invalidate("desk.reviews*");
    invalidate(K.reviews);
    invalidate(K.highlights);
    reviews.reload();
  }

  const reply = useMutation(async () => {
    if (!replying) return;
    await api.desk.reviews.reply(replying.id, text.trim());
    setReplying(null);
    setText("");
    refresh();
    toast.done("Replied.");
  });

  const dropReply = useMutation(async (id: number) => {
    await api.desk.reviews.removeReply(id);
    refresh();
    toast.done("Reply removed.");
  });

  const remove = useMutation(async (id: number) => {
    await api.desk.reviews.remove(id);
    refresh();
    toast.done("Deleted.");
  });

  const all = reviews.data ?? [];
  const unanswered = all.filter((review) => !review.admin_reply);
  const shown = tab === "unanswered" ? unanswered : all;

  const average = all.length > 0 ? all.reduce((total, review) => total + review.rating, 0) / all.length : 0;

  return (
    <DeskPage title="Reviews" hint="Answering one is worth more than the review itself.">
      <Stats>
        <StatTile label="Reviews" value={all.length} />
        <StatTile label="Average" value={average.toFixed(1)} />
        <StatTile label="Unanswered" value={unanswered.length} />
      </Stats>

      <Segmented
        value={tab}
        onChange={setTab}
        label="Which reviews"
        options={[
          { value: "unanswered", label: unanswered.length > 0 ? `Unanswered (${unanswered.length})` : "Unanswered" },
          { value: "all", label: "All" },
        ]}
      />

      <Loaded query={reviews}>
        {() =>
          shown.length === 0 ? (
            <Nothing icon="star">
              {tab === "unanswered" ? "Every review has an answer. Well done." : "No reviews yet."}
            </Nothing>
          ) : (
            <div className="rows">
              {shown.map((review) => (
                <article key={review.id} className="row row--top row--tall">
                  <Avatar name={review.author} size={30} />

                  <div className="grow stack stack--tight">
                    <div className="bar bar--tight bar--wrap">
                      <span className="small strong">{review.author}</span>
                      <Stars value={review.rating} size={13} showValue={false} />
                      {review.is_verified_diner ? <State tone="good">Ate here</State> : null}
                      <span className="fine faint push">{timeAgo(review.updated_at || review.created_at)}</span>
                    </div>

                    <p className="fine">{review.text}</p>

                    {review.admin_reply ? (
                      <div className="dk-reply">
                        <p className="label hot">Your reply</p>
                        <p className="fine">{review.admin_reply}</p>
                        <Action
                          size="sm"
                          tone="quiet"
                          pending={dropReply.pending}
                          pendingLabel="Removing"
                          onClick={() => void dropReply.run(review.id)}
                        >
                          Remove reply
                        </Action>
                      </div>
                    ) : (
                      <div className="bar bar--tight">
                        <Button
                          size="sm"
                          tone="primary"
                          onClick={() => {
                            setReplying(review);
                            setText("");
                          }}
                        >
                          Reply
                        </Button>
                        <Button
                          size="sm"
                          tone="quiet"
                          onClick={async () => {
                            const sure = await confirm({
                              title: "Delete this review?",
                              body: "Only if it breaks the rules. Deleting a review because it stings is how a review page stops being worth reading.",
                              confirmLabel: "Delete it",
                            });
                            if (!sure) return;
                            await remove.run(review.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
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
        footer={
          <Action
            tone="primary"
            block
            pending={reply.pending}
            pendingLabel="Posting"
            disabled={text.trim().length < 4}
            onClick={async () => {
              await reply.run();
              const error = reply.readError();
              if (error) toast.failed(error, "desk");
            }}
          >
            Post the reply
          </Action>
        }
      >
        {replying ? (
          <div className="stack">
            <div className="rows">
              <div className="row row--top">
                <Avatar name={replying.author} size={28} />
                <div className="grow stack stack--tight">
                  <Stars value={replying.rating} size={13} showValue={false} />
                  <p className="fine">{replying.text}</p>
                </div>
              </div>
            </div>

            <TextAreaField
              label="Your reply"
              hint="This shows publicly under their review, signed as Cam Chop Meat."
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              maxLength={600}
            />
          </div>
        ) : null}
      </Sheet>

      {element}
    </DeskPage>
  );
}
