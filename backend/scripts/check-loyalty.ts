/*
 * What `quotePoints` is not allowed to do.
 *
 * Points are the one discount a guest can apply without a code, which means
 * nobody at the counter is checking it. So the arithmetic that decides how much
 * money comes off a bill is asserted here rather than trusted, and it runs
 * without a database because `lib/loyalty.ts` deliberately touches none.
 *
 * Run with `npm run check:loyalty`. It exits non-zero on the first broken rule.
 */

import {
  DEFAULT_MAX_REDEEM_PERCENT,
  DEFAULT_MIN_REDEEM_POINTS,
  DEFAULT_POINT_VALUE_FCFA,
  FCFA_PER_POINT,
  quotePoints,
} from "../src/lib/loyalty.js";
import type { LoyaltyRules } from "../src/lib/loyalty.js";

const RULES: LoyaltyRules = {
  point_value_fcfa: DEFAULT_POINT_VALUE_FCFA,
  min_redeem_points: DEFAULT_MIN_REDEEM_POINTS,
  max_redeem_percent: DEFAULT_MAX_REDEEM_PERCENT,
  fcfa_per_point: FCFA_PER_POINT,
};

let failures = 0;

function check(what: string, passed: boolean, detail = "") {
  if (passed) return;
  failures += 1;
  console.error(`  FAIL  ${what}${detail ? `: ${detail}` : ""}`);
}

console.log("Checking the points arithmetic.\n");

// ── The rules that protect the restaurant ──────────────────────────────

check(
  "a balance under the floor buys nothing",
  quotePoints(RULES.min_redeem_points - 1, 50_000, RULES).points === 0
);

check("an empty balance buys nothing", quotePoints(0, 50_000, RULES).points === 0);
check("a bill of nothing takes nothing", quotePoints(10_000, 0, RULES).points === 0);
check("a negative balance takes nothing", quotePoints(-500, 50_000, RULES).points === 0);
check("nonsense takes nothing", quotePoints(Number.NaN, 50_000, RULES).points === 0);

/* The one that matters on a busy night: however many points somebody has
   hoarded, the restaurant still takes real money for most of the bill. */
for (const bill of [500, 2_500, 4_000, 12_345, 250_000]) {
  const quote = quotePoints(1_000_000, bill, RULES);
  check(
    `points never cover more than ${RULES.max_redeem_percent}% of a bill`,
    quote.value_fcfa <= Math.floor((bill * RULES.max_redeem_percent) / 100),
    `bill ${bill}, covered ${quote.value_fcfa}`
  );
  check("points never cover more than the bill", quote.value_fcfa <= bill, `bill ${bill}`);
}

// ── The rules that protect the guest ───────────────────────────────────

/* If these two ever disagree, a guest is debited points that did not come off
   what they paid, which is the worst failure this file can have. */
for (const balance of [100, 137, 999, 5_000]) {
  for (const bill of [1_000, 2_500, 7_777, 60_000]) {
    const quote = quotePoints(balance, bill, RULES);
    check(
      "value is always exactly what was deducted",
      quote.value_fcfa === quote.points * RULES.point_value_fcfa,
      `balance ${balance}, bill ${bill}`
    );
    check(
      "never spends more than the guest has",
      quote.points <= balance,
      `balance ${balance}, bill ${bill}, took ${quote.points}`
    );
    check("whole points only", Number.isInteger(quote.points), `got ${quote.points}`);
  }
}

// ── The rules an owner could set ───────────────────────────────────────

check(
  "a point worth nothing is refused rather than dividing by zero",
  quotePoints(5_000, 50_000, { ...RULES, point_value_fcfa: 0 }).points === 0
);

check(
  "a cap of zero percent means points cannot be spent at all",
  quotePoints(5_000, 50_000, { ...RULES, max_redeem_percent: 0 }).points === 0
);

check(
  "a cap of a hundred percent can still not exceed the bill",
  quotePoints(1_000_000, 2_500, { ...RULES, max_redeem_percent: 100 }).value_fcfa <= 2_500
);

/* A deposit at the price the restaurant opened with, from a guest who has just
   crossed the floor. Worth naming because it is the first real redemption
   anybody will make. */
const firstRedemption = quotePoints(DEFAULT_MIN_REDEEM_POINTS, 2_500, RULES);
check(
  "the smallest spendable balance takes 500 FCFA off a 2,500 FCFA deposit",
  firstRedemption.points === 100 && firstRedemption.value_fcfa === 500,
  `got ${firstRedemption.points} points, ${firstRedemption.value_fcfa} FCFA`
);

/* The other end of it: a balance big enough that the cap, not the balance, is
   what decides. 1,250 is half of 2,500, and 250 points is what buys it. */
const cappedRedemption = quotePoints(10_000, 2_500, RULES);
check(
  "a large balance is stopped by the cap at half the deposit",
  cappedRedemption.points === 250 && cappedRedemption.value_fcfa === 1_250,
  `got ${cappedRedemption.points} points, ${cappedRedemption.value_fcfa} FCFA`
);

if (failures > 0) {
  console.error(`\n${failures} broken rule${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("Every rule holds.");
