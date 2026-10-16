import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotMessagesStep } from "@/components/onboarding/bot-messages-step";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { serverEnv } from "@/env/server";
import { getDictionary } from "@/i18n/server";
import { onboardingNext } from "@/lib/consent/next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.consent.preferences.title };
}

/** The per-request part: where "Далее" leads and the bot's address. */
async function NextSteps({ searchParams }: { searchParams: PageProps<"/[lang]/onboarding/preferences">["searchParams"] }) {
  const [t, params] = await Promise.all([getDictionary(), searchParams]);
  const next = onboardingNext(params.next);
  return (
    <>
      <BotMessagesStep botUrl={`https://t.me/${serverEnv().TELEGRAM_BOT_USERNAME}`} />
      <Button asChild size="lg" block>
        <Link href={next}>{t.consent.preferences.next}</Link>
      </Button>
    </>
  );
}

/**
 * Language and theme after the first acceptance of the beta terms (screens.md §3.1, §4.1 step 4): both
 * are already picked from Telegram, the theme changes live and the language reloads the page, then the
 * bot asks for permission to write. "Далее" opens the screen the user came for.
 */
export default async function PreferencesPage(props: PageProps<"/[lang]/onboarding/preferences">) {
  const t = await getDictionary();
  return (
    <OnboardingScreen>
      <div className="flex flex-col gap-3">
        <h1 className="text-large-title">{t.consent.preferences.title}</h1>
        <p className="text-callout text-ink-2">{t.consent.preferences.intro}</p>
      </div>
      <SettingsPanel />
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <NextSteps searchParams={props.searchParams} />
      </Suspense>
    </OnboardingScreen>
  );
}
