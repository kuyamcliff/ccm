/**
 * End-to-end checks against a real server and a real PostgreSQL database.
 *
 *   npm run test:integration      (needs DATABASE_URL; CI provides one)
 *
 * These are separate from the unit tests because they need a database, and
 * they exist because every defect found while bringing this project up was
 * invisible without one: a missing SQL function, a missing column, a session
 * version that made every new account sign itself out, and two guests booking
 * the same table at the same time. None of those are reachable by testing
 * pure functions, and all of them reached customers.
 *
 * The server is started as a child process against whatever DATABASE_URL is
 * set, so this exercises the same boot path production uses rather than a
 * test-only assembly of the app.
 */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../src/db.js";

const PORT = Number(process.env.TEST_PORT ?? 4111);
const BASE = `http://localhost:${PORT}`;
const ORIGIN = "http://localhost:5173";
const JSON_HEADERS = { "Content-Type": "application/json", Origin: ORIGIN };
const PASSWORD = "Grilled-Goat-9481-Buea";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let server: ChildProcess;

/** A unique suffix so repeated runs never collide on a unique index. */
const run = Date.now().toString(36);

async function waitForHealth(timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error("server did not become healthy in time");
    await new Promise((r) => setTimeout(r, 400));
  }
}

function cookieFrom(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/**
 * Creates an account by writing it straight to the database, then signs in.
 *
 * Registration is deliberately limited to five accounts an hour per address,
 * which is correct for the product and far below what these tests need. Only
 * the test that is actually about registration goes through that endpoint;
 * everything else needs *a* signed-in guest, not a newly registered one.
 */
async function signedInGuest(tag: string): Promise<string> {
  const email = `it-${run}-${tag}@camchopmeat.test`;
  const hash = await bcrypt.hash(PASSWORD, 10);
  await pool.query(
    "INSERT INTO camchop.users (name, email, password_hash, role) VALUES ($1, $2, $3, 'user')",
    [`Guest ${tag}`, email, hash]
  );
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `sign in ${tag} -> ${res.status} ${await res.text()}`);
  const cookie = cookieFrom(res);
  assert.ok(cookie, "signing in must set a session cookie");
  return cookie;
}

before(async () => {
  /* Refuse to run against something already on the port. A leftover server
     from an earlier run would answer every request and quietly carry its own
     rate-limit counters, which looks like the application failing rather than
     the test being dirty. */
  try {
    await fetch(`${BASE}/api/health`);
    throw new Error(
      `Something is already listening on ${BASE}. Stop it before running the integration tests.`
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Something is already listening")) throw err;
    /* ECONNREFUSED is what we want: the port is free. */
  }

  /* `detached` so the server gets its own process group. Started through npx,
     the actual node process is a grandchild, and killing only the immediate
     child leaves it holding the port. */
  server = spawn("npx", ["tsx", "src/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "development" },
    stdio: "ignore",
    detached: true,
  });
  await waitForHealth();
});

after(async () => {
  if (server?.pid) {
    // Negative pid: the whole process group, grandchildren included.
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  }
  await pool.end();
});

describe("service health", () => {
  it("reports the database as reachable", async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; database: string };
    assert.equal(body.ok, true);
    assert.equal(body.database, "up");
  });
});

describe("public endpoints answer without a server error", () => {
  // Each of these hid a missing column or SQL function at some point.
  const today = new Date().toISOString().slice(0, 10);
  const paths = [
    "/api/menu",
    "/api/site-settings",
    "/api/popular",
    "/api/offers",
    "/api/reviews",
    "/api/gallery",
    "/api/waitlist",
    `/api/tables?date=${today}&time=19:30`,
    "/api/legal/terms",
    "/api/legal/privacy",
    "/api/recovery/status",
  ];
  for (const path of paths) {
    it(path, async () => {
      const res = await fetch(BASE + path);
      assert.ok(res.status < 500, `${path} answered ${res.status}`);
    });
  }
});

