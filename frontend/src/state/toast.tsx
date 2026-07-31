import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "~/ui/Icon";
import { ApiError } from "~/lib/http";

type Tone = "info" | "good" | "bad";

interface Toast {
  id: number;
  tone: Tone;
  text: string;
}

interface ToastValue {
  say: (text: string) => void;
  done: (text: string) => void;
  /** Turns any thrown value into something a person can read. */
  failed: (error: unknown, fallback?: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

/** Long enough to read a sentence, short enough not to sit in the way. */
const LIFETIME_MS = 4500;

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
      setToasts((current) => [...current.slice(-2), { id, tone, text }]);
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
      failed: (error, fallback = "That did not work. Try again.") => {
        const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : fallback;
        push("bad", message);
      },
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite: it announces itself without stealing focus from whatever the
          visitor is doing. */}
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.tone === "info" ? "" : ` toast--${toast.tone}`}`}>
            <span className="toast__icon">
              <Icon name={toast.tone === "good" ? "check-circle" : toast.tone === "bad" ? "alert" : "info"} size={18} />
            </span>
            <span>{toast.text}</span>
            <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <Icon name="close" size={16} />
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
