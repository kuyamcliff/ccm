import { useState } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";
import { ApiError } from "~/lib/http";

/** A bordered message. `tone` picks the colour; the icon and words carry the
    meaning on their own. */
export function Notice({
  tone = "info",
  children,
  title,
}: {
  tone?: "info" | "good" | "bad" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const icon: IconName = tone === "bad" ? "alert" : tone === "good" ? "check-circle" : tone === "warn" ? "alert" : "info";
  return (
    <div className={`notice${tone === "info" ? "" : ` notice--${tone}`}`} role={tone === "bad" ? "alert" : undefined}>
      <span className="notice__icon">
        <Icon name={icon} size={18} />
      </span>
      <div className="stack stack--tight">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * What a failed request looks like.
 *
 * A message alone leaves the visitor stuck, so this always offers the way out:
 * retry for anything transient, and a plain explanation when retrying cannot
 * help (a 404, a permission problem).
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  const offline = api?.isOffline ?? false;
  const retryable = !api || offline || api.status >= 500 || api.status === 429;
  const message = api?.message ?? "Something went wrong.";

  return (
    <div className="empty" role="alert">
      <span className="empty__icon">
        <Icon name={offline ? "wifi-off" : "alert"} size={28} />
      </span>
      <p className="empty__title">{offline ? "No connection" : "That did not load"}</p>
      <p className="fine muted">{message}</p>
      {onRetry && retryable ? (
        <Button icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {api?.reference ? <ErrorReference reference={api.reference} /> : null}
    </div>
  );
}

/**
 * The code support needs, and a way to hand it over without transcribing it.
 *
 * It is deliberately quiet: a customer who is not in touch with anybody should
 * not be made to feel this matters to them, and a customer who is should not
 * have to read eight characters down a phone line correctly.
 */
function ErrorReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <p className="error-ref fine faint">
      Reference{" "}
      <button
        type="button"
        className="error-ref__code mono"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(reference);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            /* Clipboard blocked. The code is on screen either way. */
          }
        }}
        aria-label={`Copy reference ${reference}`}
      >
        {reference}
      </button>
      {copied ? <span className="error-ref__copied"> copied</span> : null}
    </p>
  );
}

export function EmptyState({
  icon = "info",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={28} />
      </span>
      <p className="empty__title">{title}</p>
      {children ? <p className="fine muted">{children}</p> : null}
      {action}
    </div>
  );
}

/** Placeholder shaped like the content it stands in for, so nothing jumps when
    the real thing lands. */
export function Skeleton({ height = "1rem", width = "100%", radius }: { height?: string; width?: string; radius?: string }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function SkeletonCards({ count = 3, height = "7rem" }: { count?: number; height?: string }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius="var(--r-lg)" />
      ))}
    </div>
  );
}
