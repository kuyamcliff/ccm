import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reading something from the API.
 *
 * Small on purpose. A caching library would be more than this product needs:
 * there are no shared queries to deduplicate and no background revalidation
 * worth the bytes on a phone. What matters is that a slow response cannot land
 * after the component has moved on, and that failure is a state a screen can
 * render rather than an exception.
 */

export interface Resource<T> {
  data: T | null;
  error: unknown;
  /** True only on the first load; a refresh keeps the old data on screen. */
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
  /** For optimistic updates. Also accepts an updater, like setState. */
  set: (next: T | ((current: T | null) => T)) => void;
}

export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  // A stale response must never overwrite a newer one, and nothing may be set
  // after unmount.
  const generation = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  /* Whether anything has landed yet, tracked in a ref rather than read from
     state: a state updater has to be pure, so it is not the place to decide
     between "loading" and "refreshing". */
  const settled = useRef(false);

  useEffect(() => {
    const mine = ++generation.current;
    let cancelled = false;

    setError(null);
    if (settled.current) setRefreshing(true);
    else setLoading(true);

    fetcherRef
      .current()
      .then((result) => {
        if (cancelled || mine !== generation.current) return;
        settled.current = true;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled || mine !== generation.current) return;
        setError(err);
      })
      .finally(() => {
        if (cancelled || mine !== generation.current) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const set = useCallback((next: T | ((current: T | null) => T)) => {
    setData((current) => (typeof next === "function" ? (next as (c: T | null) => T)(current) : next));
  }, []);

  return { data, error, loading, refreshing, reload, set };
}

/**
 * Running something that changes state.
 *
 * Holds the in-flight flag and the error so a form does not have to, and
 * guarantees a double-press cannot fire the request twice.
 */
export function useAction<Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  /* The same failure, kept somewhere a caller can read the instant `run`
     resolves. Reading the state straight after an await gives the value from
     the render that is already on screen, which is the one from before the
     failure — so a form that checked it would silently show nothing. */
  const lastError = useRef<unknown>(null);

  /* The action is re-read from a ref on every call rather than captured.
     Callers routinely pass a closure over their own state —
     `useAction(async () => signIn(email, password))` — and holding the first
     one would send the state as it was on the very first render: empty. */
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<Result | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      lastError.current = null;
      try {
        return await actionRef.current(...args);
      } catch (err) {
        lastError.current = err;
        if (mounted.current) setError(err);
        return undefined;
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return {
    run,
    busy,
    /** For rendering. Use `readError()` when reacting straight after `run`. */
    error,
    readError: useCallback(() => lastError.current, []),
    clearError: useCallback(() => {
      lastError.current = null;
      setError(null);
    }, []),
  };
}

/** Re-runs an effect on an interval, and pauses while the tab is hidden so a
    backgrounded phone stops polling. */
export function usePoll(callback: () => void, intervalMs: number | null) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (intervalMs === null) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(() => saved.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
