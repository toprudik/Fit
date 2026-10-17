/**
 * The «новые цены ценовой сетки» variant of the price simulator (PRD wave-2 §7 rule 7): the trainer types a new
 * price for each package, and the simulator turns that into one raise for the currency.
 */

export type SimulatorPackage = {
  id: string;
  title: string;
  priceMinor: number;
  currency: string;
  /** Paid passes of this package sold over the simulator base (the last three full months). */
  sold: number;
};

/**
 * The raise as a fraction (0.2 = 20 %): what the trainer would have earned from the same sales at the new
 * prices against what they earned at the current ones. With no sales in the base, every package counts once.
 * Free packages and packages without a new price stay out.
 */
export function gridRaise(packages: SimulatorPackage[], newPrices: ReadonlyMap<string, number | null>): number {
  const priced = packages.filter((item) => item.priceMinor > 0 && typeof newPrices.get(item.id) === "number");
  const anySold = priced.some((item) => item.sold > 0);
  let before = 0;
  let after = 0;
  for (const item of priced) {
    const weight = anySold ? item.sold : 1;
    before += weight * item.priceMinor;
    after += weight * (newPrices.get(item.id) as number);
  }
  return before === 0 ? 0 : after / before - 1;
}
