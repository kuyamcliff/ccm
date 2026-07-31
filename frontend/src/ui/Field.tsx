import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Wraps a control with its label, hint and error.
 *
 * The error sits directly under the control it belongs to, is wired up through
 * aria-describedby, and is announced when it appears. Nothing here validates —
 * that stays with the form, which knows what a valid answer looks like.
 */
export function Field({ label, hint, error, required, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

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
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          <Icon name="alert" size={15} />
          {error}
        </span>
      ) : null}
    </div>
  );
}

type BaseProps = { label: string; hint?: string; error?: string | null };

export function TextField({
  label,
  hint,
  error,
  required,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          {...rest}
          id={id}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="input"
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  ...rest
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          {...rest}
          id={id}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="textarea"
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  children,
  ...rest
}: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <select
          {...rest}
          id={id}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="select"
        >
          {children}
        </select>
      )}
    </Field>
  );
}

/**
 * Phone entry for Cameroon.
 *
 * The country code is shown as static text rather than pre-filled into the
 * input, because people type their number the way they say it — starting 6 —
 * and then have to delete a prefix they did not expect.
 */
export function PhoneField({
  label,
  hint,
  error,
  value,
  onChange,
  required,
  name,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  name?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <div className="field__row">
          <span className="phone-prefix mono" aria-hidden="true">
            +237
          </span>
          <input
            id={id}
            name={name}
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="6 70 00 00 00"
            value={value}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </Field>
  );
}

export function Checkbox({
  label,
  ...rest
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span className="check__text">{label}</span>
    </label>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch__track" aria-hidden="true" />
      <span className="check__text">{label}</span>
    </label>
  );
}

/**
 * Stepper for small whole numbers. Typing is still allowed through the hidden
 * live region's sibling input on the booking form; here the buttons carry it,
 * which is faster on a phone than a number keyboard.
 */
export function Counter({
  value,
  min = 1,
  max = 30,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="counter" role="group" aria-label={label}>
      <button
        type="button"
        className="counter__btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`One fewer, ${label}`}
      >
        <Icon name="minus" size={18} />
      </button>
      <output className="counter__value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="counter__btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`One more, ${label}`}
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
