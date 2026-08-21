import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import { usePress } from "./press";

/**
 * Everything you type into.
 *
 * Two rules run through the whole set.
 *
 * **Sixteen pixels, always.** Every text input in this product is 16px, without
 * exception. Anything smaller makes iOS Safari zoom the page the instant the
 * field takes focus, and the layout never comes back: the person is left
 * pinch-zooming around a form. It is the one place the "make it small" rule is
 * overruled, and it is overruled by the platform, not by taste.
 *
 * **The label is always there.** Never a placeholder standing in for a label. A
 * placeholder disappears the moment somebody starts typing, which is exactly
 * when they most need to be reminded what the box is for, and it leaves a filled
 * form with no way to check what each answer belongs to.
 */

interface FieldShellProps {
  label: string;
  /** Under the field, before anything is typed. Explains, never repeats. */
  hint?: string;
  /** Replaces the hint and turns the field red. */
  error?: string | null;
  required?: boolean;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
  className?: string;
}

/** The label, the control, and the one line underneath. Every field is this. */
export function Field({ label, hint, error, required, children, className }: FieldShellProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div className={["field", className].filter(Boolean).join(" ")} data-invalid={error ? "true" : undefined}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, describedBy: note ? noteId : undefined })}
      {note ? (
        <p className="field__note" id={noteId} role={error ? "alert" : undefined}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ── Text ───────────────────────────────────────────────────────────────────*/

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  className?: string;
}

export function TextField({ label, hint, error, icon, className, required, ...rest }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy }) => (
        <div className="field__wrap">
          {icon ? <Icon name={icon} size={17} className="field__icon" /> : null}
          <input
            {...rest}
            id={id}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className="field__input"
          />
        </div>
      )}
    </Field>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "id"> {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
}

export function TextAreaField({ label, hint, error, className, required, rows = 3, ...rest }: TextAreaFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy }) => (
        <textarea
          {...rest}
          id={id}
          rows={rows}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="field__input field__input--area"
        />
      )}
    </Field>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "id"> {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** A real `<select>`, which means the phone's own wheel picker rather than a
    custom dropdown that has to reimplement scrolling, keyboards and focus. */
export function SelectField({ label, hint, error, className, required, children, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy }) => (
        <div className="field__wrap field__wrap--select">
          <select
            {...rest}
            id={id}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className="field__input field__input--select"
          >
            {children}
          </select>
          <Icon name="chevron-down" size={17} className="field__chevron" />
        </div>
      )}
    </Field>
  );
}

/**
 * A Cameroonian phone number.
 *
 * `inputMode="tel"` gets the numeric keypad without `type="tel"`'s habit of
 * accepting anything at all. The country code is shown rather than typed: every
 * number this restaurant deals with is +237, and asking people to type it is
 * asking for the half of them who write 6xxxxxxxx and the half who write
 * 2376xxxxxxxx.
 */
export function PhoneField({
  label,
  hint,
  error,
  value,
  onChange,
  required,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string | null;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "id" | "type">) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy }) => (
        <div className="field__wrap field__wrap--phone">
          <span className="field__prefix" aria-hidden="true">
            +237
          </span>
          <input
            {...rest}
            id={id}
            value={value}
            required={required}
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={12}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className="field__input"
            /* Digits only, in the field itself. Stripping on submit instead
               leaves people looking at a number they typed with spaces and a
               rejection that does not explain itself. */
            onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
          />
        </div>
      )}
    </Field>
  );
}

/* ── Choosing ───────────────────────────────────────────────────────────────*/

export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const press = usePress({ disabled });

  return (
    <label className="check" htmlFor={id} {...press.pressProps}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="check__input"
      />
      <span className="check__box" aria-hidden="true">
        <Icon name="check" size={13} />
      </span>
      <span className="check__text">
        <span>{label}</span>
        {hint ? <span className="fine faint">{hint}</span> : null}
      </span>
    </label>
  );
}

/** An on/off that takes effect immediately. If it needs a Save button, it is a
    checkbox in a form, not a switch. */
export function Switch({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const press = usePress({ disabled });

  return (
    <div className="switch">
      <label className="switch__text" htmlFor={id}>
        <span>{label}</span>
        {hint ? <span className="fine faint">{hint}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="switch__track"
        {...press.pressProps}
      >
        <span className="switch__knob" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * A small number, changed with two thumbs' worth of buttons.
 *
 * Used for quantities and party sizes. Not a number input: on Android a
 * `type="number"` spinner is a pair of arrows about four pixels tall, and on
 * iOS it is nothing at all.
 */
export function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const down = usePress({ disabled: value <= min });
  const up = usePress({ disabled: value >= max });

  return (
    <div className="counter" role="group" aria-label={label}>
      <button
        type="button"
        className="counter__btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`One fewer ${label}`}
        {...down.pressProps}
      >
        <Icon name="minus" size={16} />
      </button>
      <span className="counter__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="counter__btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`One more ${label}`}
        {...up.pressProps}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/**
 * A row of mutually exclusive choices.
 *
 * A segmented control rather than a select when there are two to four options
 * and seeing all of them matters: which wallet, which day, which tab.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: IconName }[];
  label: string;
  className?: string;
}) {
  return (
    <div className={["segmented", className].filter(Boolean).join(" ")} role="tablist" aria-label={label}>
      {options.map((option) => (
        <SegmentedOption
          key={option.value}
          option={option}
          selected={option.value === value}
          onSelect={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}

function SegmentedOption<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: { value: T; label: string; icon?: IconName };
  selected: boolean;
  onSelect: () => void;
}) {
  const press = usePress();

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className="segmented__opt"
      data-on={selected ? "true" : undefined}
      onClick={onSelect}
      {...press.pressProps}
    >
      {option.icon ? <Icon name={option.icon} size={15} /> : null}
      {option.label}
    </button>
  );
}

/* ── Passwords ──────────────────────────────────────────────────────────────*/

/**
 * A password, with a reveal.
 *
 * The reveal is not a nicety on a phone: a long password typed on a soft
 * keyboard with no way to check it is a password typed wrong, and the person
 * finds out only after a failed sign in that also cost them a rate limit slot.
 */
export function PasswordField({
  label,
  hint,
  error,
  value,
  onChange,
  autoComplete = "current-password",
  required,
  strength,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  /** The meter, for the two screens where a password is being chosen rather
      than recalled. Comes from `lib/passwordStrength`. */
  strength?: { score: number; label: string; problems: string[] } | null;
}) {
  const [shown, setShown] = useState(false);
  const toggle = usePress();

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy }) => (
        <>
          <div className="field__wrap">
            <input
              id={id}
              type={shown ? "text" : "password"}
              value={value}
              required={required}
              autoComplete={autoComplete}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              className="field__input"
              onChange={(event) => onChange(event.target.value)}
            />
            <button
              type="button"
              className="field__reveal"
              onClick={() => setShown((current) => !current)}
              aria-label={shown ? "Hide password" : "Show password"}
              aria-pressed={shown}
              {...toggle.pressProps}
            >
              <Icon name={shown ? "eye-off" : "eye"} size={17} />
            </button>
          </div>

          {strength && value ? (
            <div className="strength" data-score={strength.score}>
              <span className="strength__bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${Math.max(0.05, strength.score / 4)})` }} />
              </span>
              <span className="fine strength__label">{strength.label}</span>
              {strength.problems.length > 0 ? (
                <ul className="fine faint strength__problems">
                  {strength.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Field>
  );
}
