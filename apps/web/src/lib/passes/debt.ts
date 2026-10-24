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

/**
 * What is left to pay on live passes, by currency (QA T9). Not a debt (Q22): screens show it next to "Долг"
 * as "Не доплачено за абонементы", the same sum "Деньги → Долги" lists.
 */
export function unpaidByCurrency(passes: { unpaidMinor: number; currency: string | null; status: string }[]): Record<string, number> {
  const amounts: Record<string, number> = {};
  for (const pass of passes) {
    if (pass.unpaidMinor <= 0 || !pass.currency || (pass.status !== "active" && pass.status !== "frozen")) continue;
    amounts[pass.currency] = (amounts[pass.currency] ?? 0) + pass.unpaidMinor;
  }
  return amounts;
}

/**
 * Whether the client owes the trainer anything: sessions in debt or money left on a live pass. "С долгом" in
 * «Клиенты» and "Деньги → Долги" both count this way (QA 24.10, bug 16).
 */
export function owesTrainer(debtSessions: number, unpaid: Record<string, number>): boolean {
  return debtSessions > 0 || Object.keys(unpaid).length > 0;
}

/** "4 000 ₽, 50 $": money per currency, never added across currencies (R38). */
export function amountsText(locale: Locale, amounts: Record<string, number>): string {
  return Object.entries(amounts)
    .map(([currency, minor]) => formatMoney(locale, minor, currency))
    .join(", ");
}
