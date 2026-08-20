import { api } from "~/lib/api";
import type { TranslationEntry } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { EmptyState, ErrorState, SkeletonCards } from "~/ui/Feedback";
import { DeskPage } from "./parts";

/**
 * What the site still says in English when a customer has asked for French.
 *
 * Only the wording the owner types themselves. The application's own strings
 * are held level by the compiler and a test, so listing them here would pad
 * the number with work nobody on this screen can do — and a report that mixes
 * "you need to write this" with "a developer needs to write this" gets
 * ignored, which is worse than not having one.
 */

const STATUS: Record<TranslationEntry["status"], { label: string; tone: string }> = {
  missing: { label: "Nothing in French", tone: "bad" },
  copied: { label: "Still the English", tone: "warn" },
  done: { label: "Translated", tone: "good" },
};

export function Translations() {
  const report = useResource(() => api.desk.translations(), []);

  if (report.loading) return <DeskPage title="Translations"><SkeletonCards count={3} height="5rem" /></DeskPage>;
  if (report.error) {
    return (
      <DeskPage title="Translations">
        <ErrorState error={report.error} onRetry={report.reload} />
      </DeskPage>
    );
  }

  const data = report.data ?? { total: 0, done: 0, outstanding: [] };
  /* Whole numbers only, and never 100 while anything is outstanding: rounding
     99.6 up to 100 with two things still to write is how a report stops being
     believed. */
  const percent = data.total === 0 ? 100 : Math.floor((data.done / data.total) * 100);

  return (
    <DeskPage
      title="Translations"
      lead="Everything you have written that a customer reading in French would otherwise see in English."
      actions={<Button tone="ghost" icon="refresh" onClick={report.reload}>Check again</Button>}
    >
      <section className="card stack">
        <div className="row row--between row--wrap">
          <div>
            <p className="label">French coverage</p>
            <p className="display display--lg">{percent}%</p>
          </div>
          <p className="fine muted">
            {data.done} of {data.total} {data.total === 1 ? "piece" : "pieces"} of your own wording
          </p>
        </div>
        <div
          className="translation-bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="French coverage"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </section>

      {data.outstanding.length === 0 ? (
        <EmptyState icon="check-circle" title="Nothing waiting">
          {data.total === 0
            ? "You have not written any customer-facing messages yet. When you do, anything missing its French will show up here."
            : "Everything you have written says something in French."}
        </EmptyState>
      ) : (
        <div className="stack">
          {data.outstanding.map((entry) => {
            const status = STATUS[entry.status];
            return (
              <article key={entry.id} className="card stack stack--tight">
                <div className="row row--between row--wrap">
                  <strong>{entry.label}</strong>
                  <span className={`badge badge--${status.tone}`}>{status.label}</span>
                </div>
                {/* The English itself, so they can translate it from here
                    rather than going to look for what it was they wrote. */}
                <p className="fine translation-entry__english">“{entry.english}”</p>
                <p className="fine faint row" style={{ gap: "var(--s-2)" }}>
                  <Icon name="arrow-right" size={14} />
                  Change it on {entry.where}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </DeskPage>
  );
}
