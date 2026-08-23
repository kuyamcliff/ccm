import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { normalisePath, recordRequest, resetTraffic, trafficSnapshot } from "./traffic.js";

beforeEach(() => resetTraffic());

test("identifiers in a path collapse to one bucket", () => {
  assert.equal(normalisePath("/api/reservations/41"), "/api/reservations/:n");
  assert.equal(normalisePath("/api/receipts/takeaway/TKA-8EHS-RZJJ"), "/api/receipts/takeaway/:code");
  assert.equal(normalisePath("/api/payments/9f3a1c2e4b5d6a7f/receipt"), "/api/payments/:hex/receipt");
  assert.equal(normalisePath("/api/menu?q=goat"), "/api/menu");
});

test("a busy id-bearing route is one row, not one row per id", () => {
  for (let id = 1; id <= 50; id++) {
    recordRequest({ method: "GET", route: `/api/reservations/${id}`, status: 200, ms: 10 });
  }
  const snap = trafficSnapshot();
  assert.equal(snap.routes.length, 1, "fifty ids must not become fifty buckets");
  assert.equal(snap.routes[0]?.count, 50);
});

test("percentiles are taken from the samples, not guessed", () => {
  for (let i = 1; i <= 100; i++) recordRequest({ method: "GET", route: "/api/menu", status: 200, ms: i });
  const row = trafficSnapshot().routes[0];
  assert.equal(row?.p50, 50);
  assert.equal(row?.p95, 95);
  assert.equal(row?.max, 100);
});

test("a 4xx is counted as an error but not as a failure", () => {
  recordRequest({ method: "POST", route: "/api/reservations", status: 409, ms: 5 });
  recordRequest({ method: "POST", route: "/api/reservations", status: 500, ms: 5 });
  const row = trafficSnapshot().routes[0];
  /* A 409 is the booking clash working exactly as designed. Rolling it in with
     the 500s would make a busy Friday look like an outage. */
  assert.equal(row?.errors, 2);
  assert.equal(row?.failures, 1);
});

test("the slow list holds the slowest, not the most recent", () => {
  recordRequest({ method: "GET", route: "/api/insights", status: 200, ms: 2000 });
  for (let i = 0; i < 40; i++) recordRequest({ method: "GET", route: "/api/menu", status: 200, ms: 500 });
  const snap = trafficSnapshot();
  assert.equal(snap.slowest[0]?.ms, 2000, "the 2s outlier must survive forty later slow requests");
  assert.ok(snap.slowest.length <= 20);
});

test("one consistently slow route takes one line, not the whole list", () => {
  /* Sign-in runs bcrypt and takes about 400ms every time. Nine failed logins
     used to fill the entire slow list with nine copies of that one fact. */
  for (let i = 0; i < 9; i++) recordRequest({ method: "POST", route: "/api/auth/login", status: 401, ms: 420 });
  recordRequest({ method: "GET", route: "/api/insights", status: 200, ms: 900 });

  const snap = trafficSnapshot();
  assert.equal(snap.slowest.length, 2, "two slow routes, not ten slow requests");
  assert.equal(snap.slowest[0]?.route, "/api/insights");
});

test("a route's slow entry is its worst, not its latest", () => {
  recordRequest({ method: "GET", route: "/api/insights", status: 200, ms: 3000 });
  recordRequest({ method: "GET", route: "/api/insights", status: 200, ms: 450 });
  assert.equal(trafficSnapshot().slowest[0]?.ms, 3000, "the high-water mark must not drift down");
});

test("anything quick is not worth keeping", () => {
  recordRequest({ method: "GET", route: "/api/menu", status: 200, ms: 12 });
  assert.equal(trafficSnapshot().slowest.length, 0);
});

test("the route map is bounded", () => {
  for (let i = 0; i < 400; i++) recordRequest({ method: "GET", route: `/api/thing-${i}`, status: 200, ms: 1 });
  const snap = trafficSnapshot();
  assert.ok(snap.routes.length <= 200, "the map must stop growing rather than leak");
  assert.ok(snap.dropped > 0, "and must say how much it stopped counting");
});
