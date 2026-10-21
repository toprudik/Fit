import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatNumber, interpolate, plural } from "@/i18n/format";
import { isBadgeCode } from "@/lib/gamification/gamification";
import { formatRecord } from "@/lib/workouts/present";
import { fromKg, weightUnit } from "@/lib/workouts/units";
import { formatMonth, type StoryCard } from "./report";

/** What a story card prints: the month (what happened, on a moment card), the big figure, the line under it and an optional detail line. */
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
    case "streak_workouts":
      return { month, figure: formatNumber(locale, count), label: label(copy.streakWorkouts), detail: null };
    case "streak_diary":
      return { month, figure: formatNumber(locale, count), label: label(copy.streakDiary), detail: null };
    case "streak_steps":
      return { month, figure: formatNumber(locale, count), label: label(copy.streakSteps), detail: null };
    case "badges": {
      const code = card.data.code;
      const detail = isBadgeCode(code) ? t.gamification.badges.items[code].title : null;
      return { month, figure: formatNumber(locale, count), label: label(copy.badges), detail };
    }
    // Moment cards say what happened on top instead of the month; the trainer's name goes on its own line.
    case "milestone":
      return { month: copy.milestoneTop, figure: formatNumber(locale, count), label: label(copy.milestone), detail: card.data.name?.trim() || null };
    case "badge": {
      const code = card.data.code;
      const detail = isBadgeCode(code) ? t.gamification.badges.items[code].title : null;
      return { month: copy.badgeTop, figure: formatNumber(locale, count), label: label(copy.badgeHeld), detail };
    }
    case "trainer_month": {
      const lines = [interpolate(copy.trainerClients, { n: formatNumber(locale, card.data.clients ?? 0) })];
      if (card.data.milestones) lines.push(interpolate(copy.trainerMilestones, { n: formatNumber(locale, card.data.milestones) }));
      return { month, figure: formatNumber(locale, count), label: label(copy.trainerMonth), detail: lines.join(" · ") };
    }
    case "trainer_showcase":
      // No big figure: the trainer's name is the headline, the QR under it opens the showcase.
      return { month: copy.trainerShowcase, figure: "", label: card.data.name?.trim() || copy.showcase, detail: card.data.trial ? copy.trainerTrial : null };
    case "weight": {
      const unit = weightUnit(locale);
      const change = card.data.change ?? 0;
      const value = formatNumber(locale, Math.abs(fromKg(change, unit)), { maximumFractionDigits: 1 });
      const sign = change < 0 ? MINUS : "+";
      return { month, figure: `${sign}${value} ${t.workouts.sets.units[unit]}`, label: copy.weight, detail: null };
    }
  }
}
