import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { usePress } from "./press";

/**
 * Everything you press.
 *
 * Two things here are deliberate and both come straight out of what was wrong
 * with the last version.
 *
 * ── 1. A pending state you cannot forget ───────────────────────────────────
 *
 * `Action` takes `pending` as a **required** prop. Not optional, not defaulted.
 * The old `Button` had `busy?: boolean` and most screens simply never passed it,
 * so a sign-in button sat there looking untouched for the whole round trip and
 * people pressed it again. Making it required means a submit that forgets its
 * pending state does not compile.
 *
 * Pair it with `useMutation` from `lib/store` and the wiring is one line:
 *
 *     const signIn = useMutation(() => api.me.signIn(email, password));
 *     <Action pending={signIn.pending} pendingLabel={c.pending.signingIn}
 *             onClick={() => signIn.run()}>{c.auth.signIn}</Action>
 *
 * ── 2. A width that does not jump ──────────────────────────────────────────
 *
 * "Sign in" is 7 characters and "Signing you in" is 14. Swapping the text would
 * resize the button mid-press, which looks broken and reflows whatever is beside
 * it. So both labels are rendered into the same CSS grid cell: the button is as
 * wide as the longer of the two from the very first frame, and the swap is pure
 * opacity. Nothing moves.
 */

type Tone = "primary" | "default" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

function classes(tone: Tone, size: Size, block?: boolean, extra?: string) {
  return ["btn", `btn--${tone}`, size !== "md" && `btn--${size}`, block && "btn--block", extra]
    .filter(Boolean)
    .join(" ");
}

interface Shared {
  tone?: Tone;
  size?: Size;
  /** Full width. The default on a phone for anything that submits a form. */
  block?: boolean;
  icon?: IconName;
  /** Puts the icon after the label, for "next" and "open" style actions. */
  iconEnd?: IconName;
  className?: string;
  children?: ReactNode;
}

/** The spinner. A ring rather than a row of dots: it reads as "working" at 14px,
    where dots read as an ellipsis. */
function Spinner() {
  return <span className="btn__spin" aria-hidden="true" />;
}

/**
 * The two labels, stacked in one grid cell.
 *
 * `aria-live` is deliberately absent: the button's own `aria-busy` already tells
 * a screen reader what is happening, and announcing the label twice is noise.
 */
function Labels({
  children,
  icon,
  iconEnd,
  pending,
  pendingLabel,
}: {
  children: ReactNode;
  icon?: IconName;
  iconEnd?: IconName;
  pending?: boolean;
  pendingLabel?: string;
}) {
  /* No pending label given, so there is nothing to reserve room for and the
     button renders its one label straight. */
  if (!pendingLabel) {
    return (
      <>
        {pending ? <Spinner /> : icon ? <Icon name={icon} size={17} /> : null}
        {children}
        {iconEnd && !pending ? <Icon name={iconEnd} size={17} /> : null}
      </>
    );
  }

  return (
    <span className="btn__swap" data-pending={pending ? "true" : undefined}>
      <span className="btn__face btn__face--rest" aria-hidden={pending ? true : undefined}>
        {icon ? <Icon name={icon} size={17} /> : null}
        {children}
        {iconEnd ? <Icon name={iconEnd} size={17} /> : null}
      </span>
      <span className="btn__face btn__face--busy" aria-hidden={pending ? undefined : true}>
        <Spinner />
        {pendingLabel}
      </span>
    </span>
  );
}

/* ── Button ─────────────────────────────────────────────────────────────────*/

interface ButtonProps extends Shared, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** Haptic tick on press. On by default for `primary`, since that is the one
      action a screen is actually asking for. */
  haptic?: boolean;
}

/** A button that does not fire a request. Navigation inside a page, opening a
    sheet, switching a tab. If it fires a request, use `Action`. */
export function Button({
  tone = "default",
  size = "md",
  block,
  icon,
  iconEnd,
  className,
  children,
  disabled,
  haptic,
  type = "button",
  ...rest
}: ButtonProps) {
  const press = usePress({ disabled, haptic: haptic ?? tone === "primary" });

  return (
    <button
      {...rest}
      {...press.pressProps}
      type={type}
      className={classes(tone, size, block, className)}
      disabled={disabled}
    >
      <Labels icon={icon} iconEnd={iconEnd}>
        {children}
      </Labels>
    </button>
  );
}

/* ── Action ─────────────────────────────────────────────────────────────────*/

interface ActionProps extends Shared, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /**
   * Whether the request is in flight. Required, on purpose. Drive it from
   * `useMutation(...).pending` and never from a local boolean you set by hand.
   */
  pending: boolean;
  /**
   * What the button says while it runs. Present continuous, from `copy.pending`:
   * "Signing you in", not "Signing in..." and never "Loading".
   *
   * Optional only because a few icon-only actions have no room for one. Any
   * button with a text label should have it.
   */
  pendingLabel?: string;
  haptic?: boolean;
}

/**
 * A button that fires a request.
 *
 * Blocks further presses while it runs, which is belt and braces with the
 * in-flight guard inside `useMutation`: a double-tapped booking is a real
 * booking twice, and that is worth guarding in both places.
 */
