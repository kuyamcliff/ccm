import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "~/ui/Icon";
import { say, type Intent } from "~/lib/say";

/**
 * The line that slides up to say what just happened.
 *
 * ── The one rule ───────────────────────────────────────────────────────────
 *
 * `failed()` takes the error **and what the person was doing**, and hands both
 * to `lib/say`. It never reads the server's message.
 *
 * The old version had a function called `customerSafeError` that let the raw
 * server string through as long as it did not match a blocklist of frightening
 * words, which is a filter that only catches the failures somebody thought of.
 * It is why customers could be shown "Request failed (500)." That is a true
 * sentence for whoever reads the logs. It is not a sentence you say to somebody
 * standing outside a restaurant trying to pay for chicken.
 *
 * ── Placement ──────────────────────────────────────────────────────────────
 *
 * Above the tab bar, not at the top of the screen. On a phone the top is the
 * furthest point from the thumb and is usually under the notch; the bottom is
 * where the person is already looking, because that is where the button they
 * just pressed was.
 */

type Tone = "info" | "good" | "bad";

interface Toast {
  id: number;
  tone: Tone;
  text: string;
}

interface ToastValue {
  /** Neutral. Something happened that is worth knowing. */
  say: (text: string) => void;
  /** It worked. Warm and specific: "Table held. See you Friday at 7." */
  done: (text: string) => void;
  /** It did not work. Give it the intent; the wording comes from `lib/say`. */
  failed: (error: unknown, intent?: Intent) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const LIFETIME_MS = 4500;
/** Three on screen at once is already too many to read. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: Tone, text: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, tone, text }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFETIME_MS)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastValue>(
    () => ({
      say: (text) => push("info", text),
      done: (text) => push("good", text),
      failed: (error, intent = "save") => push("bad", say(error, intent)),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        `polite` rather than `assertive`, even for a failure. A screen reader
        interrupting mid-sentence to announce a toast is worse than the same
        sentence a moment later, and the screen the person is on has usually said
        the same thing inline anyway.
      */}
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.tone === "info" ? "" : ` toast--${toast.tone}`}`}>
            <Icon
              name={toast.tone === "good" ? "check-circle" : toast.tone === "bad" ? "alert" : "info"}
              size={17}
              className="toast__icon"
            />
            <span className="toast__text">{toast.text}</span>
            <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <Icon name="close" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
