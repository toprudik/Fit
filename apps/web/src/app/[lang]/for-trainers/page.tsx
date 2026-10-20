import type { Metadata } from "next";
import { BellRing, CalendarCheck, ChartLine, QrCode, ShieldCheck, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WaitlistForm, WaitlistJoined } from "@/components/waitlist/waitlist-form";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CALCULATOR_PATH, LANDING_PATH, waitlistSource } from "@/lib/waitlist/waitlist";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.forTrainers.title, description: t.forTrainers.description };
}

const FEATURE_ICONS: Record<keyof Dictionary["forTrainers"]["features"]["items"], LucideIcon> = {
  passes: CalendarCheck,
  reminders: BellRing,
  cancellations: ShieldCheck,
  money: ChartLine,
  progress: Trophy,
  growth: QrCode,
};

/** Who is visiting decides the panel: a trainer already, on the list already, signed in or not. */
async function WaitlistPanel({ searchParams }: { searchParams: PageProps<"/[lang]/for-trainers">["searchParams"] }) {
  const [t, params] = await Promise.all([getDictionary(), searchParams]);
  const copy = t.forTrainers;
  const source = waitlistSource(params);
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;

  if (!userId) {
    return (
      <div className="flex flex-col gap-6">
        <WaitlistForm signedIn={false} name={null} source={source} />
        <div className="flex flex-col gap-2">
          <p className="px-1 text-subhead text-ink-2">{copy.signInText}</p>
          <Button asChild size="lg" block variant="secondary">
            <Link href={`/login?next=${encodeURIComponent(LANDING_PATH)}`}>{copy.signIn}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const [trainer, entry, profile] = await Promise.all([
    supabase.from("trainer_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("trainer_waitlist").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle(),
  ]);
  // Each read only changes what the panel offers: a failed one falls back to the form.
  if (trainer.error) console.error("reading the trainer profile failed", trainer.error.code);
  if (entry.error) console.error("reading the waitlist entry failed", entry.error.code);
  if (profile.error) console.error("reading the profile failed", profile.error.code);

  if (trainer.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-callout text-ink-2">{copy.alreadyTrainer}</p>
        <Button asChild size="lg" block>
          <Link href="/trainer">{copy.openApp}</Link>
        </Button>
      </div>
    );
  }
  if (entry.data) return <WaitlistJoined />;
  return <WaitlistForm signedIn name={profile.data?.first_name ?? null} source={source} />;
}

/**
 * «DaFit для тренеров» (marketing backlog item 10): a public page about DaFit with the trainers' waitlist. It
 * opens without signing in, on the web and in the Mini App; "/" stays the way into the last zone.
 */
export default async function ForTrainersPage(props: PageProps<"/[lang]/for-trainers">) {
  const t = await getDictionary();
  const copy = t.forTrainers;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-16 px-4 pt-[max(var(--safe-top),var(--space-6))] pb-[max(var(--safe-bottom),var(--space-10))] md:px-8">
      <header className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-headline">
          <DaMark className="size-8" />
          DaFit
        </span>
        <Button asChild variant="ghost">
          <Link href="/">{copy.openApp}</Link>
        </Button>
      </header>

      <section aria-labelledby="hero" className="flex max-w-2xl flex-col items-start gap-5">
        <p className="text-subhead font-semibold text-accent-ink">{copy.hero.eyebrow}</p>
        <h1 id="hero" className="text-large-title md:text-[3.5rem] md:leading-[1.05]">
          {copy.hero.title}
        </h1>
        <p className="text-body text-ink-2 md:text-title-3 md:font-normal">{copy.hero.lead}</p>
        <Button asChild size="lg">
          <a href="#waitlist">{copy.hero.action}</a>
        </Button>
        <p className="text-footnote text-ink-2">{copy.hero.beta}</p>
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-6">
        <h2 id="features" className="text-title-1">
          {copy.features.title}
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(FEATURE_ICONS) as (keyof typeof FEATURE_ICONS)[]).map((key) => {
            const Icon = FEATURE_ICONS[key];
            const item = copy.features.items[key];
            return (
              <li key={key} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-5">
                <Icon aria-hidden className="size-6 text-accent" />
                <h3 className="text-headline">{item.title}</h3>
                <p className="text-subhead text-ink-2">{item.text}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="steps" className="flex flex-col gap-6">
        <h2 id="steps" className="text-title-1">
          {copy.steps.title}
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {copy.steps.items.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 font-numeric text-headline">
                {index + 1}
              </span>
              <p className="pt-1.5 text-callout">{step}</p>
            </li>
          ))}
        </ol>
        <p className="max-w-2xl text-callout text-ink-2">{copy.steps.clients}</p>
      </section>

      <section aria-labelledby="calculator" className="flex flex-col items-start gap-3">
        <h2 id="calculator" className="text-title-1">
          {copy.calculator.title}
        </h2>
        <p className="max-w-2xl text-callout text-ink-2">{copy.calculator.text}</p>
        <Button asChild variant="secondary">
          <Link href={CALCULATOR_PATH}>{copy.calculator.action}</Link>
        </Button>
      </section>

      <section id="waitlist" aria-labelledby="waitlist-title" className="flex scroll-mt-6 flex-col gap-4 rounded-xl bg-surface-1 p-5 md:max-w-xl md:p-8">
        <h2 id="waitlist-title" className="text-title-1">
          {copy.waitlist.title}
        </h2>
        <p className="text-callout text-ink-2">{copy.waitlist.text}</p>
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
              <Skeleton className="h-13 w-full" />
              <Skeleton className="h-13 w-full" />
              <Skeleton className="h-13 w-full" />
            </div>
          }
        >
          <WaitlistPanel searchParams={props.searchParams} />
        </Suspense>
      </section>

      <footer className="text-footnote text-ink-2">{copy.footer}</footer>
    </main>
  );
}
