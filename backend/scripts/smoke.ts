/* API smoke test. Run the backend first (npm run dev), then: npm run smoke */

const BASE = process.env.BASE_URL ?? "http://localhost:4000";
let cookie = "";
let failures = 0;

async function call(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`PASS  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}`, detail ?? "");
  }
}

const email = `smoke-${Date.now()}@test.local`;
const future = new Date(Date.now() + 3 * 86400000);
const futureDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

const health = await call("GET", "/api/health");
check("health", health.status === 200 && health.data?.ok === true, health);

const noAuth = await call("GET", "/api/reservations");
check("reservations require auth", noAuth.status === 401, noAuth);

const badReg = await call("POST", "/api/auth/register", {
  name: "S",
  email: "nope",
  password: "short",
});
check("register rejects bad input", badReg.status === 400, badReg);

/* Long enough to clear the old length rule, and refused anyway: guessed-first,
   keyboard run, and built from the name on the same form. */
const weakPasswords = [
  ["a guessed-first password", "password123"],
  ["a keyboard run", "qwertyuiop"],
  ["the account's own name in it", "smoketester99"],
] as const;

for (const [index, [label, weak]] of weakPasswords.entries()) {
  const attempt = await call("POST", "/api/auth/register", {
    name: "Smoke Tester",
    email: `weak-${index}-${Date.now()}@test.local`,
    password: weak,
  });
  check(`register rejects ${label}`, attempt.status === 400, attempt);
}

const reg = await call("POST", "/api/auth/register", {
  name: "Smoke Tester",
  email,
  password: "longenough1",
});
check("register", reg.status === 201 && reg.data?.user?.email === email, reg);

const dupe = await call("POST", "/api/auth/register", {
  name: "Smoke Tester",
  email,
  password: "longenough1",
});
check("duplicate email rejected", dupe.status === 409, dupe);

const me = await call("GET", "/api/auth/me");
check("me", me.status === 200 && me.data?.user?.name === "Smoke Tester", me);

const badRes = await call("POST", "/api/reservations", {
  date: "2001-01-01",
  time: "19:00",
  partySize: 4,
  phone: "+237670000000",
  note: "",
});
check("past date rejected", badRes.status === 400, badRes);

const mkRes = await call("POST", "/api/reservations", {
  date: futureDate,
  time: "19:00",
  partySize: 4,
  phone: "+237 670 000 000",
  note: "smoke test table",
});
check("create reservation", mkRes.status === 201 && mkRes.data?.reservation?.date === futureDate, mkRes);

const clash = await call("POST", "/api/reservations", {
  date: futureDate,
  time: "19:00",
  partySize: 2,
  phone: "+237 670 000 000",
  note: "",
});
check("double booking same slot rejected", clash.status === 409, clash);

const list = await call("GET", "/api/reservations");
check(
  "list reservations",
  list.status === 200 && list.data?.reservations?.some((r: any) => r.id === mkRes.data.reservation.id),
  list
);

const cancel = await call("DELETE", `/api/reservations/${mkRes.data.reservation.id}`);
check("cancel reservation", cancel.status === 200, cancel);

const cancelAgain = await call("DELETE", `/api/reservations/${mkRes.data.reservation.id}`);
check("cancel twice rejected", cancelAgain.status === 404, cancelAgain);

const badReview = await call("POST", "/api/reviews", { rating: 9, text: "hi" });
check("bad review rejected", badReview.status === 400, badReview);

const review = await call("POST", "/api/reviews", { rating: 5, text: "Smoke test says the goat slaps." });
check("post review", review.status === 201 && review.data?.review?.rating === 5, review);

const reviewUpdate = await call("POST", "/api/reviews", { rating: 4, text: "Edited: still good." });
check("update own review", reviewUpdate.status === 201 && reviewUpdate.data?.review?.rating === 4, reviewUpdate);

const reviewList = await call("GET", "/api/reviews");
check(
  "public review list",
  reviewList.status === 200 && reviewList.data?.reviews?.some((r: any) => r.author === "Smoke Tester"),
  reviewList
);

const delReview = await call("DELETE", "/api/reviews/mine");
check("delete own review", delReview.status === 200, delReview);

const loyalty = await call("GET", "/api/loyalty");
check(
  "loyalty reports a balance and the rules behind it",
  loyalty.status === 200 &&
    loyalty.data?.points_balance === 0 &&
    typeof loyalty.data?.rules?.point_value_fcfa === "number" &&
    loyalty.data.rules.point_value_fcfa > 0,
  loyalty
);
/* A brand new account cannot spend, which is the floor doing its job. Without
   this the checkout would offer a switch that takes nothing off. */
check("a new account has nothing to spend yet", loyalty.data?.spendable === false, loyalty);

const logout = await call("POST", "/api/auth/logout");
check("logout", logout.status === 200, logout);

const meAfter = await call("GET", "/api/auth/me");
check("me after logout is 401", meAfter.status === 401, meAfter);

console.log(failures === 0 ? "\nAll smoke tests passed." : `\n${failures} smoke test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
