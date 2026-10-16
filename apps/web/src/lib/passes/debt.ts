import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { plural } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";

/** A debt of a pair: sessions and their money by currency, never added across currencies (R38). */
export type Debt = { sessions: number; amounts: Record<string, number> };

/** "2 занятия, 4 000 ₽": a debt in sessions and in money per currency (PRD 2.8-11). */
export function debtText(t: Dictionary, locale: Locale, debt: Debt): string {
  if (debt.sessions <= 0) return t.money.payments.noDebt;
  return [
    plural(locale, debt.sessions, t.pairs.debtSessions),
    ...Object.entries(debt.amounts).map(([currency, minor]) => formatMoney(locale, minor, currency)),
  ].join(", ");
}