describe("registration", () => {
  it("leaves the new account signed in", async () => {
    /* Regression, and the reason this whole file exists. The register route
       signs the cookie with a hardcoded session version rather than reading
       the column back, so a mismatched users.session_version default leaves
       every new account holding a cookie the server refuses. It looks like a
       successful sign-up followed instantly by being signed out, and no unit
       test can see it. */
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Brand New", email: `it-${run}-fresh@camchopmeat.test`, password: PASSWORD }),
    });
    assert.equal(res.status, 201, `register -> ${res.status} ${await res.text()}`);

    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookieFrom(res) } });
    assert.equal(me.status, 200, "a freshly registered account must stay signed in");
  });

  it("signs in again with the same credentials", async () => {
    const cookie = await signedInGuest("returning");
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
  });

  it("gives the same answer for a wrong password and an unknown address", async () => {
    /* The property that matters is not the wording but that the two cases are
       indistinguishable: anything else lets an attacker enumerate which email
       addresses have accounts. */
    const attempt = async (email: string, password: string) => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, password }),
      });
      return { status: res.status, body: ((await res.json()) as { error?: string }).error ?? "" };
    };

    const known = `it-${run}-returning@camchopmeat.test`;
    const wrongPassword = await attempt(known, "definitely-not-the-password");
    const noSuchAccount = await attempt(`it-${run}-nobody@camchopmeat.test`, "definitely-not-the-password");

    assert.equal(wrongPassword.status, 401);
    assert.equal(noSuchAccount.status, 401);
    assert.equal(wrongPassword.body, noSuchAccount.body, "the two failures must be indistinguishable");
  });
});

describe("authorisation", () => {
  it("refuses staff endpoints to a signed-out visitor", async () => {
    for (const path of ["/api/admin/stats", "/api/admin/menu", "/api/access"]) {
      const res = await fetch(BASE + path);
      assert.equal(res.status, 401, `${path} must require a session`);
    }
  });

  it("refuses staff endpoints to an ordinary customer", async () => {
    const cookie = await signedInGuest("customer");
    for (const path of ["/api/admin/stats", "/api/admin/menu", "/api/access", "/api/admin/payments"]) {
      const res = await fetch(BASE + path, { headers: { Cookie: cookie } });
      assert.equal(res.status, 403, `${path} must be forbidden to a customer, got ${res.status}`);
    }
  });

  it("blocks a state-changing request with no recognisable origin", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@y.test", password: "z" }),
    });
    assert.equal(res.status, 403, "cross-origin protection must not fail open");
  });
});

