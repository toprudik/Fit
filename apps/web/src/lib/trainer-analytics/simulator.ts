/**
 * The price simulator of «Аналитика» (PRD wave-2 §7 rule 7). It only computes: prices stay as they are.
 * `raise` and `churn` are fractions (0.2 = 20 %).
 */

/** Share of clients who may leave before the revenue drops: 1 − 1/(1 + p). */
export function breakEvenChurn(raise: number): number {
  return raise <= 0 ? 0 : 1 - 1 / (1 + raise);
}

/** Monthly revenue after the raise when that share of clients leaves, in minor units. */
export function forecast(baseMinor: number, raise: number, churn: number): number {
  return Math.round(baseMinor * (1 + raise) * (1 - churn));
}

/** The highest share of clients the simulator lets the trainer expect to lose. */
export const MAX_CHURN = 0.5;
