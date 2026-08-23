/**
 * What the server has been doing lately.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `lib/errorLog.ts` answers "what broke". This answers the question that comes
 * before it and is much harder to get at from a phone: "is the site slow, and
 * which part". A hosted platform's metrics page is a laptop and a login away,
 * and the person asking is usually standing in a restaurant.
 *
 * ── Same trade as the error log, for the same reasons ──────────────────────
 *
 * In memory, per instance, gone on restart. Writing a row per request would
 * mean the busiest path in the application now does a database write, which is
 * exactly backwards: the moment you most want this data is the moment the
 * database is the thing struggling.
 *
 * ── Bounded cardinality, on purpose ────────────────────────────────────────
 *
 * Aggregates are keyed by route, and a route is Express's own pattern
 * (`/api/reservations/:id`) where it is known, or a normalised path where it is
 * not. Keying on the raw path would grow a new bucket per booking id and this
 * map would be a slow memory leak with a nice-looking screen on top of it.
 *
 * Nothing personal is kept: a method, a route pattern, a status, a duration.
 * No bodies, no queries, no headers, no identities. Same rule as the error log.
 */

/** Durations kept per route, to compute percentiles from. Enough for a stable
    p95 on a busy route, small enough that a hundred routes is still nothing. */
const SAMPLES_PER_ROUTE = 120;

/** How many routes we are willing to track. A restaurant API has about thirty;
    well past that means normalisation has failed and it is better to stop
    growing than to leak. */
const MAX_ROUTES = 200;

/** The slowest individual requests, one per route. */
const SLOW_KEPT = 20;

/** Below this a request is not worth a developer's attention. */
const SLOW_THRESHOLD_MS = 400;

export interface RouteStat {
  route: string;
  method: string;
  count: number;
  errors: number;
  /** 5xx only. A 404 or a 409 is the application working. */
  failures: number;
  p50: number;
  p95: number;
  max: number;
  lastAt: string;
}

export interface SlowRequest {
  at: string;
  method: string;
  route: string;
  status: number;
  ms: number;
}

interface Bucket {
  method: string;
  route: string;
  count: number;
  errors: number;
  failures: number;
  samples: number[];
  lastAt: number;
}

const buckets = new Map<string, Bucket>();
const slowest: SlowRequest[] = [];

let started = Date.now();
let total = 0;
let dropped = 0;

/**
 * A path with its variable parts replaced.
 *
 * Only used when Express cannot tell us the route pattern, which happens for
 * 404s and for anything that never reached a router. Numbers, long hex strings
 * and our own reference formats all become a placeholder, because each is an
 * identifier and every distinct one would otherwise be its own bucket.
 */
export function normalisePath(path: string): string {
  const clean = path.split("?")[0] ?? path;
  return clean
    .split("/")
    .map((part) => {
      if (part === "") return part;
      if (/^\d+$/.test(part)) return ":n";
      if (/^[0-9a-f]{8,}$/i.test(part)) return ":hex";
      if (/^[A-Z]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(part)) return ":code";
      if (part.includes("@")) return ":email";
      return part;
    })
    .join("/");
}

export function recordRequest(input: {
  method: string;
  /** Express's route pattern if it is known, otherwise the raw path. */
  route: string;
  status: number;
  ms: number;
}): void {
  const route = normalisePath(input.route);
  const key = `${input.method} ${route}`;
  total += 1;

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_ROUTES) {
      dropped += 1;
      return;
    }
    bucket = { method: input.method, route, count: 0, errors: 0, failures: 0, samples: [], lastAt: 0 };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  bucket.lastAt = Date.now();
  if (input.status >= 400) bucket.errors += 1;
  if (input.status >= 500) bucket.failures += 1;

  bucket.samples.push(input.ms);
  if (bucket.samples.length > SAMPLES_PER_ROUTE) bucket.samples.shift();

  if (input.ms >= SLOW_THRESHOLD_MS) {
    /*
     * One entry per route: the worst that route has ever managed.
     *
     * A global list of the twenty slowest individual requests sounds right and
     * reads uselessly. Sign-in runs bcrypt and takes about 400ms every single
     * time, so nine failed logins filled the whole list with nine copies of one
     * fact and pushed everything else off it. Keeping the worst per route makes
     * this twenty different problems instead of twenty samples of one.
     */
    const key = `${input.method} ${route}`;
    const existing = slowest.findIndex((entry) => `${entry.method} ${entry.route}` === key);
    const record = { at: new Date().toISOString(), method: input.method, route, status: input.status, ms: Math.round(input.ms) };

    if (existing >= 0) {
      /* Only when it is genuinely worse, so this stays the high-water mark
         rather than drifting to whatever happened most recently. */
      if (record.ms > (slowest[existing]?.ms ?? 0)) slowest[existing] = record;
    } else {
      slowest.push(record);
    }

    slowest.sort((a, b) => b.ms - a.ms);
    if (slowest.length > SLOW_KEPT) slowest.length = SLOW_KEPT;
  }
}

/** The p-th percentile of a sample, nearest-rank. Small arrays, so sorting a
    copy per read is cheaper than keeping one sorted on every write. */
function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, Math.min(rank, sorted.length - 1))] ?? 0);
}

export function trafficSnapshot(): {
  since: string;
  total: number;
  dropped: number;
  routes: RouteStat[];
  slowest: SlowRequest[];
} {
  const routes: RouteStat[] = [];
  for (const bucket of buckets.values()) {
    routes.push({
      route: bucket.route,
      method: bucket.method,
      count: bucket.count,
      errors: bucket.errors,
      failures: bucket.failures,
      p50: percentile(bucket.samples, 50),
      p95: percentile(bucket.samples, 95),
      max: Math.round(Math.max(0, ...bucket.samples)),
      lastAt: new Date(bucket.lastAt).toISOString(),
    });
  }

  /* Slowest at the top: the screen is read to find a problem, and the busiest
     route is rarely the one causing it. */
  routes.sort((a, b) => b.p95 - a.p95 || b.count - a.count);

  return {
    since: new Date(started).toISOString(),
    total,
    dropped,
    routes,
    slowest: [...slowest],
  };
}

/** For a developer who has read the numbers and wants a clean window before
    reproducing something, and for the test suite. */
export function resetTraffic(): void {
  buckets.clear();
  slowest.length = 0;
  total = 0;
  dropped = 0;
  started = Date.now();
}
