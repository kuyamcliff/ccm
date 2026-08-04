import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "~/ui/Icon";
import { Money } from "~/ui/Bits";
import { ErrorState, SkeletonCards } from "~/ui/Feedback";
import type { Resource } from "~/lib/useResource";

/**
 * The pieces every console screen is built from.
 *
 * Twenty screens that each hand-rolled their own header and loading state is
 * twenty chances for them to drift apart, so all of it lives here.
 */

export function DeskPage({
  title,
  lead,
  actions,
  children,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="desk-page">
      <header className="desk-page__head">
        <div>
          <h1 className="display display--lg">{title}</h1>
          {lead ? <p className="fine muted">{lead}</p> : null}
        </div>
        {actions ? <div className="desk-page__actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/**
 * Renders a resource's three states in one place.
 *
 * Takes the render function as a child so a screen never has to write the
 * loading and error branches itself, and can never forget the error one.
 */
export function Loaded<T>({
  resource,
  children,
  skeletonHeight,
}: {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
  skeletonHeight?: string;
}) {
  if (resource.loading) return <SkeletonCards count={3} height={skeletonHeight ?? "3.5rem"} />;
  if (resource.error) return <ErrorState error={resource.error} onRetry={resource.reload} />;
  if (resource.data === null) return null;
  return <>{children(resource.data)}</>;
}

/** A row of filters and search above a table. Sticks under the console bar. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="desk-toolbar">{children}</div>;
}

/**
 * A console table that becomes a list of cards on a phone.
 *
 * These tables carry six or seven columns because that is what reading a
 * hundred bookings at a glance needs. On a phone that same table scrolled
 * sideways, and the columns that ended up off the right-hand edge were the
 * status and the actions — so a booking could not be cancelled, and a guest
 * could not be blocked, without dragging the table across first. The most
 * important columns were the least reachable.
 *
 * Below the breakpoint each row stacks into a card. That only reads if every
 * value still says what it is, so the header text is copied onto each cell as
 * `data-label` and the CSS prints it beside the value. Doing it here rather
 * than by hand means the twenty screens that already exist need no changes and
 * a twenty-first gets it for free.
 *
 * It runs on every render, not once: the rows are replaced whenever the data
 * reloads, and the labels have to follow them.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const table = box.current?.querySelector("table");
    if (!table) return;

    const headings = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.children].forEach((cell, index) => {
        const heading = headings[index];
        /* An unnamed column is the actions column. Labelling it would print an
           empty prefix before the buttons. */
        if (heading) cell.setAttribute("data-label", heading);
        else cell.removeAttribute("data-label");
      });
    }
  });

  return (
    <div ref={box} className="scroll-x desk-table">
      <table className="table">{children}</table>
    </div>
  );
}

export function Stat({
  label,
  value,
  money,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  money?: boolean;
  hint?: string;
  icon?: IconName;
}) {
  return (
    <div className="stat">
      <div className="row row--between">
        <span className="label">{label}</span>
        {icon ? (
          <span className="stat__icon">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>
      <p className="stat__value">
        {money && typeof value === "number" ? <Money value={value} /> : value}
      </p>
      {hint ? <p className="fine faint">{hint}</p> : null}
    </div>
  );
}

/**
 * A status shown as a coloured word.
 *
 * The colour is a second signal, never the only one: the word is always there,
 * which is what makes it work in a photocopied rota or for a colourblind
 * member of staff.
 */
export function State({ value }: { value: string }) {
  const tone = TONES[value] ?? "neutral";
  return <span className={`badge badge--${tone}`}>{LABELS[value] ?? value.replace(/_/g, " ")}</span>;
}

const TONES: Record<string, string> = {
  confirmed: "good",
  completed: "good",
  paid: "good",
  ready: "good",
  seated: "good",
  approved: "good",
  picked_up: "neutral",
  pending: "warn",
  pending_payment: "warn",
  waiting: "warn",
  notified: "warn",
  unpaid: "warn",
  cancelled: "bad",
  failed: "bad",
  no_show: "bad",
  refunded: "neutral",
};

const LABELS: Record<string, string> = {
  pending_payment: "Awaiting deposit",
  picked_up: "Collected",
  no_show: "No show",
};

/** Nothing to show, in the console's flatter voice. */
export function Nothing({ children }: { children: ReactNode }) {
  return <p className="desk-nothing fine faint">{children}</p>;
}
