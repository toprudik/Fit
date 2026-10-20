import { Trophy } from "lucide-react";
import { DaRing } from "@/components/brand/da-ring";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadMySeasonChallenge } from "@/lib/season-challenge/load";
import { monthLabel, type SeasonChallenge } from "@/lib/season-challenge/season";
import { SeasonJoinButton } from "./join-button";

/**
 * The DaFit season challenge on the client's «Прогресс» (marketing 12): the month and the rule, «Участвовать» while
 * it runs, the client's attendance once joined, and how it went after the month. Only visits count.
 */
export function SeasonChallengeCard({ t, locale, challenge }: { t: Dictionary; locale: Locale; challenge: SeasonChallenge }) {
  const copy = t.seasonChallenge;
  const month = monthLabel(locale, challenge.month);
  const progress = interpolate(copy.progress, { attended: challenge.attended, missed: challenge.missed, ahead: challenge.ahead });
  return (
    <section aria-labelledby="season-challenge" className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        {challenge.result === "done" ? (
          <DaRing state="done" size={28} />
        ) : (
          <Trophy aria-hidden className="mt-0.5 size-6 shrink-0 text-accent" />
        )}
        <div className="flex flex-col gap-0.5">
          <h2 id="season-challenge" className="text-headline">
            {challenge.title}
          </h2>
          <p className="text-subhead text-ink-2">{interpolate(copy.subtitle, { month })}</p>
        </div>
      </div>
      {challenge.finished ? (
        <p className="text-body">
          {challenge.result === "done" ? copy.done : challenge.result === "missed" ? copy.missedResult : copy.over}
        </p>
      ) : (
        <>
          <p className="text-callout text-ink-2">{copy.rule}</p>
          {challenge.joined ? <p className="text-body">{progress}</p> : null}
          <SeasonJoinButton id={challenge.id} joined={challenge.joined} />
        </>
      )}
    </section>
  );
}

/** Loads the season challenge for the signed-in client; nothing when there is none. */
export async function ClientSeasonChallenge() {
  const [t, locale, challenge] = await Promise.all([getDictionary(), getLocale(), loadMySeasonChallenge()]);
  return challenge ? <SeasonChallengeCard t={t} locale={locale} challenge={challenge} /> : null;
}
