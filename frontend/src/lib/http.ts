/**
 * The one place this app talks to the network.
 *
 * Session lives in an httpOnly cookie set by the API, which shares our origin
 * in every environment, so requests carry credentials and nothing keeps a token
 * in JavaScript where a script injection could read it.
 */

export class ApiError extends Error {
  readonly status: number;
  /** Seconds the server asked us to wait, when it sent a 429. */
  readonly retryAfter?: number;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }

  /** The request never reached the server at all. */
  get isOffline() {
    return this.status === 0;
  }

  /** Signed out, or the session was revoked from another device. */
  get isUnauthenticated() {
    return this.status === 401;
  }
}

/** Long enough for a photo upload over a weak mobile connection. */
const TIMEOUT_MS = 30_000;
const RETRIES = 2;

const GUEST_TOKEN_KEY = "ccm.support.guest";

/**
 * Identifies a signed-out visitor's support conversation between visits.
 * Deliberately not the session: a guest has no account to attach it to.
 */
export const guestToken = {
  read(): string | null {
    try {
      return localStorage.getItem(GUEST_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  write(value: string | null) {
    try {
      if (value) localStorage.setItem(GUEST_TOKEN_KEY, value);
      else localStorage.removeItem(GUEST_TOKEN_KEY);
    } catch {
      /* Private browsing. The thread simply will not survive a reload. */
    }
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function once<T>(method: Method, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { ...extra };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (path.startsWith("/api/support")) {
    const token = guestToken.read();
    if (token) headers["x-support-token"] = token;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      // Without a deadline, a stalled connection leaves a spinner turning forever.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, "That is taking too long. Check your connection and try again.");
    }
    throw new ApiError(0, "Cannot reach the restaurant right now. Check your connection.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* 204, or a body that is not JSON. Both are fine. */
  }

  if (!response.ok) {
    const record = payload as Record<string, unknown> | null;
    const message = typeof record?.error === "string" ? record.error : `Request failed (${response.status}).`;
    const retryAfter = typeof record?.retry_after_seconds === "number" ? record.retry_after_seconds : undefined;
    throw new ApiError(response.status, message, retryAfter);
  }

  return payload as T;
}

/**
 * Reads are retried with backoff; writes never are.
 *
 * One dropped packet on a phone turns into a failed fetch, and asking again a
 * moment later usually works. Repeating a POST is a different matter — an order
 * or a mobile-money prompt could go out twice — so only GET is replayed.
 */
async function request<T>(method: Method, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
  const idempotent = method === "GET";

  for (let attempt = 0; ; attempt++) {
    try {
      return await once<T>(method, path, body, extra);
    } catch (err) {
      const api = err instanceof ApiError ? err : null;
      const worthRetrying = api !== null && (api.isOffline || api.status === 502 || api.status === 503);
      if (!idempotent || !worthRetrying || attempt >= RETRIES) throw err;
      await sleep(400 * 2 ** attempt + Math.random() * 200);
    }
  }
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  /** `headers` carries the one thing a POST sometimes needs beyond its body:
   *  an Idempotency-Key, so a retry is recognised as the same attempt. */
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("POST", path, body, headers),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  query,
};

/**
 * Fetches a file (a PDF receipt) rather than JSON, and hands back the blob.
 * Kept separate because the response is not a document this layer can parse.
 */
export async function fetchFile(path: string): Promise<Blob> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new ApiError(response.status, "That file could not be downloaded.");
  return response.blob();
}
