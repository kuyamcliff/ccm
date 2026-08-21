import type { ElementType, ReactNode } from "react";
import { useReveal } from "./motion";

/**
 * A section that arrives as you scroll to it.
 *
 * Used sparingly. A page where every single block slides in is a page that feels
 * slow, because nothing is ever simply *there*: you are always waiting for the
 * next thing to finish. The rule here is one reveal per section heading and one
 * per the content under it, never per row.
 *
 * The entrance is opacity and a 12px translate, both on the compositor, and it
 * does not run at all under `prefers-reduced-motion`: content that only appears
 * if you animate it is content some people never see.
 */
export function Reveal({
  as: Tag = "div",
  className,
  children,
  delay,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  /** Staggers a sibling. Keep under 120ms: past that it reads as a slow page. */
  delay?: number;
}) {
  const { ref, shown } = useReveal<HTMLElement>();

  return (
    <Tag
      ref={ref}
      className={["reveal", className].filter(Boolean).join(" ")}
      data-shown={shown ? "true" : undefined}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
