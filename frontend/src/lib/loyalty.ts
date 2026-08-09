import type { Loyalty } from "./api";

/*
 * What a points balance can take off the bill in front of the guest.
 *
 * This mirrors `quotePoints` in the server's `lib/loyalty.ts`, and it is a
 * preview and nothing else. The server quotes again against the balance it can
 * actually see and deducts that; if the two ever disagree, what the server did
 * is what happened, and the amount it returns is what the guest is shown
 * paying. It exists so the figure on the button is the figure that will be
 * charged, rather than the one before the points came off.
 *
 * Kept in one file because it was written twice — once in the payment sheet and
 * once in the takeaway checkout — and two copies of a discount is two chances
 * to quote a number the server will not honour.
 */

export interface PointsOffer {
  points: number;
  value: number;
}

export function pointsOffer(loyalty: Loyalty | null | undefined, amountFcfa: number): PointsOffer | null {
  if (!loyalty || !loyalty.spendable || amountFcfa <= 0) return null;

  const { point_value_fcfa, max_redeem_percent } = loyalty.rules;
  if (point_value_fcfa <= 0) return null;

  const ceiling = Math.floor((amountFcfa * max_redeem_percent) / 100);
  if (ceiling <= 0) return null;

  const points = Math.min(loyalty.points_balance, Math.floor(ceiling / point_value_fcfa));
  if (points <= 0) return null;

  return { points, value: points * point_value_fcfa };
}
