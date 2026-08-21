import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, IconButton } from "./Button";
import { usePrefersReducedMotion } from "./motion";

/**
 * The bottom sheet.
 *
 * Everything modal in this product is one of these. On a phone a centred dialog
 * is a shape from a desktop: it arrives from nowhere, its close button is at the
 * top where the thumb is not, and it cannot be dismissed the way every other
 * layer on the device is dismissed.
 *
 * So this comes up from the bottom, its actions are at the bottom, and **you can
 * throw it away with your thumb**. That last part is what makes it feel like
 * part of the phone rather than part of a web page, and it is the single
 * fiddliest piece of motion in the codebase, so it is worth explaining.
 *
 * ── The drag ───────────────────────────────────────────────────────────────
 *
 * While the finger is down the panel follows it one to one. Dragging *up* is
 * resisted rather than blocked, on a curve, so the sheet feels attached to
 * something instead of hitting a wall: this is the rubber band every native list
 * has at the top of its scroll.
 *
 * On release the decision is velocity first, distance second. A short, fast
 * flick dismisses; a long, slow drag that stops halfway springs back. Deciding
 * on distance alone is what makes a sheet feel sticky, because a confident flick
 * that only travelled 80px gets snapped back in your face.
 *
 * While the panel is being dragged its transition is switched off, or every
 * pointer move would be fighting a 280ms ease and the sheet would lag behind the
 * thumb.
 */

/** Past this, let go and it goes. A quarter of the panel. */
const DISMISS_FRACTION = 0.25;
/** Or past this, in pixels per millisecond, however far it got. */
const DISMISS_VELOCITY = 0.55;

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Hides the title visually but keeps it for screen readers, for a sheet whose
      content is its own heading. */
  hideTitle?: boolean;
  children: ReactNode;
  /** Pinned to the bottom, outside the scrolling area, where the thumb is. */
  footer?: ReactNode;
  /** Refuses the drag and the backdrop tap. For a sheet in the middle of taking
      a payment, where dismissing loses something real. */
  sticky?: boolean;
}

