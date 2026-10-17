import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";

type Terms = {
  referrerSessions: number;
  refereeSessions: number;
  minAmountMinor: number | null;
  currency: string | null;
  packageTitle: string | null;
  activeTo: string | null;
};

/** "30 ноября" for the offer's last day, a local date without a time zone of its own. */
export function formatOfferDay(locale: Locale, day: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** The lines of an offer as the trainer reads it on /trainer/referrals. */
export function offerLines(t: Dictionary, locale: Locale, offer: Terms): string[] {
  const copy = t.referrals;
  const sessions = (count: number) => plural(locale, count, copy.sessions);
  return [
    interpolate(copy.referrerBonus, { sessions: sessions(offer.referrerSessions) }),
    offer.refereeSessions > 0 ? interpolate(copy.refereeBonus, { sessions: sessions(offer.refereeSessions) }) : copy.noRefereeBonus,
    offer.minAmountMinor && offer.currency
      ? interpolate(copy.conditionAmount, { amount: formatMoney(locale, offer.minAmountMinor, offer.currency) })
      : offer.packageTitle
        ? interpolate(copy.conditionPackage, { title: offer.packageTitle })
        : copy.conditionNone,
    offer.activeTo ? interpolate(copy.until, { date: formatOfferDay(locale, offer.activeTo) }) : copy.noEnd,
  ];
}

/** The terms as the client reads them on their referral page. */
export function clientTermLines(t: Dictionary, locale: Locale, offer: Terms, trainerName: string): string[] {
  const copy = t.referrals.client;
  const sessions = (count: number) => plural(locale, count, t.referrals.sessions);
  return [
    interpolate(copy.lead, { name: trainerName, sessions: sessions(offer.referrerSessions) }),
    offer.refereeSessions > 0 ? interpolate(copy.refereeLead, { sessions: sessions(offer.refereeSessions) }) : null,
    offer.minAmountMinor && offer.currency
      ? interpolate(copy.conditionAmount, { amount: formatMoney(locale, offer.minAmountMinor, offer.currency) })
      : offer.packageTitle
        ? interpolate(copy.conditionPackage, { title: offer.packageTitle })
        : null,
    offer.activeTo ? interpolate(copy.until, { date: formatOfferDay(locale, offer.activeTo) }) : null,
  ].filter((line): line is string => line !== null);
}
