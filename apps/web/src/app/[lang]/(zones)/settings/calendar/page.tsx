import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarFeedCard } from "@/components/calendar/calendar-feed-card";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadCalendarFeeds } from "@/lib/calendar/load";
import { formatNoteTime } from "@/lib/pairs/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.calendar.title };
}

async function CalendarFeeds() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.calendar;
  const data = await loadCalendarFeeds();
  if (!data) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/settings/calendar")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }

  const date = (iso: string) => formatNoteTime(locale, iso, data.timeZone);
  return (
    <div className="flex flex-col gap-4">
      {data.zones.map((zone) => {
        const feed = data.feeds.find((item) => item.zone === zone);
        return (
          <CalendarFeedCard
            key={zone}
            zone={zone}
            feed={
              feed
                ? {
                    created: interpolate(copy.created, {
                      date: date(feed.createdAt),
                    }),
                    lastFetch: feed.lastAccessedAt
                      ? interpolate(copy.lastFetch, {
                          date: date(feed.lastAccessedAt),
                        })
                      : copy.neverFetched,
                  }
                : null
            }
          />
        );
      })}
    </div>
  );
}

function HowTo({ copy }: { copy: Awaited<ReturnType<typeof getDictionary>>["calendar"] }) {
  const apps = [copy.howTo.google, copy.howTo.apple, copy.howTo.outlook];
  return (
    <section aria-labelledby="calendar-how-to" className="flex flex-col gap-4">
      <h2 id="calendar-how-to" className="px-1 text-headline">
        {copy.howTo.title}
      </h2>
      {apps.map((app) => (
        <div key={app.title} className="flex flex-col gap-1 px-1">
          <h3 className="text-subhead font-semibold">{app.title}</h3>
          <ol className="list-decimal pl-5 text-callout text-ink-2">
            {app.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
      <p className="px-1 text-footnote text-ink-2">{copy.refreshHint}</p>
    </section>
  );
}

/**
 * "Синхронизация с календарём" (screens.md /settings/calendar, PRD wave-1 §2.7): one ICS feed per zone the
 * user has, the link shown once after creating it, then only its status; how to add it to each calendar.
 * The note under the intro says what the events carry and who gets them (legal Б18).
 */
export default async function CalendarSettingsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.calendar.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-8 pt-4 md:pt-0">
        <div className="flex flex-col gap-2 px-1">
          <p className="text-callout text-ink-2">{t.calendar.intro}</p>
          <p className="text-footnote text-ink-2">{t.calendar.privacyNote}</p>
        </div>
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <CalendarFeeds />
        </Suspense>
        <HowTo copy={t.calendar} />
      </div>
    </Screen>
  );
}
