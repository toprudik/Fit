import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { TrialPicker } from "@/components/bookings/trial-picker";
import { JoinButton } from "@/components/client-links/join-button";
import { SignedOutActions } from "@/components/client-links/signed-out-actions";
import { TrainerCard } from "@/components/client-links/trainer-card";
import { TrialTerms } from "@/components/trial-links/trial-terms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { serverEnv } from "@/env/server";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadLiveTrial, loadTrialSlots } from "@/lib/bookings/trial";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTrialToken, trialPath, trialTelegram } from "@/lib/trial-links/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  // Closed beta: a trainer's landing stays out of search engines (PRD wave-1 §2.3-1).
  return { title: t.trialLinks.landing.title, robots: { index: false, follow: false } };
}

function StatusText({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-title-2">{title}</h2>
      <p className="text-callout text-ink-2">{text}</p>
    </div>
  );
}

function Invalid({ t }: { t: Dictionary }) {
  const copy = t.trialLinks.landing.invalid;
  return (
    <div className="flex flex-col gap-6">
      <StatusText title={copy.title} text={copy.text} />
      <Button asChild size="lg" block>
        <Link href="/join">{copy.action}</Link>
      </Button>
    </div>
  );
}

async function TrialStep({ params }: { params: PageProps<"/[lang]/trial/[token]">["params"] }) {
  const [t, locale, { token }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.trialLinks.landing;
  if (!isTrialToken(token)) return <Invalid t={t} />;

  const supabase = await createSupabaseServerClient();
  const [{ data: session }, { data, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("get_trial_link", { p_token: token }),
  ]);
  if (error) {
    console.error("resolving a trial link failed", error.code);
    return <p className="text-callout text-ink-2">{copy.failed}</p>;
  }
  const link = data[0];
  if (!link || link.status === "invalid" || !["valid", "joined", "own", "unavailable"].includes(link.status)) return <Invalid t={t} />;
  if (link.status === "unavailable") return <StatusText title={copy.unavailable.title} text={copy.unavailable.text} />;
  if (link.status === "own") {
    return (
      <div className="flex flex-col gap-6">
        <StatusText title={copy.own.title} text={copy.own.text} />
        <Button asChild size="lg" block>
          <Link href="/trainer/links">{copy.own.action}</Link>
        </Button>
      </div>
    );
  }

  const name = link.name ?? "";
  const userId = session?.claims.sub ?? null;
  const [slots, liveTrial, settings] = await Promise.all([
    loadTrialSlots(supabase, token),
    userId && link.trainer_id ? loadLiveTrial(supabase, userId, link.trainer_id) : null,
    userId ? supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle() : null,
  ]);
  const timeZone = settings?.data?.time_zone ?? DEFAULT_TIME_ZONE;
  const signIn = userId
    ? null
    : {
        telegramHref: trialTelegram(token, serverEnv().TELEGRAM_BOT_USERNAME),
        loginHref: `/login?next=${encodeURIComponent(trialPath(token))}`,
      };

  return (
    <div className="flex flex-col gap-6">
      <TrainerCard
        t={t}
        trainer={{
          firstName: link.name,
          lastName: null,
          photoUrl: link.photo_url,
          headline: link.headline,
          specialties: link.specialties ?? [],
          worksOffline: link.works_offline,
          worksOnline: link.works_online,
          verified: link.verified,
        }}
      />
      <TrialTerms
        t={t}
        locale={locale}
        trial={{
          title: link.title,
          description: link.description,
          durationMin: link.duration_min,
          priceMinor: link.price_minor,
          currency: link.currency,
          mode: link.mode,
          locationName: link.location_name,
          locationAddress: link.location_address,
        }}
      />
      {liveTrial ? (
        <div className="flex flex-col gap-4">
          <StatusText
            title={liveTrial.status === "confirmed" ? t.schedule.trialBooking.confirmedTitle : t.schedule.trialBooking.requestedTitle}
            text={liveTrial.status === "confirmed" ? t.schedule.trialBooking.confirmedText : t.schedule.trialBooking.requestedText}
          />
          <Button asChild size="lg" block>
            <Link href={`/client/bookings/${liveTrial.id}`}>{t.schedule.trialBooking.openBooking}</Link>
          </Button>
        </div>
      ) : slots.length > 0 ? (
        <TrialPicker token={token} timeZone={timeZone} slots={slots} signIn={signIn} />
      ) : link.status === "joined" ? (
        <div className="flex flex-col gap-4">
          <p className="text-callout">{copy.joined.title}</p>
          <Button asChild size="lg" block>
            <Link href="/client/trainers">{copy.joined.action}</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* No free trial time: joining lets the trainer arrange the trial ("Попросить связаться"). */}
          <p className="text-callout text-ink-2">{copy.nextStep}</p>
          {signIn ? (
            <div className="flex flex-col gap-3">
              <p className="text-callout text-ink-2">{copy.signedOutText}</p>
              <SignedOutActions telegramHref={signIn.telegramHref} loginHref={signIn.loginHref} />
            </div>
          ) : (
            <JoinButton trial={token} trainerName={name} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Trial link landing (screens.md §3.1 "Лендинг ссылки на пробное", PRD wave-1 §2.3 rule 4): the
 * trainer and the trial terms before sign-in, on the web and in the Mini App (startapp=tl_<token>),
 * then a free time for the trial and a request to the trainer (§2.3-5). Without free time,
 * "Стать клиентом" makes the pair from the trial link and the trainer arranges the trial.
 */
export default async function TrialLinkPage(props: PageProps<"/[lang]/trial/[token]">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 pt-[var(--safe-top)] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex flex-col items-start gap-3">
        <DaMark className="size-12" />
        <h1 className="text-large-title">{t.trialLinks.landing.title}</h1>
        <p className="text-callout text-ink-2">{t.trialLinks.landing.lead}</p>
      </div>
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <TrialStep params={props.params} />
      </Suspense>
    </main>
  );
}
