import type { Metadata } from "next";
import { Suspense } from "react";
import { InstallShortcut } from "@/components/activity/install-shortcut";
import { ShortcutToken } from "@/components/activity/shortcut-token";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadMyActivity } from "@/lib/activity/load";
import { formatLocalDay } from "@/lib/passes/present";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.activity.shortcut.title };
}

async function Token() {
  const [locale, data] = await Promise.all([getLocale(), loadMyActivity()]);
  if (!data) return null;
  const day = (iso: string) => formatLocalDay(locale, iso.slice(0, 10));
  return (
    <ShortcutToken
      token={data.token ? { created: day(data.token.createdAt), lastUsed: data.token.lastUsedAt ? day(data.token.lastUsedAt) : null } : null}
    />
  );
}

/**
 * "Шаги с iPhone": the token for the ready iOS shortcut that sends the day's steps, the button that installs it
 * from iCloud and how to finish the setup (wave-2 §4.3, 4.8).
 */
export default async function ShortcutPage() {
  const t = await getDictionary();
  const copy = t.activity.shortcut;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/client/diary/activity" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <p className="text-body text-ink-2">{copy.intro}</p>
        <Suspense fallback={<SkeletonRows rows={2} label={t.common.loading} />}>
          <Token />
        </Suspense>
        <section aria-labelledby="shortcut-how" className="flex flex-col gap-3">
          <h2 id="shortcut-how" className="text-title-3">
            {copy.howTitle}
          </h2>
          <InstallShortcut />
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-body">
            {copy.how.map((step) => (
              <li key={step} className="break-words">
                {step}
              </li>
            ))}
          </ol>
          <p className="text-footnote text-ink-2">{copy.manualWins}</p>
        </section>
      </div>
    </Screen>
  );
}
