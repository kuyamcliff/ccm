import { useEffect, useRef, useState } from "react";
import type { ElementType, ReactNode } from "react";

/**
 * Content that arrives as it is scrolled to.
 *
 * One IntersectionObserver per element, disconnected the moment it fires, so
 * nothing stays attached to the scroll for the life of the page. The animation
 * itself is a class in base.css and moves only transform and opacity, which
 * keeps it on the compositor and off the main thread on a cheap Android.
 *
 * Anything already in view on load is shown without waiting for a frame, and a
 * visitor who has asked their phone for less movement gets the content at full
 * opacity with no animation at all, handled in CSS.
 */

interface Props {
  children: ReactNode;
  /** Position in a run of siblings, which staggers the entrance. */
  index?: number;
  as?: ElementType;
  className?: string;
}

export function Reveal({ children, index = 0, as: Tag = "div", className }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    /* No observer, no problem: show it. An older browser gets the page
       without the entrance rather than a page of invisible sections. */
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      /* Fires a little before the element reaches the bottom edge, so it has
         finished arriving by the time it is properly in view. */
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={["reveal", className].filter(Boolean).join(" ")}
      data-shown={shown}
      style={{ "--i": index } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
