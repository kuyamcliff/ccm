import { useEffect, useState } from "react";
import { warmImage } from "./Img";
import { usePageVisible, usePrefersReducedMotion } from "./motion";

/**
 * The photographs behind the top of the home page.
 *
 * ── What was wrong before ──────────────────────────────────────────────────
 *
 * The old hero was three `<div>`s running `animation: hero-hold 21s infinite`
 * with delays of 0s, 7s and 14s. That is a clock, and a clock knows nothing
 * about the network. It started the moment the elements mounted, so on any
 * connection slower than an office one the second frame faded in over an image
 * that had not arrived, and you watched a photograph wipe itself into view
 * mid-crossfade. Then the Ken Burns scaled the `<img>` itself, which makes the
 * browser re-rasterise a full size JPEG on every frame: on a mid range Android
 * that is the stutter.
 *
 * ── What happens now ───────────────────────────────────────────────────────
 *
 * Nothing is on a clock until it is on the device.
 *
 *   1. Frame one is downloaded and **decoded** before anything is shown.
 *   2. The remaining frames are warmed strictly one at a time. A phone on a weak
 *      connection should not be fetching three large photographs at once while
 *      the rest of the page is still trying to load.
 *   3. A frame joins the rotation only once it has decoded. If it never arrives,
 *      the rotation simply never includes it. Two photographs that crossfade
 *      cleanly beat three that flicker.
 *   4. The crossfade runs on opacity, and the drift runs on a transform applied
 *      to a wrapper rather than to the image, with `contain: paint` on the box.
 *      Both stay on the compositor.
 *
 * It also stops entirely when the tab is hidden, and does not run at all when
 * the person has asked their phone for less movement, in which case they get the
 * first photograph, held still.
 */

export interface HeroFramesProps {
  /** In the order they should appear. Anything past the third is ignored: the
      fourth photograph in a rotation is bytes nobody is awake for. */
  images: string[];
  /** How long each frame is held before the next crossfade begins. */
  holdMs?: number;
  className?: string;
}

const MAX_FRAMES = 3;

export function HeroFrames({ images, holdMs = 6500, className }: HeroFramesProps) {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();

  /** Only the frames that have actually decoded, in the order they did. */
  const [ready, setReady] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  /* The list is joined into a string so the effect keys off its contents rather
     than off the array identity. A parent that rebuilds the array on every
     render would otherwise restart the whole warm-up each time. */
  const wanted = images.slice(0, MAX_FRAMES);
  const signature = wanted.join("|");

  useEffect(() => {
    let cancelled = false;
    setReady([]);
    setIndex(0);
    if (wanted.length === 0) return;

    void (async () => {
      for (const src of wanted) {
        const ok = await warmImage(src);
        if (cancelled) return;
        /* A frame that will not load is skipped rather than shown broken. The
           rotation is shorter; nobody can tell. */
        if (ok) setReady((current) => (current.includes(src) ? current : [...current, src]));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (reduced) return;
    if (!visible) return;
    if (ready.length < 2) return;

    const timer = setTimeout(() => {
      setIndex((current) => (current + 1) % ready.length);
    }, holdMs);

    return () => clearTimeout(timer);
    /* `index` is in the deps on purpose: each advance schedules the next one, so
       a hold is always a full hold and never the tail of a previous timer. */
  }, [index, ready.length, holdMs, reduced, visible]);

  if (ready.length === 0) {
    /* Nothing has decoded yet. The box keeps its shape and its ground so the
       page above and below it is already in its final position. */
    return <div className={["hero-frames", className].filter(Boolean).join(" ")} aria-hidden="true" />;
  }

  const active = reduced ? 0 : index;

  return (
    <div className={["hero-frames", className].filter(Boolean).join(" ")} aria-hidden="true">
      {ready.map((src, position) => (
        <div
          key={src}
          className="hero-frames__frame"
          data-active={position === active ? "true" : undefined}
          /* The drift is restarted per frame by keying the animation off the
             active state in CSS; nothing here recalculates on a timer. */
        >
          <img src={src} alt="" decoding="async" fetchPriority={position === 0 ? "high" : "low"} />
        </div>
      ))}
    </div>
  );
}
