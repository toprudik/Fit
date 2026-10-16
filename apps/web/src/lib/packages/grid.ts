/**
 * The price grid (PRD wave-1 §2.8 rules 2–3, MONEY-1, MONEY-2). The database view public.price_grid is the
 * source of truth for saved packages; these are the same rules for what the trainer is still typing, so the
 * preview matches what clients will see after "Сохранить".
 */

export type PackageAppliesTo = "any" | "personal" | "group";

export const APPLIES_TO: readonly PackageAppliesTo[] = ["any", "personal", "group"];

export type GridInput = {
  id: string;
  sessionsCount: number;
  priceMinor: number;
  currency: string;
  appliesTo: PackageAppliesTo;
};

export type GridRow<T extends GridInput = GridInput> = T & {
  perSessionMinor: number;
  /** Whole percent saved against the drop-in, rounded down; null for the drop-in and for no saving. */
  savingsPct: number | null;
  isBestValue: boolean;
};

/** Validity choices in days; "" in a form is no expiry. The database allows 1–730. */
export const VALIDITY_DAYS = [30, 60, 90, 180, 365] as const;

/** Sizes the template offers, with the discount per session against the drop-in (MONEY-1: 10/20/25 %). */
export const TEMPLATE = [
  { sessions: 5, discountPct: 10 },
  { sessions: 10, discountPct: 20 },
  { sessions: 20, discountPct: 25 },
] as const;

/** Price per session in minor units, rounded half up (rule 2). */
export function perSessionMinor(priceMinor: number, sessionsCount: number): number {
  return Math.floor((priceMinor * 2 + sessionsCount) / (2 * sessionsCount));
}

/** ⌊(1 − per session / drop-in) × 100⌋, or null when there is nothing saved (MONEY-2). */
export function savingsPct(perSession: number, sessionsCount: number, dropInMinor: number | null): number | null {
  if (sessionsCount <= 1 || dropInMinor === null || dropInMinor <= 0 || perSession >= dropInMinor) return null;
  const pct = Math.floor(100 - (perSession * 100) / dropInMinor);
  return pct > 0 ? pct : null;
}

/**
 * Every package with its per-session price, savings and badge. The drop-in is the 1-session package in the
 * same currency, for the same session type or else for any type; one package per currency and type gets
 * "выгоднее всего": the highest savings above 0, ties to the larger pack (the view's rule).
 */
export function priceGrid<T extends GridInput>(packages: readonly T[]): GridRow<T>[] {
  const dropIn = (currency: string, appliesTo: PackageAppliesTo) =>
    packages.find((p) => p.sessionsCount === 1 && p.currency === currency && p.appliesTo === appliesTo) ??
    packages.find((p) => p.sessionsCount === 1 && p.currency === currency && p.appliesTo === "any");

  const rows = packages.map((p) => {
    const perSession = perSessionMinor(p.priceMinor, p.sessionsCount);
    return { ...p, perSessionMinor: perSession, savingsPct: savingsPct(perSession, p.sessionsCount, dropIn(p.currency, p.appliesTo)?.priceMinor ?? null), isBestValue: false };
  });

  const best = new Map<string, GridRow<T>>();
  for (const row of rows) {
    if (row.savingsPct === null) continue;
    const key = `${row.currency}:${row.appliesTo}`;
    const current = best.get(key);
    if (
      !current ||
      row.savingsPct > (current.savingsPct ?? 0) ||
      (row.savingsPct === current.savingsPct && (row.sessionsCount > current.sessionsCount || (row.sessionsCount === current.sessionsCount && row.id < current.id)))
    ) {
      best.set(key, row);
    }
  }
  for (const row of best.values()) row.isBestValue = true;
  return rows;
}

/**
 * Suggested pack prices from the drop-in price: N sessions at the template discount, rounded to whole
 * major units. With a 2 000 ₽ drop-in that is 9 000 / 16 000 / 30 000 ₽ (MONEY-1).
 */
export function templatePrices(dropInMinor: number): { sessions: number; priceMinor: number }[] {
  return TEMPLATE.map(({ sessions, discountPct }) => ({
    sessions,
    priceMinor: Math.round((dropInMinor * sessions * (100 - discountPct)) / 100 / 100) * 100,
  }));
}
