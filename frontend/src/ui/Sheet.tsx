import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./Button";

/**
 * One overlay for the whole product: a sheet on a phone, a dialog on a wider
 * screen. The difference is entirely in CSS.
 *
 * It traps focus, restores it on close, closes on Escape and on a press
 * outside, and stops the page behind from scrolling. Anything that needs a
 * decision from the visitor goes through here.
 */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Blocks dismissal while something irreversible is in flight. */
  busy?: boolean;
}

export function Sheet({ open, onClose, title, description, children, footer, busy }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* Focus the panel itself rather than the first control: on a form-heavy
       sheet, focusing the first input pops the keyboard open on a phone before
       the visitor has read the question. */
    panel.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;

      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose, busy]);

  if (!open) return null;

  return createPortal(
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
      >
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <div className="stack stack--tight">
            <h2 className="display display--md">{title}</h2>
            {description ? <p className="fine muted">{description}</p> : null}
          </div>
          <IconButton name="close" label="Close" onClick={onClose} disabled={busy} />
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Confirmation as a promise.
 *
 *   if (!(await confirm({ title: "Cancel this booking?", ... }))) return;
 *
 * Every destructive action in the product goes through this, so none of them
 * can happen on a single mis-tap.
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(
    (options: { title: string; body: ReactNode; confirmLabel?: string; destructive?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setState({
          title: options.title,
          body: options.body,
          confirmLabel: options.confirmLabel ?? "Confirm",
          destructive: options.destructive ?? true,
          resolve,
        });
      }),
    []
  );

  const settle = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
    setBusy(false);
  };

  const element = state ? (
    <Sheet
      open
      busy={busy}
      onClose={() => settle(false)}
      title={state.title}
      footer={
        <>
          <Button tone="ghost" onClick={() => settle(false)}>
            Keep it
          </Button>
          <Button
            tone={state.destructive ? "danger" : "primary"}
            busy={busy}
            onClick={() => {
              setBusy(true);
              settle(true);
            }}
          >
            {state.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted">{state.body}</p>
    </Sheet>
  ) : null;

  return { confirm, confirmElement: element };
}
