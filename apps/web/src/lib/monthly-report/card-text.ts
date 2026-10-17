import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatNumber, plural } from "@/i18n/format";
import { formatRecord } from "@/lib/workouts/present";
import { fromKg, weightUnit } from "@/lib/workouts/units";
import { formatMonth, type StoryCard } from "./report";

/** What a story card prints: the month, the big figure, the line under it and an optional detail line. */
export type CardText = { month: string; figure: string; label: string; detail: string | null };

const MINUS = "−";

export function cardText(t: Dictionary, locale: Locale, card: StoryCard): CardText {
  const copy = t.monthlyReport.card;
  const monthName = formatMonth(locale, card.month);
  const month = monthName.charAt(0).toLocaleUpperCase(locale) + monthName.slice(1);
  const count = card.data.count ?? 0;
  const label = (forms: Parameters<typeof plural>[2]) => plural(locale, count, forms).trim();
  switch (card.kind) {
    case "sessions":
      return { month, figure: formatNumber(locale, count), label: label(copy.sessions), detail: null };
    case "trainer":
      // Names don't decline, so the trainer's name goes on its own line under "занятий с тренером".
      return { month, figure: formatNumber(locale, count), label: label(copy.trainer), detail: card.data.name?.trim() || null };
    case "records": {
      const unit = weightUnit(locale);
      const detail =
        card.data.name && card.data.type && card.data.value !== undefined
          ? `${card.data.name}: ${formatRecord(t, locale, { type: card.data.type, value: card.data.value }, unit)}`
          : null;
      return { month, figure: formatNumber(locale, count), label: label(copy.records), detail };
    }
    case "weight": {
      const unit = weightUnit(locale);
      const change = card.data.change ?? 0;
      const value = formatNumber(locale, Math.abs(fromKg(change, unit)), { maximumFractionDigits: 1 });
      const sign = change < 0 ? MINUS : "+";
      return { month, figure: `${sign}${value} ${t.workouts.sets.units[unit]}`, label: copy.weight, detail: null };
    }
  }
}
