import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { usePress } from "./press";
import { money } from "~/lib/format";

/**
 * The small pieces. A price, a status word, a rating, a code.
 *
 * Each of these exists because the thing it draws appears on five or six screens
 * and got drawn slightly differently on each of them last time round.
 */

/**
 * A price.
 *
 * Always with FCFA, always in tabular figures, and the unit always smaller than
 * the number: what somebody reads is "2,500", and the currency is there to say
 * which 2,500 it is, not to compete with it.
 */
export function Money({ value, size = "body" }: { value: number; size?: "body" | "big" | "fine" }) {
  return (
    <span className={`money money--${size}`}>
      {money(value)}
      <span className="money__unit"> FCFA</span>
    </span>
  );
}

/**
 * A status word.
 *
 * Never colour on its own: every tone here pairs with a word, and the word is
 * the thing that carries the meaning. Somebody who cannot tell the green from
 * the red still reads "Ready".
 */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "hot";
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/**
 * A rating, as five stars.
 *
 * The number is given in text as well, because five glyphs at 14px is not a
 * reliable way to communicate "3.5" on a phone in daylight.
 */
export function Stars({
  value,
  size = 15,
  showValue = true,
}: {
  value: number;
  size?: number;
  showValue?: boolean;
}) {
  const rounded = Math.round(value * 2) / 2;

  return (
    <span className="stars" role="img" aria-label={`${rounded} out of 5`}>
      {[1, 2, 3, 4, 5].map((position) => {
        const fill = fillFor(rounded, position);
        return (
          <span key={position} className="stars__slot" data-fill={fill}>
            <Icon name="star" size={size} />
            {/* A half is a full star laid over the empty one and clipped down
                the middle, rather than a second glyph that would have to be kept
                optically aligned with the first. */}
            {fill === "half" ? (
              <span className="stars__half" aria-hidden="true">
                <Icon name="star" size={size} />
              </span>
            ) : null}
          </span>
        );
      })}
      {showValue ? <span className="fine muted stars__value">{rounded.toFixed(1)}</span> : null}
    </span>
  );
}

function fillFor(value: number, position: number): "full" | "half" | "none" {
  if (value >= position) return "full";
  if (value >= position - 0.5) return "half";
  return "none";
}

/** Picking a rating. Separate from `Stars` because a control and a readout have
    different jobs, and one component doing both is how a display becomes
    accidentally clickable. */
export function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="star-pick" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((position) => (
        <StarPickerButton key={position} position={position} value={value} onChange={onChange} />
      ))}
    </div>
  );
}

function StarPickerButton({
  position,
  value,
  onChange,
}: {
  position: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const press = usePress({ haptic: true });

  return (
    <button
      type="button"
      role="radio"
      aria-checked={value === position}
      aria-label={`${position} ${position === 1 ? "star" : "stars"}`}
      className="star-pick__btn"
      data-on={position <= value ? "true" : undefined}
      onClick={() => onChange(position)}
      {...press.pressProps}
    >
      <Icon name="star" size={26} />
    </button>
  );
}

/**
 * A booking or order code.
 *
 * Set in the display face at a size somebody can read out over a bad phone line
 * while standing next to a grill, with the characters spaced so O and 0 cannot
 * be confused at a glance.
 */
export function Code({ value, size = "md" }: { value: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`code code--${size}`} translate="no">
      {value}
    </span>
  );
}

/** A person, as initials. No uploaded avatars anywhere in this product, so this
    is the whole implementation rather than a fallback. */
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

/**
 * A proportion, drawn as a bar.
 *
 * Used for loyalty progress and for the console's capacity readouts. The number
 * is always beside it: a bar on its own tells you a ratio and not a quantity,
 * and "how many points do I actually have" is the question being asked.
 */
export function Meter({
  value,
  max,
  label,
  tone = "hot",
}: {
  value: number;
  max: number;
  label?: string;
  tone?: "hot" | "good" | "neutral";
}) {
  const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));

  return (
    <span className="meter" data-tone={tone}>
      <span
        className="meter__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <span className="meter__fill" style={{ transform: `scaleX(${fraction})` }} />
      </span>
    </span>
  );
}

/**
 * A label above a value, which is most of what the console is made of.
 *
 * The value comes first in the source order and is flipped visually, so a screen
 * reader reads "2,500 FCFA, taken tonight" rather than making somebody hold a
 * label in their head while waiting for its number.
 */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="label">{label}</span>
      {note ? <span className="fine faint">{note}</span> : null}
    </div>
  );
}

/** A dot that says something is live. Paired with a word, never alone. */
export function Pulse({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="pulse" data-on={on ? "true" : undefined}>
      <span className="pulse__dot" aria-hidden="true" />
      <span className="fine">{label}</span>
    </span>
  );
}
