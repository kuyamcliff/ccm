/*
 * The points arithmetic, and nothing else.
 *
 * Separate from `routes/loyalty.ts` because this is the part that decides how
 * much money comes off a bill, and it should be checkable without a database
 * in front of it. `scripts/check-loyalty.ts` imports this file and would not be
 * able to if it pulled in `db.ts`, which refuses to load without a
 * `DATABASE_URL`. Same reasoning as `passwordStrength.ts`.
 */

/** Spend that earns one point. 1 point per 100 FCFA, as it has always been. */
export const FCFA_PER_POINT = 100;

export const POINT_VALUE_KEY = "loyalty_point_value_fcfa";
export const MIN_REDEEM_KEY = "loyalty_min_redeem_points";
export const MAX_SHARE_KEY = "loyalty_max_redeem_percent";

/* Earning a point per 100 FCFA and giving 5 FCFA back for it is 5% returned to
   a guest who comes back, which is a discount the kitchen can carry. The floor
   stops the feature being 15 FCFA off a bill, which reads as an insult rather
   than a reward. The ceiling is what keeps a regular from paying for a whole
   order in points on a busy night: half of any bill still arrives as money. */
export const DEFAULT_POINT_VALUE_FCFA = 5;
export const DEFAULT_MIN_REDEEM_POINTS = 100;
export const DEFAULT_MAX_REDEEM_PERCENT = 50;

export interface LoyaltyRules {
  /** What one point takes off a bill. */
  point_value_fcfa: number;
  /** Below this a balance cannot be spent at all. */
  min_redeem_points: number;
  /** The most of any one bill points may cover. */
  max_redeem_percent: number;
  /** Spend that earns a point. */
  fcfa_per_point: number;
}

export interface PointsQuote {
  /** Points that would be taken. Zero when the balance cannot be spent yet. */
  points: number;
  /** What they are worth against this bill. */
  value_fcfa: number;
}

export const NO_POINTS: PointsQuote = { points: 0, value_fcfa: 0 };

/**
 * The most of `amountFcfa` a balance may cover, without touching anything.
 *
 * Whole points only, and the value is always `points * point_value_fcfa`, so
 * what is deducted and what comes off the bill can never drift apart. Rounding
 * down here is deliberate: the guest keeps the fraction of a point rather than
 * the restaurant taking it.
 *
 * The browser runs this same sum to preview a discount before the guest agrees
 * to it. That preview is never trusted — the server quotes again against the
 * balance it can actually see, and what it deducts is what comes off.
 */
export function quotePoints(balance: number, amountFcfa: number, rules: LoyaltyRules): PointsQuote {
  if (!Number.isFinite(balance) || balance <= 0) return NO_POINTS;
  if (!Number.isFinite(amountFcfa) || amountFcfa <= 0) return NO_POINTS;
  if (rules.point_value_fcfa <= 0) return NO_POINTS;
  if (balance < rules.min_redeem_points) return NO_POINTS;

  const ceiling = Math.floor((amountFcfa * rules.max_redeem_percent) / 100);
  if (ceiling <= 0) return NO_POINTS;

  const points = Math.min(Math.floor(balance), Math.floor(ceiling / rules.point_value_fcfa));
  if (points <= 0) return NO_POINTS;

  return { points, value_fcfa: points * rules.point_value_fcfa };
}
