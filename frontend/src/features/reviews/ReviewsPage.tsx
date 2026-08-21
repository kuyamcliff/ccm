import { useState } from "react";
import { api } from "~/lib/api";
import type { Review } from "~/lib/api";
import { useMutation, useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { timeAgo } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Action, Button, LinkButton } from "~/ui/Button";
import { TextAreaField, Field } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Avatar, Badge, StarPicker, Stars } from "~/ui/Bits";
import { EmptyState, ErrorState, SkeletonRows } from "~/ui/Feedback";
import { usePress } from "~/ui/press";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useCopy } from "~/state/locale";

/**
 * What people said.
 *
 * One review per account, enforced by a unique index on the server, which is why
 * the button says "Edit my review" once you have left one rather than letting
 * you write a second and then refusing it.
 *
 * A review is a row: a rating, a name, a paragraph, and the replies under it.
 * The restaurant's own reply is marked and indented, because "the owner
 * answered" is the most useful thing on a review page and it should be visible
 * without reading.
 */
export function ReviewsPage() {
  const { c, fill } = useCopy();
  const { user } = useSession();
  const toast = useToast();
  const { confirm, element: confirmElement } = useConfirm();

  const { data, loading, error, reload } = useQuery(K.reviews, () => api.site.reviews(), { persist: true });
  const [writing, setWriting] = useState(false);

  const reviews = data ?? [];
  const mine = user ? (reviews.find((review) => review.user_id === user.id) ?? null) : null;

  const remove = useMutation(async () => {
    await api.site.deleteMyReview();
    reload();
  });

  const average =
    reviews.length > 0 ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length : null;

  return (
    <div className="page section stack">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.reviews.title}</h1>
        <p className="lead">{c.reviews.lead}</p>
        {average !== null ? (
          <div className="bar bar--tight">
            <Stars value={average} size={17} />
            <span className="fine faint">from {reviews.length}</span>
          </div>
        ) : null}
      </header>

      <div className="bar bar--wrap">
        {user ? (
          <>
            <Button tone={mine ? "ghost" : "primary"} size="sm" icon="edit" onClick={() => setWriting(true)}>
              {mine ? c.reviews.edit : c.reviews.write}
            </Button>
            {mine ? (
              <Action
                tone="quiet"
                size="sm"
                pending={remove.pending}
                pendingLabel={c.pending.deleting}
                onClick={async () => {
                  const sure = await confirm({
                    title: "Delete your review?",
                    body: "It goes for good, and you can write a new one afterwards.",
                    confirmLabel: "Delete it",
                    cancelLabel: "Keep it",
                  });
                  if (!sure) return;
                  await remove.run();
                  const failure = remove.readError();
                  if (failure) toast.failed(failure, "delete");
                }}
              >
                {c.common.remove}
              </Action>
            ) : null}
          </>
        ) : (
          <LinkButton to="/signin" tone="primary" size="sm">
            {c.reviews.write}
          </LinkButton>
        )}
      </div>

      {error ? (
        <ErrorState error={error} intent="load" onRetry={reload} />
      ) : loading ? (
        <SkeletonRows count={4} />
      ) : reviews.length === 0 ? (
        <EmptyState icon="star" title={c.reviews.none} body={c.reviews.noneBody} />
      ) : (
        <div className="rows">
          {reviews.map((review) => (
            <ReviewRow key={review.id} review={review} onChanged={reload} />
          ))}
        </div>
      )}

      <WriteReview
        open={writing}
        existing={mine}
        onClose={() => setWriting(false)}
        onSaved={() => {
          setWriting(false);
          reload();
          toast.done(c.reviews.posted);
        }}
      />

      {confirmElement}
      <span className="sr-only">{fill(c.reviews.replies, { n: 0 })}</span>
    </div>
  );
}

/* ── One review ─────────────────────────────────────────────────────────────*/

