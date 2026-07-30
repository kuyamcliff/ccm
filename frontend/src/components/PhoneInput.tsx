import { useId } from "react";

interface Props {
  label: string;
  /** The nine local digits, without the country code. */
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
  hint?: string;
  autoComplete?: string;
  id?: string;
}

/** Every number the restaurant deals with is Cameroonian. */
export const DIAL_CODE = "+237";
export const LOCAL_DIGITS = 9;

/** Strips a pasted `+237`/`237`/`00237` prefix and any spacing. */
export function toLocalDigits(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.replace(/^(?:00)?237/, "").slice(0, LOCAL_DIGITS);
}

export function isCompletePhone(local: string): boolean {
  return /^6\d{8}$/.test(local);
}

/** Full international form for submitting to the API. */
export function toInternational(local: string): string {
  return `${DIAL_CODE}${local}`;
}

/**
 * Phone field with the country code pinned in front, so people type only the
 * nine local digits. Pasting a full number still works — the prefix is
 * stripped rather than ending up duplicated as `+237+237...`.
 */
export function PhoneInput({
  label, value, onChange, required, hint, autoComplete = "tel-national", id,
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;

  return (
    <label className="phone-field" htmlFor={inputId}>
      <span className="phone-field-label">{label}</span>
      <span className="prefix-input-wrap">
        <span className="prefix-label" aria-hidden="true">{DIAL_CODE}</span>
        <input
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete={autoComplete}
          required={required}
          value={value}
          maxLength={LOCAL_DIGITS}
          placeholder="6XX XXX XXX"
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(toLocalDigits(e.target.value))}
        />
      </span>
      {hint && <span className="hint" id={hintId}>{hint}</span>}
    </label>
  );
}
