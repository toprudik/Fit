import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { JoinButton } from "@/components/client-links/join-button";
import { SignedOutActions } from "@/components/client-links/signed-out-actions";
import { TrainerCard } from "@/components/client-links/trainer-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { serverEnv } from "@/env/server";
import { interpolate, plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/client-links/link";
import { isReferralCode, referralPath, referralTelegram } from "@/lib/referrals/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  // Closed beta: a referral landing stays out of search engines, like the client link (PRD wave-1 §2.3-1).
  return { title: t.referrals.landing.title, robots: { index: false, follow: false } };
}

function StatusText({ title, text }: { title: string; text?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-title-2">{title}</h2>
      {text ? <p className="text-callout text-ink-2">{text}</p> : null}
    </div>
  );
}

async function LandingStep({ params }: { params: PageProps<"/[lang]/r/[code]">["params"] }) {
  const [t, locale, { code }] = await Promise.all([getDictionary(), getLocale(), params]);
  const links = t.clientLinks.landing;
  const copy = t.referrals.landing;
  const invalid = (
    <div className="flex flex-col gap-6">
      <StatusText title={links.invalid.title} text={links.invalid.text} />
      <Button asChild size="lg" block>
        <Link href="/join">{links.invalid.action}</Link>
      </Button>
    </div>
  );
  if (!isReferralCode(code)) return invalid;

  const supabase = await createSupabaseServerClient();
  const [{ data: session }, { data, error }] = await Promise.all([supabase.auth.getClaims(), supabase.rpc("resolve_referral", { p_code: code })]);
  if (error) {
    console.error("resolving a referral link failed", error.code);
    return <p className="text-callout text-ink-2">{links.failed}</p>;
  }
  const link = data[0];
  if (!link || link.status === "invalid") return invalid;
  if (link.status === "unavailable") return <StatusText title={links.unavailable.title} text={links.unavailable.text} />;
  if (link.status === "own") {
    return (
      <div className="flex flex-col gap-6">
        <StatusText title={links.own.title} text={links.own.text} />
        <Button asChild size="lg" block>
          <Link href="/trainer/referrals">{t.referrals.title}</Link>
        </Button>
      </div>
    );
  }

  const trainer = {
    firstName: link.first_name,
    lastName: link.last_name,
    photoUrl: link.photo_url,
    headline: link.headline,
    specialties: link.specialties ?? [],
    worksOffline: link.works_offline,
    worksOnline: link.works_online,
    verified: link.verified,
  };
  const invitation = (
    <div className="flex flex-col gap-1">
      {link.referrer_first_name ? <p className="text-callout">{interpolate(copy.invitedBy, { name: link.referrer_first_name })}</p> : null}
      {link.referee_sessions ? (
        <p className="text-callout text-ink-2">
          {interpolate(copy.refereeBonus, { sessions: plural(locale, link.referee_sessions, t.referrals.sessions) })}
        </p>
      ) : null}
    </div>
  );

  if (link.status === "self") {
    return (
      <div className="flex flex-col gap-6">
        <TrainerCard t={t} trainer={trainer} />
        <p className="text-callout">{copy.self}</p>
        <Button asChild size="lg" block>
          <Link href="/client/trainers">{copy.selfAction}</Link>
        </Button>
      </div>
    );
  }
  if (!session?.claims.sub) {
    // Inside Telegram /login signs in from initData and comes straight back here.
    return (
      <div className="flex flex-col gap-6">
        <TrainerCard t={t} trainer={trainer} />
        {invitation}
        <p className="text-callout text-ink-2">{links.signedOutText}</p>
        <SignedOutActions
          telegramHref={referralTelegram(code, serverEnv().TELEGRAM_BOT_USERNAME)}
          loginHref={`/login?next=${encodeURIComponent(referralPath(code))}`}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <TrainerCard t={t} trainer={trainer} />
      {link.status === "joined" ? (
        <div className="flex flex-col gap-4">
          <p className="text-callout">{links.joined.title}</p>
          <Button asChild size="lg" block>
            <Link href="/client/trainers">{links.joined.action}</Link>
          </Button>
        </div>
      ) : (
        <>
          {invitation}
          <JoinButton referral={code} trainerName={personName(link.first_name, link.last_name)} />
        </>
      )}
    </div>
  );
}

/**
 * Referral landing (screens.md §3.1, PRD wave-3 §3.1-3): a client's link r/<code> opens it on the web and in the
 * Mini App (startapp=rf_<code>). It shows the trainer, who invites and the friend's bonus; "Стать клиентом" makes
 * the pair like the client link and, for someone new to the trainer, a referral waiting for the first payment.
 */
export default async function ReferralPage(props: PageProps<"/[lang]/r/[code]">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 pt-[var(--safe-top)] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex flex-col items-start gap-3">
        <DaMark className="size-12" />
        <h1 className="text-large-title">{t.referrals.landing.title}</h1>
        <p className="text-callout text-ink-2">{t.referrals.landing.lead}</p>
      </div>
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <LandingStep params={props.params} />
      </Suspense>
    </main>
  );
}
