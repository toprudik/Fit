/** A plan discount as typed by an admin: a whole number of percent from 1 to 100, or null. */
export function parseDiscountPercent(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= 100 ? value : null;
}
