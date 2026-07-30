import { createElement, useEffect, useRef, useState } from "react";
import type { ElementType, ReactNode } from "react";

/**
 * Scroll reveal.
 *
 * One shared IntersectionObserver rather than one per element: a long page can
 * hold a hundred of these, and a hundred observers each with their own
 * callback is measurably worse than a single one dispatching to a map.
 *
 * Elements reveal once and are then unobserved — content that has been read
 * should not fade out again when it scrolls back into view.
 */

type RevealCallback = () => void;

let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, RevealCallback>();

function ensureObserver(): IntersectionObserver {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        callbacks.get(entry.target)?.();
        callbacks.delete(entry.target);
        observer!.unobserve(entry.target);
      }
    },
    {
      /* Fires slightly before the element reaches the fold so the transition
         has finished by the time it is properly in view, and slightly inside
         the bottom so something already on screen at load reveals at once. */
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.06,
    }
  );
  return observer;
}

interface RevealProps {
  children?: ReactNode;
  /** Element to render. Defaults to a div. */
  as?: ElementType;
  className?: string;
  /** Stagger, in milliseconds, for items revealing as a group. */
  delay?: number;
  /** Direction the element travels from. */
  from?: "up" | "down" | "left" | "right" | "none";
  [key: string]: unknown;
}

export function Reveal({ children, as = "div", className = "", delay = 0, from = "up", ...rest }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;

    // Reduced motion never animates, so there is nothing to observe.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    const io = ensureObserver();
    callbacks.set(el, () => setShown(true));
    io.observe(el);

    return () => {
      callbacks.delete(el);
      io.unobserve(el);
    };
  }, [shown]);

  return createElement(
    as,
    {
      ...rest,
      ref,
      className: `rv rv-${from}${shown ? " rv-in" : ""}${className ? ` ${className}` : ""}`,
      style: delay ? { ...(rest.style as object), transitionDelay: `${delay}ms` } : rest.style,
    },
    children
  );
}

/**
 * Reveals plain markup that is not worth wrapping in a component — anything
 * carrying the `rv` class gets observed, wherever it is on the page.
 *
 * A DOM mutation observer runs alongside the initial sweep because most of
 * this site's content arrives after a fetch: a one-shot scan on mount would
 * catch the empty shell and miss every card that landed a moment later, and
 * those cards would then sit at opacity zero forever.
 */
export function useRevealAll(deps: unknown[] = []) {
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const claim = (el: HTMLElement) => {
      if (el.classList.contains("rv-in") || callbacks.has(el)) return;
      if (reduced) { el.classList.add("rv-in"); return; }
      callbacks.set(el, () => el.classList.add("rv-in"));
      ensureObserver().observe(el);
    };

    const sweep = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(".rv:not(.rv-in)").forEach(claim);
    };

    sweep(document);

    if (reduced) return;

    const mo = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains("rv")) claim(node);
          sweep(node);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