function ReviewRow({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const { c, fill } = useCopy();
  const { user } = useSession();
  const toast = useToast();

  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [showReplies, setShowReplies] = useState(false);

  const vote = useMutation(async (choice: "like" | "dislike") => {
    if (review.user_vote === choice) await api.site.clearReviewVote(review.id);
    else await api.site.voteReview(review.id, choice);
    onChanged();
  });

  const send = useMutation(async () => {
    await api.site.replyToReview(review.id, reply.trim());
    setReply("");
    setReplying(false);
    setShowReplies(true);
    onChanged();
  });

  return (
    <article className="row row--top row--tall review">
      <Avatar name={review.author} size={32} />

      <div className="grow stack stack--tight">
        <div className="bar bar--tight bar--wrap">
          <span className="head">{review.author}</span>
          {review.is_verified_diner ? <Badge tone="good">{c.reviews.verified}</Badge> : null}
          <span className="fine faint push">{timeAgo(review.updated_at || review.created_at)}</span>
        </div>

        <Stars value={review.rating} size={14} showValue={false} />
        <p className="small">{review.text}</p>

        {review.admin_reply ? (
          <div className="review__reply">
            <p className="label hot">{c.reviews.fromUs}</p>
            <p className="fine">{review.admin_reply}</p>
          </div>
        ) : null}

        <div className="bar bar--tight review__actions">
          <VoteButton
            icon="thumb-up"
            count={review.likes}
            on={review.user_vote === "like"}
            disabled={!user || vote.pending}
            onPress={() => void vote.run("like")}
            label="Helpful"
          />
          <VoteButton
            icon="thumb-down"
            count={review.dislikes}
            on={review.user_vote === "dislike"}
            disabled={!user || vote.pending}
            onPress={() => void vote.run("dislike")}
            label="Not helpful"
          />

          {review.replies.length > 0 ? (
            <button type="button" className="link fine" onClick={() => setShowReplies((current) => !current)}>
              {fill(c.reviews.replies, { n: review.replies.length })}
            </button>
          ) : null}

          {user ? (
            <button type="button" className="link fine push" onClick={() => setReplying((current) => !current)}>
              {c.reviews.reply}
            </button>
          ) : null}
        </div>

        {showReplies && review.replies.length > 0 ? (
          <div className="rows review__replies">
            {review.replies.map((entry) => (
              <div key={entry.id} className="row row--top">
                <Avatar name={entry.author} size={24} />
                <div className="grow stack stack--tight">
                  <span className="fine strong">{entry.author}</span>
                  <span className="fine muted">{entry.text}</span>
                </div>
                <span className="fine faint">{timeAgo(entry.created_at)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {replying ? (
          <form
            className="stack stack--tight"
            onSubmit={async (event) => {
              event.preventDefault();
              await send.run();
              const error = send.readError();
              if (error) toast.failed(error, "review");
            }}
          >
            <TextAreaField
              label={c.reviews.reply}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={2}
              maxLength={500}
            />
            <Action
              type="submit"
              size="sm"
              tone="primary"
              pending={send.pending}
              pendingLabel={c.pending.posting}
              disabled={reply.trim().length < 2}
            >
              {c.reviews.post}
            </Action>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function VoteButton({
  icon,
  count,
  on,
  disabled,
  onPress,
  label,
}: {
  icon: "thumb-up" | "thumb-down";
  count: number;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  const press = usePress({ disabled });
  return (
    <button
      type="button"
      className="vote"
      data-on={on ? "true" : undefined}
      disabled={disabled}
      onClick={onPress}
      aria-label={`${label}, ${count}`}
      aria-pressed={on}
      {...press.pressProps}
    >
      <Icon name={icon} size={14} />
      {count > 0 ? count : null}
    </button>
  );
}

/* ── Writing one ────────────────────────────────────────────────────────────*/

function WriteReview({
  open,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: Review | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { c } = useCopy();
  const toast = useToast();

  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [text, setText] = useState(existing?.text ?? "");

  const save = useMutation(async () => {
    await api.site.saveReview(rating, text.trim());
    onSaved();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? c.reviews.edit : c.reviews.write}
      footer={
        <Action
          tone="primary"
          block
          pending={save.pending}
          pendingLabel={c.pending.posting}
          disabled={text.trim().length < 4}
          onClick={async () => {
            await save.run();
            const error = save.readError();
            if (error) toast.failed(error, "review");
          }}
        >
          {c.reviews.post}
        </Action>
      }
    >
      <div className="stack">
        <Field label={c.reviews.rating}>
          {() => <StarPicker value={rating} onChange={setRating} label={c.reviews.rating} />}
        </Field>

        <TextAreaField
          label={c.reviews.text}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          maxLength={1000}
          placeholder="What did you have, and how was it?"
        />
      </div>
    </Sheet>
  );
}