describe("booking", () => {
  it("holds a table for exactly one of several simultaneous guests", async () => {
    // Regression: check-then-insert let two requests both take the same table.
    const guests = await Promise.all([0, 1, 2, 3].map((i) => signedInGuest(`race${i}`)));
    const date = new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10);

    /* Start from a slot nobody holds. Without this the first run leaves a
       booking behind and every later run sees four refusals and concludes,
       wrongly, that the race is being lost. */
    await pool.query("DELETE FROM camchop.reservations WHERE table_id = 1 AND date = $1 AND time = '19:30'", [date]);

    const body = JSON.stringify({ tableId: 1, date, time: "19:30", partySize: 2, phone: "677123456", note: "" });

    const statuses = await Promise.all(
      guests.map((Cookie) =>
        fetch(`${BASE}/api/reservations`, { method: "POST", headers: { ...JSON_HEADERS, Cookie }, body }).then(
          (r) => r.status
        )
      )
    );

    const booked = statuses.filter((s) => s === 201).length;
    const refused = statuses.filter((s) => s === 409).length;
    const broke = statuses.filter((s) => s >= 500).length;

    assert.equal(broke, 0, `no request may fail with a server error, got [${statuses.join(",")}]`);
    assert.equal(booked, 1, `exactly one booking may survive, got [${statuses.join(",")}]`);
    assert.equal(refused, guests.length - 1, "everyone else must be told the table is taken");
  });

  it("offers a way out when the table has gone, instead of only refusing", async () => {
    const [holder, latecomer] = await Promise.all([signedInGuest("holds"), signedInGuest("late")]);
    const date = new Date(Date.now() + 140 * 864e5).toISOString().slice(0, 10);
    await pool.query("DELETE FROM camchop.reservations WHERE date = $1", [date]);

    const body = JSON.stringify({ tableId: 1, date, time: "19:30", partySize: 2, phone: "677123456", note: "" });
    const first = await fetch(`${BASE}/api/reservations`, { method: "POST", headers: { ...JSON_HEADERS, Cookie: holder }, body });
    assert.equal(first.status, 201, "the first guest must get the table");

    const refused = await fetch(`${BASE}/api/reservations`, { method: "POST", headers: { ...JSON_HEADERS, Cookie: latecomer }, body });
    assert.equal(refused.status, 409);

    const payload = (await refused.json()) as {
      error?: string;
      clash?: string;
      alternatives?: { times?: string[]; tables?: { id: number; label: string; capacity: number }[] };
    };

    /* The word, not the sentence: the app picks its own wording from this so a
       French-speaking guest is not shown an English one. */
    assert.equal(payload.clash, "table");
    assert.ok(typeof payload.error === "string" && payload.error.length > 0, "prose must still be there for anything that cannot read the word");

    const times = payload.alternatives?.times ?? [];
    assert.ok(times.length > 0, "a refusal must offer other times");
    assert.ok(!times.includes("19:30"), "it must never offer back the slot it just refused");
    for (const slot of times) assert.match(slot, /^\d{2}:\d{2}$/);

    const tables = payload.alternatives?.tables ?? [];
    assert.ok(tables.length > 0, "a refusal must offer the tables still free at that time");
    assert.ok(!tables.some((t) => t.id === 1), "it must never offer back the table it just refused");
    assert.ok(tables.every((t) => t.capacity >= 2), "it must not offer a table the party does not fit on");
  });

  it("tells a guest who is already booked, and offers times they are free", async () => {
    const cookie = await signedInGuest("double");
    const date = new Date(Date.now() + 150 * 864e5).toISOString().slice(0, 10);
    await pool.query("DELETE FROM camchop.reservations WHERE date = $1", [date]);

    const base = { date, time: "19:30", partySize: 2, phone: "677123456", note: "" };
    const first = await fetch(`${BASE}/api/reservations`, {
      method: "POST", headers: { ...JSON_HEADERS, Cookie: cookie }, body: JSON.stringify({ ...base, tableId: 2 }),
    });
    assert.equal(first.status, 201);

    const refused = await fetch(`${BASE}/api/reservations`, {
      method: "POST", headers: { ...JSON_HEADERS, Cookie: cookie }, body: JSON.stringify({ ...base, tableId: 3 }),
    });
    assert.equal(refused.status, 409);

    const payload = (await refused.json()) as { clash?: string; alternatives?: { times?: string[]; tables?: unknown[] } };
    assert.equal(payload.clash, "guest");
    assert.ok((payload.alternatives?.times ?? []).length > 0, "offer them a time they are actually free");
    /* Never another table at the same time: that would be a second booking for
       one visit, and a second deposit. */
    assert.deepEqual(payload.alternatives?.tables ?? [], []);
  });

  it("hands the guest their booking as a calendar file", async () => {
    const cookie = await signedInGuest("cal");
    const date = new Date(Date.now() + 160 * 864e5).toISOString().slice(0, 10);
    await pool.query("DELETE FROM camchop.reservations WHERE date = $1", [date]);

    const created = await fetch(`${BASE}/api/reservations`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: cookie },
      body: JSON.stringify({ tableId: 4, date, time: "19:30", partySize: 2, phone: "677123456", note: "Birthday; cake, please" }),
    });
    assert.equal(created.status, 201);
    const { reservation } = (await created.json()) as { reservation: { id: number } };

    const res = await fetch(`${BASE}/api/reservations/${reservation.id}/calendar.ics`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    /* The content type is what makes a phone hand this to its calendar app
       rather than drop it in Downloads. */
    assert.match(res.headers.get("content-type") ?? "", /^text\/calendar/);
    assert.match(res.headers.get("content-disposition") ?? "", /\.ics"$/);

    const body = await res.text();
    assert.ok(body.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(body.endsWith("END:VCALENDAR\r\n"));
    assert.ok(!/[^\r]\n/.test(body), "a bare newline makes the file unimportable");
    assert.ok(body.includes(`UID:ccm-booking-${reservation.id}@`), "the UID must be the booking's own");
    // Unpaid, so the calendar must not promise a table that is not held.
    assert.ok(body.includes("STATUS:TENTATIVE"));
    // The note's semicolon and comma must be escaped, not left to break the file.
    assert.ok(body.includes("Birthday\\; cake\\, please"));
    for (const line of body.split("\r\n")) {
      assert.ok(new TextEncoder().encode(line).length <= 75, `over-length line: ${line}`);
    }
  });

  it("will not hand one guest's calendar file to another", async () => {
    const [owner, stranger] = await Promise.all([signedInGuest("calmine"), signedInGuest("calnosy")]);
    const date = new Date(Date.now() + 170 * 864e5).toISOString().slice(0, 10);
    await pool.query("DELETE FROM camchop.reservations WHERE date = $1", [date]);

    const created = await fetch(`${BASE}/api/reservations`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: owner },
      body: JSON.stringify({ tableId: 4, date, time: "20:00", partySize: 2, phone: "677123456", note: "" }),
    });
    assert.equal(created.status, 201);
    const { reservation } = (await created.json()) as { reservation: { id: number } };

    const theirs = await fetch(`${BASE}/api/reservations/${reservation.id}/calendar.ics`, { headers: { Cookie: stranger } });
    /* 404 rather than 403: whether a given booking id exists at all is not
       something a stranger gets to learn. */
    assert.equal(theirs.status, 404);

    const signedOut = await fetch(`${BASE}/api/reservations/${reservation.id}/calendar.ics`);
    assert.equal(signedOut.status, 401);
  });

  it("refuses a booking in the past", async () => {
    const cookie = await signedInGuest("past");
    const res = await fetch(`${BASE}/api/reservations`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: cookie },
      body: JSON.stringify({ tableId: null, date: "2020-01-01", time: "19:30", partySize: 2, phone: "677123456", note: "" }),
    });
    assert.equal(res.status, 400);
  });

  it("refuses a party size the form would never send", async () => {
    const cookie = await signedInGuest("party");
    const date = new Date(Date.now() + 130 * 864e5).toISOString().slice(0, 10);
    for (const partySize of [0, -3, 999]) {
      const res = await fetch(`${BASE}/api/reservations`, {
        method: "POST",
        headers: { ...JSON_HEADERS, Cookie: cookie },
        body: JSON.stringify({ tableId: null, date, time: "19:30", partySize, phone: "677123456", note: "" }),
      });
      assert.equal(res.status, 400, `party size ${partySize} must be rejected`);
    }
  });
});

describe("error handling", () => {
  it("never returns a raw internal message to a customer", async () => {
    const res = await fetch(`${BASE}/api/reservations`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{ this is not json",
    });
    assert.ok(res.status >= 400);
    const text = await res.text();
    assert.doesNotMatch(text, /at Object\.|node_modules|SyntaxError|pg-pool|ECONNREFUSED/, "must not leak internals");
  });

  it("answers an unknown route without leaking a stack", async () => {
    const res = await fetch(`${BASE}/api/definitely-not-a-route`);
    assert.equal(res.status, 404);
    assert.doesNotMatch(await res.text(), /at Object\.|node_modules/);
  });
});
