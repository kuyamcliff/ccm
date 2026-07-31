import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Prices. Always tabular, always with the unit, never rounded away. */
export function Money({ value, unit = "FCFA", className }: { value: number; unit?: string; className?: string }) {
  return (
    <span className={["money", className].filter(Boolean).join(" ")}>
      {value.toLocaleString("en-US")}
      <span className="money__unit">{unit}</span>
    </span>
  );
}

type BadgeTone = "neutral" | "good" | "warn" | "bad" | "hot";

export function Badge({ tone = "neutral", dot = true, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return <span className={`badge${tone === "neutral" ? "" : ` badge--${tone}`}${dot ? "" : " badge--plain"}`}>{children}</span>;
}

/**
 * Star rating.
 *
 * Read-only by default. The numeric value is always rendered beside it for
 * anyone who cannot count gold shapes at a glance.
 */
export function Stars({ value, size = 16, showValue = true }: { value: number; size?: number; showValue?: boolean }) {
  const rounded = Math.round(value);
  return (
    <span className="row" style={{ gap: "0.5rem" }}>
      <span className="stars" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} style={{ color: n <= rounded ? "var(--gold)" : "var(--coal-700)" }}>
            <Icon name="star" size={size} />
          </span>
        ))}
      </span>
      {showValue ? <span className="fine mono muted">{value.toFixed(1)}</span> : null}
    </span>
  );
}

export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="stars stars--input" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          className="stars__btn"
          data-on={n <= value}
          onClick={() => onChange(n)}
        >
          <Icon name="star" size={26} />
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__opt"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Initials in a circle. No generated cartoon faces, no gravatar lookups. */
export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "?";
  return (
    <span className={`avatar${large ? " avatar--lg" : ""}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="meter__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
