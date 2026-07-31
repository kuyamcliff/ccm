import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

type Tone = "default" | "primary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

function classes(tone: Tone, size: Size, block?: boolean, extra?: string) {
  return [
    "btn",
    tone !== "default" && `btn--${tone}`,
    size !== "md" && `btn--${size}`,
    block && "btn--block",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

interface CommonProps {
  tone?: Tone;
  size?: Size;
  block?: boolean;
  icon?: IconName;
  /** Puts the icon after the label — for "next" and "open" style actions. */
  iconEnd?: IconName;
  className?: string;
  children?: ReactNode;
}

interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /**
   * Shows a spinner and blocks further presses. Always drive this from the
   * request's own state — a double-tapped booking is a real booking twice.
   */
  busy?: boolean;
}

export function Button({
  tone = "default",
  size = "md",
  block,
  icon,
  iconEnd,
  busy,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classes(tone, size, block, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconEnd && !busy ? <Icon name={iconEnd} size={18} /> : null}
    </button>
  );
}

interface LinkButtonProps extends CommonProps {
  to: string;
  state?: unknown;
  ariaLabel?: string;
}

/** A link that looks like a button. Still a link: it navigates, and it can be
    opened in a new tab, which a button cannot. */
export function LinkButton({
  to,
  state,
  tone = "default",
  size = "md",
  block,
  icon,
  iconEnd,
  className,
  ariaLabel,
  children,
}: LinkButtonProps) {
  return (
    <Link to={to} state={state} className={classes(tone, size, block, className)} aria-label={ariaLabel}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
    </Link>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  name: IconName;
  /** Required: an icon alone tells a screen reader nothing. */
  label: string;
  tone?: Tone;
  size?: Size;
  className?: string;
}

export function IconButton({ name, label, tone = "quiet", size = "md", className, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      className={[classes(tone, size), "btn--icon", className].filter(Boolean).join(" ")}
    >
      <Icon name={name} size={size === "sm" ? 16 : 20} />
    </button>
  );
}
