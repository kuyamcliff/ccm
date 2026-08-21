import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";
import { say, worthRetrying, type Intent } from "~/lib/say";

/**
 * What a screen shows when it has nothing, or when something went wrong.
 *
 * These states are where a product's manners show. The rules here:
 *
 *   - An empty screen says what would be here and how to make it happen. Never
 *     just "No results".
 *   - A failure says what to do next in the same breath as what went wrong, and
 *     it never quotes the server. See `lib/say`.
 *   - A skeleton is a last resort. With the query cache in `lib/store` doing its
 *     job, most screens have real content on the first frame and a skeleton
 *     should be rare enough to be worth noticing.
 */

/* ── Notices ────────────────────────────────────────────────────────────────*/

type Tone = "info" | "good" | "warn" | "bad";

const NOTICE_ICON: Record<Tone, IconName> = {
  info: "info",
  good: "check-circle",
  warn: "alert",
  bad: "alert",
};

/** A line of context inside a screen. Not a toast: this stays until the reason
    for it goes away. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={NOTICE_ICON[tone]} size={17} className="notice__icon" />
      <div className="notice__body">
        {title ? <p className="head">{title}</p> : null}
        {children ? <div className="fine">{children}</div> : null}
      </div>
      {action ? <div className="notice__action">{action}</div> : null}
    </div>
  );
}

/* ── Failure ────────────────────────────────────────────────────────────────*/

/**
 * A whole screen that could not load.
 *
 * `intent` picks the wording. Give it the real one: "We could not load the menu"
 * is worth having over "Something went wrong", and it costs one word at the call
 * site.
 */
export function ErrorState({
  error,
  intent = "load",
  onRetry,
  className,
}: {
  error: unknown;
  intent?: Intent;
  onRetry?: () => void;
  className?: string;
}) {
  const message = say(error, intent);
  const retryable = worthRetrying(error);

  return (
    <div className={["state", className].filter(Boolean).join(" ")} role="alert">
      <Icon name="alert" size={26} className="state__icon" />
      <p className="title">{message}</p>
      {onRetry && retryable ? (
        <Button tone="ghost" size="sm" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A screen with nothing on it yet.
 *
 * `action` is not optional in spirit even though it is in the types: an empty
 * state with no way out of it is a dead end, and the only ones here that leave
 * it off are lists the person cannot add to themselves.
 */
export function EmptyState({
  icon = "flame",
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["state", className].filter(Boolean).join(" ")}>
      <Icon name={icon} size={26} className="state__icon" />
      <p className="title">{title}</p>
      {body ? <p className="lead center">{body}</p> : null}
      {action ? <div className="bar bar--tight">{action}</div> : null}
    </div>
  );
}

/* ── Waiting ────────────────────────────────────────────────────────────────*/

/**
 * A grey box standing in for content.
 *
 * The sheen animates a transform rather than a background position, so it
 * composites instead of repainting. A page full of repainting skeletons on a
 * mid range Android is a page that janks before it has shown anything.
 */
export function Skeleton({
  height = "1rem",
  width = "100%",
  radius = "var(--r-sm)",
  className,
}: {
  height?: string;
  width?: string;
  radius?: string;
  className?: string;
}) {
  return (
    <span
      className={["skeleton", className].filter(Boolean).join(" ")}
      style={{ height, width, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** A stand-in for a list of rows, which is what most of this product is. */
export function SkeletonRows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={["rows", className].filter(Boolean).join(" ")} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="row" key={index}>
          <Skeleton height="2.5rem" width="2.5rem" radius="var(--r-sm)" />
          <div className="grow stack stack--tight">
            <Skeleton height="0.9rem" width={`${55 + ((index * 13) % 30)}%`} />
            <Skeleton height="0.75rem" width={`${35 + ((index * 17) % 25)}%`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The page-level wait.
 *
 * Deliberately not a spinner in the middle of an empty screen. A spinner says
 * "something is wrong and you are waiting for it"; a shape that matches what is
 * about to arrive says "this is nearly here".
 */
export function PageLoading() {
  return (
    <div className="page section stack" aria-busy="true" aria-label="Loading">
      <Skeleton height="1.75rem" width="12rem" />
      <SkeletonRows count={5} />
    </div>
  );
}

/**
 * The quiet line a cached screen shows while it refreshes behind itself.
 *
 * Almost never seen, which is the point: it only appears when a revalidation
 * fails and the screen is knowingly showing something slightly old. Saying so is
 * better than letting somebody act on a stale price.
 */
export function StaleNote({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="fine faint stale-note">
      Could not refresh. Showing what we had.{" "}
      <button type="button" className="link" onClick={onRetry}>
        Try again
      </button>
    </p>
  );
}