export function Action({
  tone = "primary",
  size = "md",
  block,
  icon,
  iconEnd,
  className,
  children,
  disabled,
  pending,
  pendingLabel,
  haptic,
  type = "button",
  ...rest
}: ActionProps) {
  const blocked = disabled || pending;
  const press = usePress({ disabled: blocked, haptic: haptic ?? tone === "primary" });

  return (
    <button
      {...rest}
      {...press.pressProps}
      type={type}
      className={classes(tone, size, block, className)}
      disabled={blocked}
      aria-busy={pending || undefined}
      /* Keeps the control focusable and announced while it works. A disabled
         button drops out of the accessibility tree entirely, which loses a
         screen reader user the "busy" they were just told about. */
      aria-disabled={blocked || undefined}
    >
      <Labels icon={icon} iconEnd={iconEnd} pending={pending} pendingLabel={pendingLabel}>
        {children}
      </Labels>
    </button>
  );
}

/* ── Links that look like buttons ───────────────────────────────────────────*/

interface LinkButtonProps extends Shared {
  to: string;
  state?: unknown;
  replace?: boolean;
  ariaLabel?: string;
  /** Warms the next screen's data on touchdown. See `lib/store.prefetch`. */
  onPrefetch?: () => void;
}

/**
 * A link wearing a button.
 *
 * Still a link: it navigates, it can be opened in a new tab, and the browser
 * shows its destination. `viewTransition` is on for every one of these, so a
 * navigation animates rather than cutting.
 */
export function LinkButton({
  to,
  state,
  replace,
  tone = "default",
  size = "md",
  block,
  icon,
  iconEnd,
  className,
  ariaLabel,
  children,
  onPrefetch,
}: LinkButtonProps) {
  const press = usePress({ haptic: tone === "primary" });

  return (
    <Link
      to={to}
      state={state}
      replace={replace}
      viewTransition
      className={classes(tone, size, block, className)}
      aria-label={ariaLabel}
      onPointerEnter={onPrefetch}
      onTouchStart={onPrefetch}
      {...press.pressProps}
    >
      {icon ? <Icon name={icon} size={17} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={17} /> : null}
    </Link>
  );
}

interface AnchorButtonProps extends Shared {
  href: string;
  ariaLabel?: string;
  newTab?: boolean;
}

/**
 * A real anchor wearing a button, for an address the router must not intercept:
 * a file served by the API, a phone number, a map.
 *
 * Deliberately without a `download` attribute. The server already says what the
 * file is and what to call it, and letting the phone hand it to its own handler
 * is the whole point for something like a calendar entry. Forcing a download
 * leaves the guest with a file in Downloads and no idea what to do with it.
 */
export function AnchorButton({
  href,
  tone = "default",
  size = "md",
  block,
  icon,
  iconEnd,
  className,
  ariaLabel,
  children,
  newTab,
}: AnchorButtonProps) {
  const press = usePress({ haptic: tone === "primary" });

  return (
    <a
      href={href}
      className={classes(tone, size, block, className)}
      aria-label={ariaLabel}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer noopener" : undefined}
      {...press.pressProps}
    >
      {icon ? <Icon name={icon} size={17} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={17} /> : null}
    </a>
  );
}

/* ── Icon only ──────────────────────────────────────────────────────────────*/

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  name: IconName;
  /** Required: an icon on its own tells a screen reader nothing. */
  label: string;
  tone?: Tone;
  size?: Size;
  className?: string;
  /** Shows a spinner in place of the icon. */
  pending?: boolean;
}

export function IconButton({
  name,
  label,
  tone = "quiet",
  size = "md",
  className,
  pending,
  disabled,
  ...rest
}: IconButtonProps) {
  const blocked = disabled || pending;
  const press = usePress({ disabled: blocked });

  return (
    <button
      {...rest}
      {...press.pressProps}
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      disabled={blocked}
      className={[classes(tone, size), "btn--icon", className].filter(Boolean).join(" ")}
    >
      {pending ? <Spinner /> : <Icon name={name} size={size === "sm" ? 16 : 19} />}
    </button>
  );
}

/**
 * A whole row that behaves like a button.
 *
 * The layout language here is rows rather than cards, so most tappable things
 * are a row of content and not a control shape. This gives one of those the same
 * press response as a real button without dressing it up as one.
 */
export function PressableRow({
  children,
  className,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
  ariaLabel?: string;
}) {
  const press = usePress();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={["pressable", className].filter(Boolean).join(" ")}
      {...press.pressProps}
    >
      {children}
    </button>
  );
}

/** The same, as a link. Keeps the row navigable and openable in a new tab. */
export function PressableLink({
  to,
  children,
  className,
  ariaLabel,
  onPrefetch,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onPrefetch?: () => void;
}) {
  const press = usePress();

  return (
    <Link
      to={to}
      viewTransition
      aria-label={ariaLabel}
      className={["pressable", className].filter(Boolean).join(" ")}
      onPointerEnter={onPrefetch}
      onTouchStart={onPrefetch}
      {...press.pressProps}
    >
      {children}
    </Link>
  );
}
