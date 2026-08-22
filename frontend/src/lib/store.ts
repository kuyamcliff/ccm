import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Reading and writing, with a cache that actually caches.
 *
 * The version before this one refetched from nothing on every mount. Going Home
 * to Menu and back was three full round trips and three skeleton flashes, on a
 * connection where a round trip is most of a second. Nothing was shared either:
 * the home page and the menu page both asked for the menu and both waited.
 *
 * So: one cache, keyed by a string, living outside React.
 *
 *   - Two components asking for the same key while a request is in flight make
 *     one request and both get the answer.
 *   - A key that is already cached renders from cache on the first frame and
 *     revalidates behind the screen. No skeleton on a second visit.
 *   - A key marked `persist` survives a reload in localStorage, so a cold start
 *     paints real content instead of grey boxes.
 *   - A link can warm a key before the finger lifts (`prefetch`).
 *
 * Deliberately about two hundred lines rather than a dependency. The product
 * has one origin, one session and no optimistic-list-reordering to speak of;
 * what it needs from a query library is sharing, staleness and de-duplication,
 * and those are the cheap parts.
 */

/** How long a value is considered fresh enough to skip revalidation entirely. */
const DEFAULT_STALE_MS = 30_000;

/** Bumped when a cached shape changes in a way an old payload would break. */
const PERSIST_VERSION = "v5";
const PERSIST_PREFIX = `ccm.q.${PERSIST_VERSION}.`;

interface Entry<T = unknown> {
  data: T | undefined;
  error: unknown;
  /** When `data` last landed. 0 means it never has. */
  updatedAt: number;
  /** The request in flight, if there is one. Shared by every subscriber. */
  inFlight: Promise<void> | null;
  listeners: Set<() => void>;
  /** Whether a revalidation is running over the top of existing data. */
  revalidating: boolean;
}

const cache = new Map<string, Entry>();

function entryFor<T>(key: string): Entry<T> {
  let entry = cache.get(key) as Entry<T> | undefined;
  if (!entry) {
    entry = { data: undefined, error: undefined, updatedAt: 0, inFlight: null, listeners: new Set(), revalidating: false };
    cache.set(key, entry as Entry);
  }
  return entry;
}

function announce(entry: Entry) {
  for (const listener of entry.listeners) listener();
}

/* ── Persistence ────────────────────────────────────────────────────────────
   Only for keys that ask for it, and only for reads whose staleness is not
   dangerous to show for a moment: the menu, the site settings, the highlights.
   Never a payment status, never anything under /desk. */

function readPersisted<T>(key: string): { data: T; at: number } | null {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; at: number };
    if (typeof parsed?.at !== "number") return null;
    return parsed;
  } catch {
    /* Private browsing, a quota, or a payload written by an older build. Either
       way the answer is the same: behave as though nothing was stored. */
    return null;
  }
}

function writePersisted(key: string, data: unknown, at: number) {
  try {
    localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify({ data, at }));
  } catch {
    /* A full quota must never break a page. Drop everything this module owns
       and carry on without persistence for the rest of the session. */
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const name = localStorage.key(i);
        if (name?.startsWith("ccm.q.")) localStorage.removeItem(name);
      }
    } catch {
      /* Nothing further to try. */
    }
  }
}

/** Drops every persisted query. Used when the session changes hands, because
    one guest's cached page must never paint for the next one. */
export function clearPersistedQueries() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const name = localStorage.key(i);
      if (name?.startsWith("ccm.q.")) localStorage.removeItem(name);
    }
  } catch {
    /* Storage refused. There is nothing persisted to clear. */
  }
}

/* ── Fetching ───────────────────────────────────────────────────────────────*/

function runFetch<T>(key: string, fetcher: () => Promise<T>, persist: boolean): Promise<void> {
  const entry = entryFor<T>(key);
  if (entry.inFlight) return entry.inFlight;

  entry.revalidating = entry.updatedAt > 0;
  if (entry.revalidating) announce(entry as Entry);

  const request = fetcher()
    .then((data) => {
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
      if (persist) writePersisted(key, data, entry.updatedAt);
    })
    .catch((error: unknown) => {
      /* A failed revalidation must not blank a screen that already has content.
         The stale value stays; the error rides alongside it so a page can show
         a quiet "could not refresh" line if it wants to, and most do not. */
      entry.error = error;
    })
    .finally(() => {
      entry.inFlight = null;
      entry.revalidating = false;
      announce(entry as Entry);
    });

  entry.inFlight = request;
  return request;
}

