import type { ReactNode } from "react";
import { Icon, type IconName } from "~/ui/Icon";
import { Button } from "~/ui/Button";
import { ErrorState, SkeletonRows } from "~/ui/Feedback";
import type { Query } from "~/lib/store";

/**
 * The console's own furniture.
 *
 * The customer site and the console are two different products wearing one
 * bundle, and they are read in two different situations. A guest is sitting
 * down, deciding what to eat, on their own phone. A member of staff is standing
 * up in the middle of service, holding a phone in one hand, trying to find one
 * booking out of forty.
 *
 * So the console is denser: smaller type, tighter rows, more on screen at once,
 * and tables rather than prose. What it keeps from the customer side is the
 * press response and the pending states, because a button that looks dead is
 * worse at eight on a Friday than it is on a menu.
 */

/* ── The page frame ─────────────────────────────────────────────────────────*/

export function DeskPage({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  /** Lives on the header row, not floating: at this density a floating action
      button covers a row of the table underneath it. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="dk-page">
      <header className="dk-head">
        <div className="grow stack stack--tight">
          <h1 className="dk-title">{title}</h1>
          {hint ? <p className="fine faint">{hint}</p> : null}
        </div>
        {actions ? <div className="bar bar--tight">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/**
 * Renders a query's three states without every screen writing the same branch.
 *
 * The important part is what it does **not** do: a refresh over existing data
 * does not put a skeleton back. `loading` is only true when there is genuinely
 * nothing to show, so a screen that reloads every minute does not flash grey
 * boxes at somebody reading it.
 */
export function Loaded<T>({
  query,
  intent = "desk",
  skeleton,
  children,
}: {
  query: Query<T>;
  intent?: "desk" | "load";
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.error && query.data === undefined) {
    return <ErrorState error={query.error} intent={intent} onRetry={query.reload} />;
  }
  if (query.data === undefined) {
    return <>{skeleton ?? <SkeletonRows count={5} />}</>;
  }
  return <>{children(query.data)}</>;
}

/* ── Controls above a list ──────────────────────────────────────────────────*/

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="dk-toolbar">{children}</div>;
}

export function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="dk-search">
      <Icon name="search" size={15} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="Clear">
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * A table that scrolls inside itself.
 *
 * This wrapper is not optional and it is not decoration. A wide table without it
 * makes the whole page scroll sideways, which on a phone means the navigation
 * and the header slide off too and somebody has to scroll back to find them.
 * Every table in the console goes in one of these.
 */
export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="dk-tablewrap" data-scroller="" role="region" aria-label={label} tabIndex={0}>
      <table className="dk-table">{children}</table>
    </div>
  );
}

/** A row of numbers across the top of a screen. */
export function Stats({ children }: { children: ReactNode }) {
  return <div className="dk-stats">{children}</div>;
}

export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="dk-stat">
      <span className="dk-stat__value">{value}</span>
      <span className="label">{label}</span>
      {note ? <span className="micro faint">{note}</span> : null}
    </div>
  );
}

/**
 * Nothing to show.
 *
 * Console empty states are usually good news ("no cancellations today") rather
 * than a dead end, so this is quieter than the customer one and does not insist
 * on an action.
 */
export function Nothing({ icon = "check-circle", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="dk-nothing">
      <Icon name={icon} size={20} />
      <span className="fine">{children}</span>
    </div>
  );
}

/**
 * A status word, in the console's own tone scale.
 *
 * Kept separate from the customer `Badge` because the console has states the
 * customer never sees (refunded, no-show, awaiting payment) and because at this
 * density the badge is smaller.
 */
export function State({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "hot"; children: ReactNode }) {
  return <span className={`dk-state dk-state--${tone}`}>{children}</span>;
}

/** Pagination, for the two lists that have it. */
export function Pager({
  offset,
  limit,
  more,
  onMove,
}: {
  offset: number;
  limit: number;
  more: boolean;
  onMove: (offset: number) => void;
}) {
  if (offset === 0 && !more) return null;
  return (
    <div className="dk-pager">
      <Button
        size="sm"
        tone="ghost"
        icon="arrow-left"
        disabled={offset === 0}
        onClick={() => onMove(Math.max(0, offset - limit))}
      >
        Back
      </Button>
      <span className="fine faint">
        {offset + 1} to {offset + limit}
      </span>
      <Button size="sm" tone="ghost" iconEnd="arrow-right" disabled={!more} onClick={() => onMove(offset + limit)}>
        Next
      </Button>
    </div>
  );
}

/** A labelled block inside a settings screen. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="dk-section">
      <div className="stack stack--tight">
        <h2 className="head">{title}</h2>
        {hint ? <p className="fine faint">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