export function Sheet({ open, onClose, title, hideTitle, children, footer, sticky }: SheetProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const reduced = usePrefersReducedMotion();

  /* Drag state lives in refs, not state: a pointermove that triggered a React
     render would be a render per frame of the drag. Only the transform is
     written, straight to the node. */
  const dragging = useRef(false);
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastAt = useRef(0);
  const velocity = useRef(0);
  const offset = useRef(0);

  const [shown, setShown] = useState(false);

  /* Kept out of the DOM entirely while closed, but only after the leaving
     animation has run, so the sheet does not vanish mid-slide. */
  useEffect(() => {
    if (open) {
      setShown(true);
      return;
    }
    if (reduced) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(false), 280);
    return () => clearTimeout(timer);
  }, [open, reduced]);

  /* Escape, and the scroll lock. The lock records the scroll position and puts
     it back, because `overflow: hidden` on the body otherwise sends the page to
     the top the moment a sheet opens over something halfway down. */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sticky) onClose();
    };
    document.addEventListener("keydown", onKey);

    const scrollY = window.scrollY;
    const body = document.body;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose, sticky]);

  /* Focus moves into the sheet on open and back out on close. Without this a
     keyboard or screen reader lands behind the panel, on the page it covers. */
  useEffect(() => {
    if (!open || !panel.current) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const focusable = panel.current.querySelector<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    (focusable ?? panel.current).focus({ preventScroll: true });
    return () => returnTo?.focus?.({ preventScroll: true });
  }, [open]);

  const applyOffset = useCallback((value: number) => {
    offset.current = value;
    const node = panel.current;
    if (!node) return;
    node.style.transform = value === 0 ? "" : `translate3d(0, ${value}px, 0)`;
  }, []);

  const endDrag = useCallback(
    (release: boolean) => {
      const node = panel.current;
      dragging.current = false;
      if (node) node.dataset.dragging = "";

      const height = node?.offsetHeight ?? 1;
      const farEnough = offset.current > height * DISMISS_FRACTION;
      const fastEnough = velocity.current > DISMISS_VELOCITY;

      if (release && (farEnough || fastEnough)) {
        applyOffset(0);
        onClose();
        return;
      }
      applyOffset(0);
    },
    [applyOffset, onClose]
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (sticky) return;
    /* Only a touch or a pen drags. A mouse has a scroll wheel and a close
       button, and mouse-dragging a sheet is not a gesture anybody performs. */
    if (event.pointerType === "mouse") return;
    dragging.current = true;
    startY.current = event.clientY;
    lastY.current = event.clientY;
    lastAt.current = event.timeStamp;
    velocity.current = 0;
    if (panel.current) panel.current.dataset.dragging = "true";
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging.current) return;
    const dy = event.clientY - startY.current;

    const elapsed = event.timeStamp - lastAt.current;
    if (elapsed > 0) {
      /* Smoothed, so one jittery frame near the end of a drag cannot read as a
         flick. Weighted towards the most recent sample, which is the one that
         describes what the thumb is doing right now. */
      const instant = (event.clientY - lastY.current) / elapsed;
      velocity.current = velocity.current * 0.3 + instant * 0.7;
    }
    lastY.current = event.clientY;
    lastAt.current = event.timeStamp;

    if (dy >= 0) {
      applyOffset(dy);
      return;
    }
    /* Upward: resisted on a curve rather than stopped dead. The sheet gives a
       little and refuses to give more, the way a native list does. */
    applyOffset(-Math.sqrt(-dy) * 3);
  };

  if (!shown) return null;

  return (
    <div className="sheet" data-open={open ? "true" : undefined} role="presentation">
      <div
        className="sheet__scrim"
        onClick={sticky ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
      >
        <div className="sheet__grip" onPointerDown={onPointerDown}>
          {/* The handle. Not a control: it is the affordance that says the panel
              moves, and the whole header area is the drag target. */}
          <span className="sheet__handle" aria-hidden="true" />
        </div>

        <div className="sheet__head" onPointerDown={onPointerDown}>
          <h2 id={titleId} className={hideTitle ? "sr-only" : "title"}>
            {title}
          </h2>
          {sticky ? null : <IconButton name="close" label="Close" onClick={onClose} size="sm" className="push" />}
        </div>

        <div className="sheet__body" data-scroller="">
          {children}
        </div>

        {footer ? <div className="sheet__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ── Confirming ─────────────────────────────────────────────────────────────*/

interface ConfirmRequest {
  title: string;
  body?: string;
  /** The word on the button that does the thing. Never "OK": a button should
      say what it does, so somebody skimming can tell the difference between
      "Cancel this booking" and the button that closes the sheet. */
  confirmLabel: string;
  /** The word that backs out. Defaults to "Keep it", which suits the cancel-a-
      booking case this is mostly used for. */
  cancelLabel?: string;
  tone?: "primary" | "danger";
  resolve: (answer: boolean) => void;
}

/**
 * A confirmation, as a promise.
 *
 *     const confirm = useConfirm();
 *     if (!(await confirm({ title: "Cancel this table?", confirmLabel: "Cancel it" }))) return;
 *
 * Returned as a hook plus an element the caller renders, rather than as a global
 * provider, because a confirmation belongs to the screen that asked for it and
 * should disappear with it.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback(
    (options: Omit<ConfirmRequest, "resolve">) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      }),
    []
  );

  const answer = useCallback(
    (value: boolean) => {
      setRequest((current) => {
        current?.resolve(value);
        return null;
      });
    },
    []
  );

  const element = request ? (
    <Sheet open onClose={() => answer(false)} title={request.title}>
      <div className="stack">
        {request.body ? <p className="lead">{request.body}</p> : null}
        <div className="bar bar--tight">
          {/* The safe answer is on the left, where a thumb reaching across is
              least likely to land. */}
          <Button tone="quiet" block onClick={() => answer(false)}>
            {request.cancelLabel ?? "Keep it"}
          </Button>
          <Button tone={request.tone ?? "danger"} block onClick={() => answer(true)}>
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  ) : null;

  return { confirm, element };
}
