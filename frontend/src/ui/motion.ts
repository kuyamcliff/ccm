import { useEffect, useRef, useState } from "react";

/**
 * The bits of motion that need JavaScript.
 *
 * Almost everything in this product animates in CSS, where it belongs. What is
 * left here is the handful of things CSS cannot know: whether the person has
 * asked for less movement, whether the tab is even visible, and whether the
 * browser can do a view transition.
 */

/**
 * Whether this person has asked their phone for less movement.
 *
 * The CSS tokens already collapse every duration to zero under the same query,
 * so most components need nothing. This is for the ones that must not merely
 * animate faster but must not run at all: the hero rotation, the Ken Burns
 * drift, the scroll reveals.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Whether the tab is on screen.
 *
 * Anything that costs a frame stops when it is not. A hero quietly crossfading
 * photographs in a background tab is a phone getting warm in somebody's pocket
 * for no reason at all.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

/**
 * The scroll entrance.
 *
 * One observer per element, disconnected the instant it fires, because a
 * long page with a live observer per section is a scroll that stutters. The
 * element is revealed immediately and unconditionally when the person has asked
 * for less movement: content that only appears if you animate it is content some
 * people never see.
 */
export function useReveal<T extends HTMLElement>(): { ref: (node: T | null) => void; shown: boolean } {
  const [shown, setShown] = useState(false);
  const reduced = usePrefersReducedMotion();
  const observed = useRef<T | null>(null);

  const ref = (node: T | null) => {
    if (node === observed.current) return;
    observed.current = node;
    if (!node || shown) return;

    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShown(true);
        observer.disconnect();
      },
      /* A little before it arrives, so the entrance is finishing as the section
         reaches a comfortable reading position rather than starting there. */
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 }
    );

    observer.observe(node);
  };

  return { ref, shown };
}

/**
 * Names an element for a view transition.
 *
 * `view-transition-name` has to be unique across the whole document at the
 * moment a transition starts, or the browser refuses the entire transition and
 * everything cuts instead. So the name carries the record's id, and callers use
 * this helper rather than typing the string, which is how two rows end up
 * sharing a name and silently killing every animation on the page.
 */
export function transitionName(kind: string, id: string | number): { viewTransitionName: string } {
  return { viewTransitionName: `${kind}-${id}` };
}

/** Whether this browser can do same-document view transitions at all. Callers
    use it to decide between an animation and an honest instant swap. */
export function canViewTransition(): boolean {
  return typeof document !== "undefined" && typeof document.startViewTransition === "function";
}