/**
 * Warms a key without rendering it.
 *
 * Called from a link's `onPointerEnter` and `onTouchStart`, so the next screen's
 * data is already on its way while the finger is still travelling. On a phone
 * that buys the length of a tap, which is most of the perceived wait.
 */
export function prefetch<T>(key: string, fetcher: () => Promise<T>, opts: { persist?: boolean; staleMs?: number } = {}) {
  const entry = entryFor<T>(key);
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  if (entry.inFlight) return;
  if (entry.updatedAt > 0 && Date.now() - entry.updatedAt < staleMs) return;
  void runFetch(key, fetcher, opts.persist ?? false);
}

/** Writes a value straight into the cache. Used by the boot payload, which
    arrives before any component has asked for the keys it satisfies. */
export function seed<T>(key: string, data: T, opts: { persist?: boolean } = {}) {
  const entry = entryFor<T>(key);
  entry.data = data;
  entry.error = undefined;
  entry.updatedAt = Date.now();
  if (opts.persist) writePersisted(key, data, entry.updatedAt);
  announce(entry as Entry);
}

/**
 * Marks keys stale so the next render refetches them.
 *
 * A bare string invalidates one key; a string ending in `*` invalidates every
 * key with that prefix, which is how a console screen says "the bookings
 * changed" without knowing every filter somebody has open.
 */
export function invalidate(pattern: string) {
  const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : null;
  for (const [key, entry] of cache) {
    const hit = prefix === null ? key === pattern : key.startsWith(prefix);
    if (!hit) continue;
    entry.updatedAt = 0;
    announce(entry);
  }
}

/** Empties the cache completely. Called on sign in and sign out: the two moments
    when everything on screen belongs to somebody else. */
export function resetCache() {
  cache.clear();
  clearPersistedQueries();
}

export interface Query<T> {
  data: T | undefined;
  error: unknown;
  /** True only when there is nothing to show yet. A refresh over existing data
      is `revalidating`, and a screen should not put a skeleton over that. */
  loading: boolean;
  revalidating: boolean;
  reload: () => void;
  set: (next: T | ((current: T | undefined) => T)) => void;
}

export interface QueryOptions {
  /** Skip the request entirely. For a key that depends on something not chosen
      yet, like a date the guest has not picked. */
  enabled?: boolean;
  /** Survive a reload in localStorage. Reads only, and only ones that are safe
      to show for a moment while the fresh copy lands. */
  persist?: boolean;
  /** How long a value counts as fresh. */
  staleMs?: number;
}

/**
 * Reads a key.
 *
 * `fetcher` is read from a ref on every call rather than captured, because
 * callers routinely pass a closure over their own state and holding the first
 * one sends the state as it was on the very first render.
 */
export function useQuery<T>(key: string, fetcher: () => Promise<T>, opts: QueryOptions = {}): Query<T> {
  const { enabled = true, persist = false, staleMs = DEFAULT_STALE_MS } = opts;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  /* Hydrating from storage happens before the first subscription, so the very
     first frame already has content rather than a skeleton that is replaced a
     tick later. */
  if (persist && enabled) {
    const entry = entryFor<T>(key);
    if (entry.updatedAt === 0) {
      const stored = readPersisted<T>(key);
      if (stored) {
        entry.data = stored.data;
        entry.updatedAt = stored.at;
      }
    }
  }

  const subscribe = useCallback(
    (onChange: () => void) => {
      const entry = entryFor<T>(key);
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
      };
    },
    [key]
  );

  /* The snapshot has to be a stable reference between renders or
     useSyncExternalStore loops, so it is the entry object itself and the
     version counter below is what actually changes. */
  const snapshot = useCallback(() => {
    const entry = entryFor<T>(key);
    return `${entry.updatedAt}|${entry.revalidating}|${entry.error ? "e" : ""}`;
  }, [key]);

  useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (!enabled) return;
    const entry = entryFor<T>(key);
    const fresh = entry.updatedAt > 0 && Date.now() - entry.updatedAt < staleMs;
    if (fresh || entry.inFlight) return;
    void runFetch(key, () => fetcherRef.current(), persist);
  }, [key, enabled, persist, staleMs]);

  const entry = entryFor<T>(key);

  const reload = useCallback(() => {
    const target = entryFor<T>(key);
    target.updatedAt = 0;
    void runFetch(key, () => fetcherRef.current(), persist);
  }, [key, persist]);

  const set = useCallback(
    (next: T | ((current: T | undefined) => T)) => {
      const target = entryFor<T>(key);
      const value = typeof next === "function" ? (next as (c: T | undefined) => T)(target.data) : next;
      target.data = value;
      target.updatedAt = Date.now();
      if (persist) writePersisted(key, value, target.updatedAt);
      announce(target as Entry);
    },
    [key, persist]
  );

  return {
    data: entry.data,
    error: entry.data === undefined ? entry.error : undefined,
    loading: enabled && entry.updatedAt === 0 && entry.error === undefined,
    revalidating: entry.revalidating,
    reload,
    set,
  };
}

