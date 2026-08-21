import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";

/**
 * A photograph that cannot leave a hole in the page, cannot shift the layout,
 * and cannot appear half drawn.
 *
 * Three problems, three answers.
 *
 * ── 1. Layout shift ────────────────────────────────────────────────────────
 *
 * Every image here sits in a box with an explicit aspect ratio, reserved before
 * a single byte arrives. Nothing on this site is allowed to arrive and push the
 * page down under somebody's thumb while they are reading it.
 *
 * ── 2. Appearing half drawn ────────────────────────────────────────────────
 *
 * A plain `<img>` paints progressively: on a slow connection you watch a JPEG
 * wipe down the screen, and the old hero crossfaded on a fixed timer regardless,
 * so it routinely faded from a finished photo into a half-drawn one. Here the
 * element is invisible until `img.decode()` resolves, which is the browser
 * saying "this is fully decoded and painting it will not cost you a frame". Only
 * then does it fade in.
 *
 * ── 3. The hole ────────────────────────────────────────────────────────────
 *
 * Menu and gallery images point wherever the owner pasted a URL, including hosts
 * that later go away. A failed `<img>` draws an empty box with no explanation;
 * this falls back to the flame mark, which at least reads as intentional.
 *
 * While an image is on its way the box holds a placeholder tinted from a hash of
 * its own URL, so a grid of loading photos looks like a set of different things
 * arriving rather than a wall of identical grey rectangles. It costs nothing:
 * there is no real low-quality preview to fetch, because the API does not
 * produce one yet.
 */

export interface ImgProps {
  src: string | null;
  alt: string;
  /** Width over height. `16 / 9`, `1`, `4 / 3`. Reserved before loading. */
  ratio?: number;
  className?: string;
  /**
   * The one image a screen is built around: the hero, the dish at the top of a
   * sheet. Loads eagerly at high priority and is never lazy. At most one per
   * screen, or the priority means nothing.
   */
  priority?: boolean;
  /** Responsive sizing hint for the browser's own selection. */
  sizes?: string;
  /** Rounds the box. Photography usually wants `--r-md`. */
  radius?: string;
  /** Fired once the image has decoded. Used by the hero to time its crossfade. */
  onReady?: () => void;
  /**
   * Merged over the box's own aspect ratio, radius and placeholder.
   *
   * In practice this carries one thing: `viewTransitionName`, from
   * `ui/motion.transitionName`, which is what lets a menu thumbnail morph into
   * the same dish's photograph in its sheet.
   */
  style?: CSSProperties;
}

/**
 * A stable hue per URL.
 *
 * Deterministic so the same dish gets the same placeholder every time, which
 * makes a revisit look like the page remembering rather than reshuffling. Kept
 * dark and desaturated: this sits on a black ground and must never be brighter
 * than the photograph that replaces it.
 */
function tintFor(src: string | null): string {
  if (!src) return "var(--surface)";
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    hash = (hash * 31 + src.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(140deg, hsl(${hue} 14% 11%), hsl(${(hue + 40) % 360} 12% 7%))`;
}

export function Img({
  src,
  alt,
  ratio = 4 / 3,
  className,
  priority = false,
  sizes,
  radius = "var(--r-md)",
  onReady,
  style: extra,
}: ImgProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const node = useRef<HTMLImageElement | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  /*
   * Wait for the decode, and start waiting again whenever the source changes.
   *
   * This is an effect keyed on `src` rather than work done in the ref callback,
   * and the difference is load-bearing. React reuses the same `<img>` element
   * when only its `src` prop changes, so the ref callback fires exactly once for
   * the life of the element: a version of this that decoded inside the ref would
   * correctly wait for the first photograph and then show every subsequent one
   * the instant its URL was set, half drawn, which is the precise bug this
   * component exists to prevent.
   */
  useEffect(() => {
    setReady(false);
    setFailed(false);
    if (!src) return;

    let cancelled = false;
    const image = node.current;
    if (!image) return;

    const announce = () => {
      if (cancelled) return;
      setReady(true);
      readyRef.current?.();
    };

    /*
     * `decode()` is the precise signal and `complete` is the fallback.
     *
     * It rejects on a broken image, and in some browsers it also rejects for an
     * image that is perfectly fine but was detached mid-flight. So a rejection
     * is not treated as failure on its own; `onError` is what decides that, and
     * this just falls back to showing whatever did arrive.
     */
    if (typeof image.decode === "function") {
      image
        .decode()
        .then(announce)
        .catch(() => {
          if (image.complete && image.naturalWidth > 0) announce();
        });
    } else if (image.complete && image.naturalWidth > 0) {
      announce();
    }

    return () => {
      cancelled = true;
    };
  }, [src]);

  const style: CSSProperties = {
    aspectRatio: String(ratio),
    borderRadius: radius,
    background: tintFor(src),
    ...extra,
  };

  if (!src || failed) {
    return (
      <span className={["img", "img--blank", className].filter(Boolean).join(" ")} style={style} aria-hidden="true">
        <Icon name="flame" size={22} />
      </span>
    );
  }

  return (
    <span className={["img", className].filter(Boolean).join(" ")} style={style}>
      <img
        ref={node}
        src={src}
        alt={alt}
        sizes={sizes}
        data-ready={ready ? "true" : undefined}
        loading={priority ? "eager" : "lazy"}
        /* `async` lets the browser decode off the main thread. On a mid range
           Android that is the difference between a smooth scroll and a stutter
           every time a menu thumbnail enters the viewport. */
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        /* A safety net for the case where the effect above ran before the
           element had a source to decode. Harmless when decode() already won:
           `ready` is idempotent. */
        onLoad={() => {
          setReady(true);
          readyRef.current?.();
        }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/**
 * Downloads and decodes an image without rendering it.
 *
 * The hero uses this to have the next frame fully ready before it starts a
 * crossfade. Resolves either way: a frame that will not load is a frame the
 * rotation skips, not an error anybody needs to see.
 */
export function warmImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (typeof image.decode === "function") {
        image
          .decode()
          .then(() => resolve(true))
          .catch(() => resolve(image.naturalWidth > 0));
        return;
      }
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
}
