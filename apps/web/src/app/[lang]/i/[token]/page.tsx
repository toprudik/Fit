import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { InviteResult, isShownStatus } from "@/components/client-links/invite-result";
import { SignedOutActions } from "@/components/client-links/signed-out-actions";
import { TrainerCard } from "@/components/client-links/trainer-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { serverEnv } from "@/env/server";
import { getDictionary } from "@/i18n/server";
import { clientLinkPath, clientLinkTelegram, isClientLinkToken } from "@/lib/client-links/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  // Closed beta: a trainer's landing stays out of search engines (PRD wave-1 §2.3-1).
  return { title: t.clientLinks.landing.title, robots: { index: false, follow: false } };
}

async function LandingStep({ params }: { params: PageProps<"/[lang]/i/[token]">["params"] }) {
  const [t, { token }] = await Promise.all([getDictionary(), params]);
  const copy = t.clientLinks.landing;
  const invalid = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-title-2">{copy.invalid.title}</h2>
        <p className="text-callout text-ink-2">{copy.invalid.text}</p>
      </div>
      <Button asChild size="lg" block>
        <Link href="/join">{copy.invalid.action}</Link>
      </Button>
    </div>
  );
  if (!isClientLinkToken(token)) return invalid;

  const supabase = await createSupabaseServerClient();
  const [{ data: session }, { data, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("resolve_client_invite", { p_token: token }),
  ]);
  if (error) {
    console.error("resolving a client link failed", error.code);
    return <p className="text-callout text-ink-2">{copy.failed}</p>;
  }
  const invite = data[0];
  if (!isShownStatus(invite)) return invalid;

  if (!session?.claims.sub && invite.status === "valid") {
    // Inside Telegram /login signs in from initData and comes straight back here.
    return (
      <div className="flex flex-col gap-6">
        <TrainerCard
          t={t}
          trainer={{
            firstName: invite.first_name,
            lastName: invite.last_name,
            photoUrl: invite.photo_url,
            headline: invite.headline,
            specialties: invite.specialties ?? [],
            worksOffline: invite.works_offline,
            worksOnline: invite.works_online,
            verified: invite.verified,
          }}
        />
        <p className="text-callout text-ink-2">{copy.signedOutText}</p>
        <SignedOutActions
          telegramHref={clientLinkTelegram(token, serverEnv().TELEGRAM_BOT_USERNAME)}
          loginHref={`/login?next=${encodeURIComponent(clientLinkPath(token))}`}
        />
      </div>
    );
  }
  return <InviteResult t={t} invite={invite} token={token} />;
}

/**
 * Client link landing (screens.md §3.1 "Лендинг ссылки клиента / QR", PRD wave-1 §2.3): the QR and
 * the link open it on the web and in the Mini App (startapp=ci_<token>). It shows the trainer before
 * sign-in; after it "Стать клиентом" makes the pair without the trainer confirming (Q16).
 */
export default async function ClientLinkPage(props: PageProps<"/[lang]/i/[token]">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 pt-[var(--safe-top)] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex flex-col items-start gap-3">
        <DaMark className="size-12" />
        <h1 className="text-large-title">{t.clientLinks.landing.title}</h1>
        <p className="text-callout text-ink-2">{t.clientLinks.landing.lead}</p>
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
