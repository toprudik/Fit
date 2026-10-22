import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { pickKnown, PUBLIC_BANS } from "@/lib/public-data/consent";

export type ShowcaseTermsRow = { accepted_at: string; bans: string[]; condition: string | null };

/**
 * "Условия обработки данных" under a public showcase (152-FZ art. 10.1 part 10): when the trainer allowed
 * publishing, their bans and their own condition, for everyone who opens the page.
 */
export function ShowcaseTerms({ t, locale, terms }: { t: Dictionary; locale: Locale; terms: ShowcaseTermsRow }) {
  const copy = t.publicData.terms;
  const bans = pickKnown(terms.bans, PUBLIC_BANS);
  // Moscow, as elsewhere when the zone is unknown: the showcase does not expose the trainer's, and the server's is UTC.
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", year: "numeric", timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(terms.accepted_at),
  );
  return (
    <section aria-labelledby="showcase-terms" className="flex flex-col gap-1.5 text-footnote text-ink-2">
      <h2 id="showcase-terms" className="text-subhead text-ink">
        {copy.title}
      </h2>
      <p>{interpolate(copy.since, { date })}</p>
      {bans.map((ban) => (
        <p key={ban}>{copy.bans[ban]}</p>
      ))}
      {terms.condition ? <p className="break-words">{interpolate(copy.condition, { condition: terms.condition })}</p> : null}
      {bans.length === 0 && !terms.condition ? <p>{copy.none}</p> : null}
    </section>
  );
}