/* ── Writing ────────────────────────────────────────────────────────────────*/

export interface Mutation<Args extends unknown[], Result> {
  run: (...args: Args) => Promise<Result | undefined>;
  /**
   * Whether the request is in flight.
   *
   * Every control that fires one of these is required to render this. The last
   * version returned the same flag and most screens dropped it on the floor,
   * which is why buttons looked dead. `ui/Button` now takes `pending` as a
   * required prop on its `Action` form, so a submit that forgets it does not
   * compile.
   */
  pending: boolean;
  /**
   * Whether *this row's* request is in flight.
   *
   * `pending` is one flag for the whole hook, which is right for a screen with
   * one button and wrong for a list. A console table shares one `remove`
   * mutation across forty rows, so deleting row three lit up the spinner on all
   * forty: every Delete said "Deleting" and every row looked like it was going.
   *
   * Pass whatever identifies the row, usually its id:
   *
   *     pending={remove.pendingFor(promo.id)}
   *
   * The key is taken from the first argument of the call in flight, and from
   * its `id` when that argument is an object, which covers both shapes used
   * here: `run(id)` and `run({ id, status })`.
   */
  pendingFor: (key: unknown) => boolean;
  error: unknown;
  /** The same failure, readable the instant `run` resolves. Reading `error`
      straight after an await gives the value from the render already on screen,
      which is the one from before the failure. */
  readError: () => unknown;
  reset: () => void;
}

/**
 * What identifies one call, for `pendingFor`.
 *
 * The first argument, or its `id` when it has one. Deliberately shallow: a key
 * is for telling one row from another, and anything that needs more than an id
 * to say which row it is has a bigger problem than a spinner.
 */
function callKey(args: unknown[]): unknown {
  const first = args[0];
  if (first !== null && typeof first === "object" && "id" in first) {
    return (first as { id: unknown }).id;
  }
  return first;
}

export function useMutation<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>
): Mutation<Args, Result> {
  const [pending, setPending] = useState(false);
  /* Which call is in flight, so one row of a list can tell itself apart from
     the other thirty-nine sharing this mutation. */
  const [pendingKey, setPendingKey] = useState<unknown>(undefined);
  const [error, setError] = useState<unknown>(null);

  const inFlight = useRef(false);
  const mounted = useRef(true);
  const lastError = useRef<unknown>(null);

  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: Args): Promise<Result | undefined> => {
    /* A double tap on a booking is a real booking twice. This is the guard that
       matters most in the product and it is deliberately here rather than in a
       component, so it holds even if a screen forgets to disable its button. */
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    setPendingKey(callKey(args));
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
      if (mounted.current) {
        setPending(false);
        setPendingKey(undefined);
      }
    }
  }, []);

  const reset = useCallback(() => {
    lastError.current = null;
    setError(null);
  }, []);

  /* Reads the state, not the ref: a ref does not re-render, and this value has
     to be right in the render that draws the row. The two are set together. */
  const pendingFor = useCallback(
    (key: unknown) => pending && pendingKey === key,
    [pending, pendingKey]
  );

  return { run, pending, pendingFor, error, readError: useCallback(() => lastError.current, []), reset };
}

/**
 * Re-runs something on an interval, and stops while the tab is hidden.
 *
 * A backgrounded phone that keeps polling a payment every three seconds is a
 * phone with a flat battery and a bill from its network.
 */
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
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        /* Fire once on return rather than waiting a full interval: somebody who
           has just come back to the tab is looking at a stale screen. */
        saved.current();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
