import { useCallback, useRef, useState } from "react";

/**
 * The press response.
 *
 * This is the answer to the loudest complaint about the last version: you tapped
 * something and nothing happened, so you could not tell whether the button was
 * working, dead, or had already fired.
 *
 * ── Why this is a hook and not just `:active` ──────────────────────────────
 *
 * `:active` is what the old version used and it is not enough on a phone:
 *
 *   1. On iOS Safari `:active` does not apply to a plain element at all unless
 *      the document has a touch listener attached, which is a famous piece of
 *      folklore nobody should have to remember per component.
 *   2. It cannot survive the finger sliding a few pixels, which happens
 *      constantly on a bike taxi. The browser cancels the state, the button
 *      snaps back, and it reads as a failed press even though the tap still
 *      lands.
 *   3. It gives no way to hold the pressed look for a minimum time. A tap that
 *      lasts 40ms with a 90ms transition never visibly moves.
 *
 * So the state is ours. `pointerdown` sets it, `pointerup`, `pointercancel` and
 * `pointerleave` release it, and a floor keeps it visible for at least one
 * frame's worth of transition even on the fastest tap.
 *
 * ── What it feels like ─────────────────────────────────────────────────────
 *
 * Down: scale to 0.97 and brighten, in 90ms, on the compositor.
 * Up:   back to rest on the spring curve, which overshoots about 4% and settles.
 *       An eased return reads as software. A spring reads as a physical key.
 *
 * Under `prefers-reduced-motion` the scale token is 1 and the durations are 0,
 * so the control still confirms itself through the brightness change alone.
 */

/** The floor, in milliseconds. One press transition, so the fastest tap on the
    fastest phone still produces a visible movement. */
const MIN_HELD_MS = 90;

export interface PressState {
  /** Spread onto the element. Includes the pointer handlers and `data-pressed`. */
  pressProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
    "data-pressed": "true" | undefined;
  };
  pressed: boolean;
}

export interface PressOptions {
  /** No press response at all. For a control that is disabled or busy: moving
      under a finger that cannot do anything is a lie. */
  disabled?: boolean;
  /**
   * A short haptic tick on the way down.
   *
   * Android honours `navigator.vibrate`; iOS Safari ignores it entirely, and
   * that is fine, because iOS users get the platform's own feel from elsewhere.
   * Cameroon is overwhelmingly Android, so this is worth the two lines. Reserved
   * for primary actions: a page where everything buzzes is a page people turn
   * their phone off for.
   */
  haptic?: boolean;
}

export function usePress({ disabled = false, haptic = false }: PressOptions = {}): PressState {
  const [pressed, setPressed] = useState(false);
  const downAt = useRef(0);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (releaseTimer.current !== null) {
      clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }
    const held = Date.now() - downAt.current;
    if (held >= MIN_HELD_MS) {
      setPressed(false);
      return;
    }
    /* Too fast to have been seen. Hold the rest of the frame out so the press
       is not invisible on a quick tap. */
    releaseTimer.current = setTimeout(() => {
      releaseTimer.current = null;
      setPressed(false);
    }, MIN_HELD_MS - held);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) return;
      /* Only the primary button. A right click or a stylus barrel press should
         not light the control up. */
      if (event.button !== 0 && event.pointerType === "mouse") return;
      downAt.current = Date.now();
      setPressed(true);
      if (haptic && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(8);
        } catch {
          /* Some browsers throw when the page has never been interacted with,
             or when the user has vibration switched off at the OS level. */
        }
      }
    },
    [disabled, haptic]
  );

  return {
    pressed,
    pressProps: {
      onPointerDown,
      onPointerUp: release,
      onPointerCancel: release,
      /*
       * The finger sliding off the control.
       *
       * Releasing here rather than keeping the press means a drag that starts on
       * a button and ends elsewhere lets the button go, which is what every
       * native list does. The click will not fire either, so the visual and the
       * behaviour agree.
       */
      onPointerLeave: release,
      "data-pressed": pressed ? "true" : undefined,
    },
  };
}
