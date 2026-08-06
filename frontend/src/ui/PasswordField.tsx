import { useId } from "react";
import { Icon } from "./Icon";
import { MIN_PASSWORD, checkPassword, passwordScore } from "~/lib/passwordStrength";
import type { PasswordIdentity } from "~/lib/passwordStrength";

/**
 * A password box that says what is wrong while it is being typed.
 *
 * Somebody choosing a password is trying to get past a form, so the moment to
 * say "that one is guessed first" is now, not after the round trip that comes
 * with pressing the button. The bar is the encouragement and the sentence
 * under it is the actual instruction; a bar on its own tells nobody what to
 * change.
 *
 * Nothing here is security. The rules are mirrored from the server, which
 * checks them again and is the only thing that decides.
 */

const WORDS = ["", "", "Fine", "Good", "Strong"] as const;
const TONES = ["", "bad", "warn", "good", "good"] as const;

export function PasswordField({
  label = "Password",
  value,
  onChange,
  identity,
  autoComplete = "new-password",
  required,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  /** The name and email already on the form, so a password built out of either
   *  is caught here rather than by the server a moment later. */
  identity?: PasswordIdentity;
  autoComplete?: string;
  required?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const meterId = `${id}-meter`;

  const score = passwordScore(value, identity ?? {});

  /* Judged only once it is long enough to judge. Complaining at three
     characters is complaining about a password nobody has finished writing,
     and the minimum is already sitting in the hint above. */
  const short = value.length > 0 && value.length < MIN_PASSWORD;
  const problem = value.length >= MIN_PASSWORD ? checkPassword(value, identity ?? {}) : null;

  const remaining = MIN_PASSWORD - value.length;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__req" aria-hidden="true">
            required
          </span>
        ) : null}
      </label>
      <span className="field__hint" id={hintId}>
        At least {MIN_PASSWORD} characters. Longer beats complicated.
      </span>
      <input
        id={id}
        type="password"
        className="input"
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={`${hintId} ${meterId}`}
        aria-invalid={problem !== null || undefined}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="pwmeter" id={meterId}>
        <div className="pwmeter__track" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={`pwmeter__step${score >= step ? ` pwmeter__step--${TONES[score]}` : ""}`}
            />
          ))}
        </div>
        {/* One live region for every reading, so a screen reader hears the
            verdict settle rather than a new announcement per keystroke. */}
        <p className="pwmeter__say" aria-live="polite">
          {problem ? (
            <span className="pwmeter__problem">
              <Icon name="alert" size={15} />
              {problem}
            </span>
          ) : short ? (
            <span className="pwmeter__word">
              {remaining} more character{remaining === 1 ? "" : "s"}
            </span>
          ) : score >= 2 ? (
            <span className={`pwmeter__word pwmeter__word--${TONES[score]}`}>{WORDS[score]}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
