import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { JoinButton } from "@/components/client-links/join-button";
import { SignedOutActions } from "@/components/client-links/signed-out-actions";
import { ShowcaseProfile } from "@/components/showcase/showcase-profile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { serverEnv } from "@/env/server";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { priceGridItems } from "@/lib/packages/present";
import { isShowcaseSlug, normalizeSlug, showcasePath, showcaseTelegram } from "@/lib/showcase/link";
import { showcaseFrom, showcasePricesFrom, type Showcase } from "@/lib/showcase/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTrialToken, trialPath } from "@/lib/trial-links/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  // Closed beta: showcases stay out of search engines (PRD wave-1 §2.3-1).
  return { title: t.showcase.public.title, robots: { index: false, follow: false } };
}

function Unavailable({ t, text }: { t: Dictionary; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-title-1">{t.showcase.public.unavailableTitle}</h1>
      <p className="text-callout text-ink-2">{text}</p>
    </div>
  );
}

/** What the visitor can do: sign in, become a client, open the pair they have, or edit their own page. */
function Actions({ t, showcase, signedIn }: { t: Dictionary; showcase: Showcase; signedIn: boolean }) {
  const copy = t.showcase.public;
  if (!signedIn) {
    // Inside Telegram /login signs in from initData and comes straight back here.
    return (
      <div className="flex flex-col gap-3">
        <p className="text-callout text-ink-2">{copy.signedOutText}</p>
        <SignedOutActions
          telegramHref={showcaseTelegram(showcase.slug, serverEnv().TELEGRAM_BOT_USERNAME)}
          loginHref={`/login?next=${encodeURIComponent(showcasePath(showcase.slug))}`}
        />
      </div>
    );
  }
  if (showcase.isOwn) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-callout text-ink-2">{copy.ownText}</p>
        <Button asChild size="lg" block variant="secondary">
          <Link href="/trainer/showcase">{copy.edit}</Link>
        </Button>
      </div>
    );
  }
  if (showcase.coachingId) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-callout text-ink-2">{copy.joinedText}</p>
        <Button asChild size="lg" block variant="secondary">
          <Link href="/client/trainers">{copy.openTrainers}</Link>
        </Button>
      </div>
    );
  }
  return <JoinButton slug={showcase.slug} trainerName={showcase.name ?? copy.title} />;
}

async function ShowcaseContent({ params }: { params: PageProps<"/[lang]/trainers/[slug]">["params"] }) {
  const [t, { slug: raw }] = await Promise.all([getDictionary(), params]);
  const copy = t.showcase.public;
  const slug = normalizeSlug(raw);
  // A malformed address cannot belong to anyone: answered without the database.
  if (!isShowcaseSlug(slug)) return <Unavailable t={t} text={copy.unavailableText} />;

  const supabase = await createSupabaseServerClient();
  const [locale, { data: session }, { data, error }, prices, trial] = await Promise.all([
    getLocale(),
    supabase.auth.getClaims(),
    supabase.rpc("get_trainer_showcase", { p_slug: slug }),
    supabase.rpc("get_trainer_showcase_prices", { p_slug: slug }),
    supabase.rpc("get_showcase_trial", { p_slug: slug }),
  ]);
  if (error) {
    console.error("loading a showcase failed", error.code);
    return <Unavailable t={t} text={copy.failed} />;
  }
  const showcase = showcaseFrom(data[0]);
  if (!showcase) return <Unavailable t={t} text={copy.unavailableText} />;
  // Prices are extra: a failed read leaves them out instead of closing the page.
  if (prices.error) console.error("loading showcase prices failed", prices.error.code);
  // So is the trial button: the function answers null when there is none to show.
  if (trial.error) console.error("loading the showcase trial failed", trial.error.code);
  const trialToken = isTrialToken(trial.data) ? trial.data : null;

  return (
    <div className="flex flex-col gap-8">
      <ShowcaseProfile t={t} showcase={showcase} prices={priceGridItems(showcasePricesFrom(prices.data), t, locale)} />
      <div className="flex flex-col gap-3">
        <Actions t={t} showcase={showcase} signedIn={Boolean(session?.claims.sub)} />
        {trialToken ? (
          // The trial page shows the terms and slots and asks to sign in only to book.
          <Button asChild size="lg" block variant="secondary">
            <Link href={trialPath(trialToken)}>{copy.trial}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The trainer's showcase (screens.md §3.1 "Витрина тренера", PRD wave-1 §2.3): public, opens without
 * signing in on the web and in the Mini App (startapp=tp_<slug>). A closed showcase (switched off,
 * rejected verification, blocked) and an unknown address both read "Тренер недоступен" (Q60).
 */
export default async function ShowcasePage(props: PageProps<"/[lang]/trainers/[slug]">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-[max(var(--safe-top),var(--space-6))] pb-[max(var(--safe-bottom),var(--space-6))]">
      <DaMark className="size-8" label="DaFit" />
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col items-center gap-4">
            <Skeleton className="size-24 rounded-full" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        <ShowcaseContent params={props.params} />
      </Suspense>
    </main>
  );
}
